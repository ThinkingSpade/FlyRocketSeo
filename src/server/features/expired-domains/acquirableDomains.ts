import type { resolveDomainAvailability } from "@/server/lib/apiverve/domainAvailability";
import type { ExpirationCache } from "@/server/lib/apiverve/domainExpiration";
import type { hadArchivedSite } from "@/server/lib/wayback";
import {
  buildDomainNameCandidates,
  deriveSeedTerms,
} from "@/shared/domainNameCandidates";

/**
 * Domains in the client's industry that are lapsed and registerable today.
 *
 * This is the half of the finder that answers "show me expired domains I can
 * buy", as opposed to the graph sources, which surface domains in the client's
 * link neighbourhood that are mostly still owned.
 *
 * The cost ordering is the design:
 *
 *   1. generate names from the industry's vocabulary   -- free
 *   2. ask Wayback which ever hosted a site            -- free, no key
 *   3. check availability only for those               -- 5 credits each
 *
 * Doing it the other way round would bill for every generated name, most of
 * which were never registered by anyone. Step 2 is what makes a result an
 * EXPIRED domain rather than an unregistered string.
 */

/** Shapes that read like a real small-business domain. */
const MODIFIERS = [
  "supply",
  "hub",
  "direct",
  "group",
  "co",
  "works",
  "depot",
  "partners",
];
const TLDS = ["com", "net"];
/** Wayback is free but public, and it DOES rate-limit (429 observed). Stay
 *  polite and bounded. */
const ARCHIVE_CONCURRENCY = 3;

/**
 * Hard ceiling on billed availability checks per run, regardless of how many
 * names survive the archive filter.
 *
 * This exists because of a real failure mode: when archive.org rate-limits,
 * every check returns `null`. Inconclusive names are still worth checking --
 * discarding them would drop real targets over someone else's outage -- but
 * without a ceiling a throttled archive turns a run into a full-price sweep of
 * every generated name. The cap is the difference between a degraded run and a
 * surprise bill.
 */
export const MAX_AVAILABILITY_CHECKS = 25;

type AcquirableRow = {
  domain: string;
  /** null when the archive lookup could not answer. */
  hadHistory: boolean | null;
};

type AcquirableSummary = {
  generated: number;
  hadHistory: number;
  availabilityChecked: number;
  /** True when the archive service answered for nothing -- results are weaker. */
  archiveUnavailable: boolean;
};

export async function findAcquirableDomains(input: {
  keywords: string[];
  profileText: string;
  /** Neighbouring-industry words. Where the reach beyond the vertical comes from. */
  adjacentTerms: string[];
  exclude: string[];
  cache: ExpirationCache;
  /** Spend guard: at most this many names reach the availability step. */
  limit: number;
  hadArchivedSite: typeof hadArchivedSite;
  resolveAvailability: typeof resolveDomainAvailability;
}): Promise<{ rows: AcquirableRow[]; summary: AcquirableSummary }> {
  const heads = deriveSeedTerms(input.keywords, input.profileText);
  const names = buildDomainNameCandidates({
    heads,
    adjacents: input.adjacentTerms,
    modifiers: MODIFIERS,
    tlds: TLDS,
    exclude: input.exclude,
    limit: input.limit,
  });

  if (names.length === 0) {
    return {
      rows: [],
      summary: {
        generated: 0,
        hadHistory: 0,
        availabilityChecked: 0,
        archiveUnavailable: false,
      },
    };
  }

  // Step 2, free: which of these were ever real sites.
  const confirmed: AcquirableRow[] = [];
  const inconclusive: AcquirableRow[] = [];
  let answered = 0;
  for (let i = 0; i < names.length; i += ARCHIVE_CONCURRENCY) {
    const batch = names.slice(i, i + ARCHIVE_CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (domain) => {
        try {
          return {
            domain,
            hadHistory: await input.hadArchivedSite(domain, input.cache),
          };
        } catch {
          return { domain, hadHistory: null };
        }
      }),
    );
    for (const entry of settled) {
      if (entry.hadHistory !== null) answered += 1;
      // `null` is inconclusive, NOT "never existed" -- kept, because discarding
      // it would drop a real target over a free service's hiccup. But it goes
      // in a second queue: confirmed history is spent on first.
      if (entry.hadHistory === true) confirmed.push(entry);
      else if (entry.hadHistory === null) inconclusive.push(entry);
    }
  }

  const archiveUnavailable = answered === 0;
  // Confirmed first, then inconclusive only while budget remains.
  const toCheck = [...confirmed, ...inconclusive].slice(
    0,
    MAX_AVAILABILITY_CHECKS,
  );

  // Step 3, billed: only now, and only for survivors.
  const rows: AcquirableRow[] = [];
  let availabilityChecked = 0;
  for (const entry of toCheck) {
    availabilityChecked += 1;
    let available: boolean | null = null;
    try {
      available = await input.resolveAvailability(entry.domain, input.cache);
    } catch {
      available = null;
    }
    if (available === true) rows.push(entry);
  }

  return {
    rows,
    summary: {
      generated: names.length,
      hadHistory: confirmed.length,
      availabilityChecked,
      archiveUnavailable,
    },
  };
}
