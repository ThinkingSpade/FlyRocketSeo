import { createVocabularyMatcher } from "@/shared/domainVocabularyMatch";

/**
 * Pulls days of dropped domains and keeps the ones matching a project's
 * vocabulary.
 *
 * Dependencies are injected so the two rules that matter -- which days get
 * downloaded, and how much a single day may contribute -- are testable without
 * a subscription or a database. A day's file is roughly 2 MB gzipped and
 * 240,000 rows, so neither is a detail.
 */

/**
 * Ceiling on rows one day may add.
 *
 * A broad vocabulary can match many hundreds of names in a single day, and
 * every stored row later costs a DR lookup. The cap keeps a runaway day from
 * flooding the shortlist; `MIN_TERM_LENGTH` in the matcher is the other half
 * of that guard.
 */
export const MAX_MATCHES_PER_DAY = 300;

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Which dates still need pulling, newest first.
 *
 * Today is always excluded: a day's file publishes at 03:00 UTC the FOLLOWING
 * day, so asking for today is a guaranteed miss. Dates already harvested are
 * skipped because the unique index would reject every row anyway -- re-pulling
 * spends a 2 MB download to insert nothing.
 */
export function datesToHarvest(input: {
  today: string;
  already: string[];
  maxDays: number;
}): string[] {
  const alreadyHarvested = new Set(input.already);
  const todayMs = Date.parse(`${input.today}T00:00:00Z`);
  const dates: string[] = [];

  for (let back = 1; back <= input.maxDays; back += 1) {
    const date = toIsoDate(todayMs - back * 86_400_000);
    if (!alreadyHarvested.has(date)) dates.push(date);
  }

  return dates;
}

type HarvestResult = {
  harvestedDates: string[];
  failedDates: string[];
  matched: number;
};

export async function harvestDroppedDomains(input: {
  projectId: string;
  terms: string[];
  exclude: string[];
  dates: string[];
  /**
   * Streams one date's domains through `onDomain`, stopping when it returns
   * false. Streamed rather than returning an array because a day is ~240,000
   * names and buffering them measured 70 ms of CPU against 6 ms streamed.
   */
  streamDropped: (
    date: string,
    onDomain: (domain: string) => boolean,
  ) => Promise<void>;
  insertMatches: (
    rows: Array<{
      id: string;
      projectId: string;
      domain: string;
      matchedTerm: string;
      droppedOn: string;
    }>,
  ) => Promise<void>;
  /**
   * Marks a date processed. Called only after inserts succeed, and called even
   * for a ZERO-match day -- otherwise that day looks unprocessed forever and is
   * re-downloaded on every tick.
   */
  recordRun: (input: {
    projectId: string;
    droppedOn: string;
    matched: number;
  }) => Promise<void>;
}): Promise<HarvestResult> {
  const harvestedDates: string[] = [];
  const failedDates: string[] = [];
  let matched = 0;

  // No vocabulary means every download would be wasted: nothing could match.
  if (input.terms.length === 0 || input.dates.length === 0) {
    return { harvestedDates, failedDates, matched };
  }

  for (const date of input.dates) {
    // The WHOLE day is inside one try: a failed download, a failed insert and a
    // failed record all mean the same thing -- this date is not done, and the
    // next tick must retry it. An escaping insert error used to abort the
    // entire backfill instead of failing one date.
    let dayMatches = 0;
    try {
      const matcher = createVocabularyMatcher({
        terms: input.terms,
        exclude: input.exclude,
        limit: MAX_MATCHES_PER_DAY,
      });
      await input.streamDropped(date, matcher.accept);
      const matches = matcher.matches;

      await input.insertMatches(
        matches.map((match) => ({
          id: crypto.randomUUID(),
          projectId: input.projectId,
          domain: match.domain,
          matchedTerm: match.matchedTerm,
          droppedOn: date,
        })),
      );

      // Only after every insert succeeded. Recorded even at zero matches --
      // otherwise the day looks unprocessed and is re-downloaded every tick.
      await input.recordRun({
        projectId: input.projectId,
        droppedOn: date,
        matched: matches.length,
      });
      dayMatches = matches.length;
    } catch {
      failedDates.push(date);
      continue;
    }

    harvestedDates.push(date);
    matched += dayMatches;
  }

  return { harvestedDates, failedDates, matched };
}
