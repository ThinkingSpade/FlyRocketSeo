const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Availability is cached in KV for one day. Re-checking an answered row sooner
 * would only replay that cached answer while making the stored check look new.
 */
export const HARVEST_AVAILABILITY_RECHECK_MS = DAY_MS;

/** A single explicit click may never submit more than 25 billed lookups. */
export const MAX_HARVEST_AVAILABILITY_BATCH = 25;

type HarvestAvailabilityRow = {
  domain: string;
  isAvailable: boolean | null;
  availabilityCheckedAt: string | null;
};

/** Unknown and never-checked rows are due; answered rows age out after a day. */
export function isHarvestAvailabilityDue(
  row: Pick<HarvestAvailabilityRow, "isAvailable" | "availabilityCheckedAt">,
  nowMs: number,
): boolean {
  // null is UNKNOWN, not taken. A lookup that did not answer remains eligible
  // for an explicit retry even when its attempted-at timestamp is recent.
  if (row.isAvailable === null) return true;

  if (row.availabilityCheckedAt === null) return true;
  const checkedAtMs = Date.parse(row.availabilityCheckedAt);
  if (Number.isNaN(checkedAtMs)) return true;

  return nowMs - checkedAtMs >= HARVEST_AVAILABILITY_RECHECK_MS;
}

/**
 * Pick the rows an explicit availability click may submit, preserving the
 * displayed ranking while stopping at the hard 25-domain spend ceiling.
 */
export function selectDueHarvestAvailabilityDomains(
  rows: readonly HarvestAvailabilityRow[],
  nowMs: number,
): string[] {
  const domains: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!isHarvestAvailabilityDue(row, nowMs)) continue;

    const domain = row.domain.trim().toLowerCase();
    if (domain.length === 0 || seen.has(domain)) continue;

    seen.add(domain);
    domains.push(domain);
    if (domains.length === MAX_HARVEST_AVAILABILITY_BATCH) break;
  }

  return domains;
}

/** Compact deterministic age for the table; null omits invalid timestamps. */
export function formatHarvestAvailabilityAge(
  checkedAtIso: string | null,
  nowMs: number,
): string | null {
  if (checkedAtIso === null) return null;
  const checkedAtMs = Date.parse(checkedAtIso);
  if (Number.isNaN(checkedAtMs)) return null;

  const elapsedMs = Math.max(0, nowMs - checkedAtMs);
  if (elapsedMs < MINUTE_MS) return "just now";
  if (elapsedMs < HOUR_MS) {
    return `${Math.floor(elapsedMs / MINUTE_MS)}m ago`;
  }
  if (elapsedMs < DAY_MS) {
    return `${Math.floor(elapsedMs / HOUR_MS)}h ago`;
  }
  return `${Math.floor(elapsedMs / DAY_MS)}d ago`;
}
