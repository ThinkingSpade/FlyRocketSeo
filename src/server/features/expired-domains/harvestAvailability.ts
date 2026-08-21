import {
  isHarvestAvailabilityDue,
  MAX_HARVEST_AVAILABILITY_BATCH,
} from "@/shared/harvestAvailability";

type HarvestedAvailabilityRow = {
  id: string;
  domain: string;
  isAvailable: boolean | null;
  availabilityCheckedAt: string | null;
};

type HarvestAvailabilityDependencies = {
  listForProject: (projectId: string) => Promise<HarvestedAvailabilityRow[]>;
  resolveAvailability: (domain: string) => Promise<boolean | null>;
  setAvailability: (
    id: string,
    isAvailable: boolean | null,
    checkedAtIso: string,
  ) => Promise<void>;
  now: () => Date;
};

/**
 * Refresh explicitly requested availability answers without becoming a
 * general-purpose paid lookup endpoint.
 *
 * All I/O is injected so the spend guards stay testable in Node: names are
 * deduplicated, capped, restricted to this project's harvested rows, and fresh
 * answers are skipped. A null resolver result remains null (unknown).
 */
export async function refreshHarvestedAvailability(
  input: { projectId: string; domains: string[] },
  dependencies: HarvestAvailabilityDependencies,
): Promise<Record<string, boolean | null>> {
  const now = dependencies.now();
  const stored = await dependencies.listForProject(input.projectId);
  const byDomain = new Map(stored.map((row) => [row.domain, row]));
  const seen = new Set<string>();
  const result: Record<string, boolean | null> = {};
  let checked = 0;

  for (const rawDomain of input.domains) {
    if (checked >= MAX_HARVEST_AVAILABILITY_BATCH) break;

    const domain = rawDomain.trim().toLowerCase();
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);

    const row = byDomain.get(domain);
    if (!row || !isHarvestAvailabilityDue(row, now.getTime())) continue;

    checked += 1;
    let available: boolean | null = null;
    try {
      available = await dependencies.resolveAvailability(domain);
    } catch {
      available = null;
    }

    result[domain] = available;
    await dependencies.setAvailability(row.id, available, now.toISOString());
  }

  return result;
}
