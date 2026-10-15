import { normalizeComparisonTarget } from "@/shared/backlink-targets";

/**
 * Backlinks, referring domains and spam score for a batch of harvested domains.
 *
 * Three DataForSEO bulk requests answer the whole batch, so a day's harvest
 * costs three request fees plus a fraction of a cent per domain -- not three
 * calls per domain. All I/O is injected so the rules are testable without a
 * key or a bill.
 *
 * All-or-nothing on purpose. A stored row means "checked" and is never paid
 * for again, so storing a row after one of the three requests failed would make
 * that metric permanently blank. If any request fails nothing is written, and
 * the batch is retried on a later tick.
 */

type LinkTarget = { id: string; domain: string };

type BulkItem<K extends string> = { target?: string | null } & {
  [key in K]?: number | null;
};

export type LinkMetricRow = {
  harvestedDomainId: string;
  projectId: string;
  backlinks: number | null;
  referringDomains: number | null;
  spamScore: number | null;
  checkedAt: string;
};

function indexByTarget<K extends string>(
  items: BulkItem<K>[],
  key: K,
): Map<string, number | null> {
  const index = new Map<string, number | null>();
  for (const item of items) {
    const target = normalizeComparisonTarget(item.target);
    // DataForSEO does not promise response order and may repeat a target;
    // the first populated answer wins.
    if (target === "" || index.get(target) != null) continue;
    const value = item[key];
    index.set(
      target,
      typeof value === "number" && Number.isFinite(value)
        ? Math.round(value)
        : null,
    );
  }
  return index;
}

export async function collectLinkMetrics(
  input: { projectId: string; targets: LinkTarget[]; now: () => Date },
  deps: {
    fetchBacklinks(targets: string[]): Promise<BulkItem<"backlinks">[]>;
    fetchReferringDomains(
      targets: string[],
    ): Promise<BulkItem<"referring_domains">[]>;
    fetchSpamScores(targets: string[]): Promise<BulkItem<"spam_score">[]>;
    insert(rows: LinkMetricRow[]): Promise<void>;
  },
): Promise<{ checked: number; withLinks: number }> {
  if (input.targets.length === 0) return { checked: 0, withLinks: 0 };

  const domains = [
    ...new Set(
      input.targets.map((target) => normalizeComparisonTarget(target.domain)),
    ),
  ].filter((domain) => domain !== "");

  const [backlinks, referringDomains, spamScores] = await Promise.all([
    deps.fetchBacklinks(domains),
    deps.fetchReferringDomains(domains),
    deps.fetchSpamScores(domains),
  ]);
  const backlinksBy = indexByTarget(backlinks, "backlinks");
  const referringBy = indexByTarget(referringDomains, "referring_domains");
  const spamBy = indexByTarget(spamScores, "spam_score");

  const checkedAt = input.now().toISOString();
  // A domain DataForSEO returned nothing for still gets a row of nulls: it
  // was asked about, and asking again tomorrow would cost the same answer.
  const rows = input.targets.map((target): LinkMetricRow => {
    const domain = normalizeComparisonTarget(target.domain);
    return {
      harvestedDomainId: target.id,
      projectId: input.projectId,
      backlinks: backlinksBy.get(domain) ?? null,
      referringDomains: referringBy.get(domain) ?? null,
      spamScore: spamBy.get(domain) ?? null,
      checkedAt,
    };
  });

  await deps.insert(rows);
  return {
    checked: rows.length,
    withLinks: rows.filter((row) => (row.referringDomains ?? 0) > 0).length,
  };
}
