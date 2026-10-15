/**
 * When an unattended profile draft may run again.
 *
 * The auto-draft claims its row BEFORE crawling, and a failed draft leaves that
 * claimed row behind -- empty, unconfirmed, `source: "ai"`. Read literally, the
 * original "exactly once" rule turned one bad afternoon into a permanent state:
 * every production auto-draft so far ended exactly like that, and a project
 * with an empty profile and no tracked keywords has no industry vocabulary, so
 * the deleted-domain harvest could never run for it.
 *
 * A failed draft is therefore retried, but no more than once per window. The
 * window bounds the worst case at one crawl and one model call per project per
 * day, and only while the row is still untouched: anything a human saved, and
 * any draft that produced text, is never redrafted unattended.
 *
 * Pure so the cron's eligibility check, the panel's status line and the
 * repository's reclaim all read the same rule.
 */
export const AUTO_DRAFT_RETRY_MS = 24 * 60 * 60 * 1000;

type DraftRowSnapshot = {
  offer: string;
  customer: string;
  exclusions: string;
  brandTerms: string;
  source: "ai" | "manual";
  confirmedAt: string | null;
  draftedAt: string | null;
};

/**
 * An unattended draft that claimed the row and then produced nothing.
 *
 * Literal empty strings, not trimmed ones, because this must mean exactly what
 * the reclaim UPDATE's WHERE clause means. If the two disagreed, the cron could
 * keep choosing a project that the reclaim then refuses -- on every tick.
 */
export function isEmptyAutoDraft(row: DraftRowSnapshot): boolean {
  return (
    row.source === "ai" &&
    row.confirmedAt === null &&
    row.offer === "" &&
    row.customer === "" &&
    row.exclusions === "" &&
    row.brandTerms === ""
  );
}

/** ISO cutoff: an empty auto-draft claimed before this may be claimed again. */
export function autoDraftRetryCutoffIso(nowMs: number): string {
  return new Date(nowMs - AUTO_DRAFT_RETRY_MS).toISOString();
}

/**
 * Whether an unattended draft may run for this project now.
 *
 * No row at all is the first attempt. Otherwise the timestamp is compared AS
 * TEXT against the ISO cutoff, with NULL counting as due -- the same predicate
 * `reclaimFailedDraft` runs in SQL -- so "due" here always means the reclaim
 * will succeed (bar a concurrent winner).
 */
export function isAutoDraftDue(
  row: DraftRowSnapshot | null,
  nowMs: number,
): boolean {
  if (!row) return true;
  if (!isEmptyAutoDraft(row)) return false;
  return (
    row.draftedAt === null || row.draftedAt < autoDraftRetryCutoffIso(nowMs)
  );
}
