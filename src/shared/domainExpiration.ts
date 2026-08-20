/**
 * Domain expiry facts, and every value derived from them.
 *
 * Two rules live here, both load-bearing.
 *
 * 1. Only the ABSOLUTE dates are ever stored. APIVerve computes
 *    `daysToExpiration`, `domainAgeDays` and `daysSinceLastUpdate` at call
 *    time, so caching those numbers means that on day N of the TTL they are N
 *    days wrong -- silently, and in the dangerous direction: a domain three
 *    days from dropping would read as ten. Callers pass the clock in and the
 *    day counts are recomputed on every read.
 *
 * 2. The status thresholds are OURS. APIVerve names four buckets but does not
 *    publish the cutoffs, and since the day counts are recomputed locally,
 *    trusting their string would let status and days disagree in one view.
 *
 * This module is deliberately free of any `cloudflare:workers` import so that
 * Vitest (node environment) can reach it -- see `ahrefsRating.ts` for the last
 * time a rule in this repo went untested because it lived in a server-only
 * module, and was wrong the whole time.
 */

export type DomainExpirationStatus =
  | "expired"
  | "critical"
  | "warning"
  | "healthy";

/** The absolute facts as returned by APIVerve. The only thing we cache. */
export type DomainExpirationFacts = {
  domain: string;
  expirationDate: string | null;
  createdDate: string | null;
  lastUpdatedDate: string | null;
};

/** Facts plus everything derived from the clock at read time. */
export type DomainExpiration = DomainExpirationFacts & {
  daysToExpiration: number | null;
  domainAgeDays: number | null;
  domainAgeYears: number | null;
  daysSinceLastUpdate: number | null;
  status: DomainExpirationStatus | null;
};

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

export const CRITICAL_MAX_DAYS = 30;
export const WARNING_MAX_DAYS = 90;

/** `null` in means `null` out: an unknown day count must never read as healthy. */
export function statusFromDaysToExpiration(
  days: number | null,
): DomainExpirationStatus | null {
  if (days == null) return null;
  if (days <= 0) return "expired";
  if (days <= CRITICAL_MAX_DAYS) return "critical";
  if (days <= WARNING_MAX_DAYS) return "warning";
  return "healthy";
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function wholeDaysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / MS_PER_DAY);
}

export function deriveDomainExpiration(
  facts: DomainExpirationFacts,
  nowMs: number,
): DomainExpiration {
  const expiresMs = parseTimestamp(facts.expirationDate);
  const createdMs = parseTimestamp(facts.createdDate);
  const updatedMs = parseTimestamp(facts.lastUpdatedDate);

  const daysToExpiration =
    expiresMs == null ? null : wholeDaysBetween(nowMs, expiresMs);
  const domainAgeDays =
    createdMs == null ? null : wholeDaysBetween(createdMs, nowMs);

  return {
    ...facts,
    daysToExpiration,
    domainAgeDays,
    domainAgeYears:
      domainAgeDays == null
        ? null
        : Math.round((domainAgeDays / DAYS_PER_YEAR) * 10) / 10,
    daysSinceLastUpdate:
      updatedMs == null ? null : wholeDaysBetween(updatedMs, nowMs),
    status: statusFromDaysToExpiration(daysToExpiration),
  };
}
