import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table } from "@cloudflare/kumo/components/table";
import { exportSavedKeywords } from "@/serverFunctions/keywords";
import {
  useKeywordFit,
  useProjectProfile,
} from "@/client/features/profiles/useProjectProfile";
import { computeSavedPortfolio } from "@/client/features/saved-keywords/savedPortfolio";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";
import { Section, Tile } from "@/client/features/report/ReportPrimitives";
import {
  ReportCallout,
  ReportHeroStats,
  ReportNarrative,
} from "@/client/features/report/ReportChrome";
import type {
  ChapterCollector,
  ReportPageSpec,
} from "@/client/features/report/reportChapters";

/**
 * "What are you actually going after for me" — the saved keyword shortlist.
 *
 * Free and durable: plain `saved_keywords` rows LEFT JOINed to
 * `keyword_metrics`, not a stored analysis run, so there is no TTL, no restore
 * verdict and no expiry sentence. Every row is scoped by `projectId` and
 * carries no domain, so no domain gate is needed — a competitor's data cannot
 * arrive here.
 *
 * Because the join is a LEFT join, metric coverage is routinely partial:
 * keywords saved from Search Performance carry no volume and no difficulty
 * until someone pays for a refresh. Every count on this sheet therefore names
 * the population it is over — see `SavedKeywordsCoverage`.
 */

const TITLE = "The keywords we're targeting";

/**
 * `READ_FAILED` is word-for-word what `describeFailedReads` produces for the
 * subject "the saved keyword shortlist"; it is duplicated only because this
 * chapter ships self-contained. Whoever wires it up should add a
 * `savedKeywords` key to reportReads.ts AND remove "Saved Keywords" from
 * `NOT_COVERED` in reportChapters.tsx — `ReportCoverage` prints omissions and
 * not-covered on one sheet, so leaving it there makes the report print this
 * chapter and then tell the client the report has no chapter for it.
 */
const READ_FAILED =
  "The saved keyword shortlist could not be read while this report was generated — that request failed rather than returning nothing.";
/** "Never run" and "ran and returned nothing" are one DB answer here, so the
 *  split is on the real seam: nothing saved, versus an empty metrics join. */
const NEVER_SAVED = "No keyword shortlist has been saved for this project yet.";
const NO_VOLUMES =
  "A keyword shortlist has been saved for this project, but no search volumes have been fetched for those keywords, so the list could not be sized for this report.";
/** The page can be printed mid-load, and an in-flight read is neither present
 *  nor absent. Without this a slow read prints as "nothing has been saved". */
const STILL_LOADING =
  "The saved keyword shortlist was still loading when this report was generated.";

const STALE_TIME = 10 * 60_000;
const TABLE_ROWS = 10;

/** Only the columns this sheet prints, so the builder stays testable. */
export type SavedKeywordsChapterRow = {
  /** `saved_keywords.id` — the keyword alone is NOT unique within a project. */
  id: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  intent: string | null;
  /** When the figures were fetched, not when the row was saved. */
  fetchedAt: string | null;
};

/**
 * Which population each figure is over. `saved` is every saved keyword;
 * `priced`/`scored` are the rows the metrics join filled in. They diverge in
 * the ordinary case, and a headline pairing `saved` with a total computed from
 * `priced` reads as a claim about all of them.
 */
type SavedKeywordsCoverage = {
  saved: number;
  priced: number;
  scored: number;
};

export function summarizeCoverage(
  rows: readonly SavedKeywordsChapterRow[],
): SavedKeywordsCoverage {
  let priced = 0;
  let scored = 0;
  for (const row of rows) {
    if (row.searchVolume !== null) priced += 1;
    if (row.keywordDifficulty !== null) scored += 1;
  }
  return { saved: rows.length, priced, scored };
}

/**
 * Whether the low-difficulty count could be checked against what the client
 * sells. `not-configured` means there is nothing to check against, so the
 * count is complete; `unavailable` means the profile read failed or had not
 * landed, so exclusions we cannot see may apply and the count is only an upper
 * bound — not a number to print at a client.
 */
export type SavedKeywordsFitStatus =
  | "applied"
  | "not-configured"
  | "unavailable";

/**
 * The whole saved set, not page one: `exportSavedKeywords` is the list read
 * with `pageSize` omitted. Pure repository read — no provider client on the
 * path, and the one metered call (`refreshSavedKeywordMetrics`) is untouched.
 *
 * Key `["savedKeywords", projectId, "report"]` cannot collide with the tab's
 * or the strip's (both include live filter state), while the shared prefix
 * keeps saves, removals and metric refreshes invalidating this one.
 */
export function usesavedKeywordsReportData(projectId: string) {
  const query = useQuery({
    queryKey: ["savedKeywords", projectId, "report"],
    queryFn: () =>
      exportSavedKeywords({
        data: { projectId, sort: "createdAt", order: "desc" },
      }),
    staleTime: STALE_TIME,
  });

  const rows = useMemo<SavedKeywordsChapterRow[]>(
    () =>
      (query.data?.rows ?? []).map((row) => ({
        id: row.id,
        keyword: row.keyword,
        locationCode: row.locationCode,
        languageCode: row.languageCode,
        searchVolume: row.searchVolume,
        keywordDifficulty: row.keywordDifficulty,
        intent: row.intent,
        fetchedAt: row.fetchedAt,
      })),
    [query.data],
  );

  // The fit map is empty in three different situations — no profile saved, a
  // profile too thin to classify with, and a profile read that failed or has
  // not landed — and only the last makes the low-difficulty count untrustworthy
  // (and, on a cold cache, nondeterministic). `fit.size` cannot tell them
  // apart, so the status is reported alongside it.
  const {
    profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useProjectProfile(projectId);
  const keywords = useMemo(() => rows.map((row) => row.keyword), [rows]);
  const fit = useKeywordFit(profile, keywords);
  const portfolio = useMemo(
    () => computeSavedPortfolio(rows, fit),
    [rows, fit],
  );
  const fitStatus: SavedKeywordsFitStatus =
    profileError || profileLoading
      ? "unavailable"
      : fit.size > 0
        ? "applied"
        : "not-configured";

  return {
    rows,
    portfolio,
    fitStatus,
    isError: query.isError,
    isPending: query.isPending,
  };
}

export type savedKeywordsReportData = ReturnType<
  typeof usesavedKeywordsReportData
>;

/**
 * SQLite stores "2026-08-11 13:24:05" (space separated, UTC, no zone marker);
 * Postgres stores an ISO instant. `new Date` reads the first form as LOCAL
 * time, which lands the printed date on the wrong day west of UTC and makes
 * the two backends disagree. Normalize the bare form before parsing.
 */
function parseStoredTimestamp(value: string): Date | null {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Oldest and newest fetch across the rows that actually contribute a figure.
 *
 * `fetchedAt` is written per keyword at upsert time, and a refresh leaves rows
 * the provider returned nothing for holding their old figures AND their old
 * timestamp — so a list built up over months carries a spread of dates. The
 * newest is not this sheet's provenance: it would date a year-old number to
 * yesterday. Print the span, led by the oldest.
 */
function fetchedRange(
  rows: readonly SavedKeywordsChapterRow[],
): { oldest: Date; newest: Date } | null {
  let oldest: Date | null = null;
  let newest: Date | null = null;
  for (const row of rows) {
    if (row.searchVolume === null && row.keywordDifficulty === null) continue;
    if (!row.fetchedAt) continue;
    const parsed = parseStoredTimestamp(row.fetchedAt);
    if (!parsed) continue;
    if (oldest === null || parsed < oldest) oldest = parsed;
    if (newest === null || parsed > newest) newest = parsed;
  }
  return oldest && newest ? { oldest, newest } : null;
}

/** Formatted in UTC, matching the instant the normalizer produced. */
function formatAsOf(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The only date claim this sheet makes, and it never overstates freshness. */
export function describeFetchedAt(
  rows: readonly SavedKeywordsChapterRow[],
): string {
  const range = fetchedRange(rows);
  if (!range) {
    return "Search volumes and difficulty are shown as last fetched for this project; generating this report does not refresh them.";
  }
  const oldest = formatAsOf(range.oldest);
  const newest = formatAsOf(range.newest);
  if (oldest === newest) {
    return `Search volumes and difficulty were fetched on ${oldest}; generating this report does not refresh them.`;
  }
  return `Search volumes and difficulty were fetched between ${oldest} and ${newest} — each keyword's figures are as old as the day that keyword was last fetched. Generating this report does not refresh them.`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function formatIntent(intent: string | null): string {
  if (!intent) return "—";
  return intent.charAt(0).toUpperCase() + intent.slice(1).toLowerCase();
}

const LOCATION_LABELS = new Map<number, string>(
  LOCATION_OPTIONS.map((option) => [option.code, option.label]),
);

export function marketLabel(
  row: SavedKeywordsChapterRow,
  withLanguage: boolean,
): string {
  const label =
    LOCATION_LABELS.get(row.locationCode) ?? `Location ${row.locationCode}`;
  return withLanguage ? `${label} · ${row.languageCode.toUpperCase()}` : label;
}

/** The printed rows span more than one market, so the column has to appear. */
export function spansMultipleMarkets(
  rows: readonly SavedKeywordsChapterRow[],
): boolean {
  const markets = rows.map((row) => `${row.locationCode}:${row.languageCode}`);
  return new Set(markets).size > 1;
}

type SavedKeywordsPortfolio = savedKeywordsReportData["portfolio"];

/** What an average difficulty means, in words rather than a score. */
function difficultyBand(averageDifficulty: number): string {
  if (averageDifficulty < 30) {
    return "low-competition — steady on-page and content work should be enough to move it";
  }
  if (averageDifficulty < 60) {
    return "moderately competitive: expect some of it to move quickly and the rest to need sustained work";
  }
  return "competitive, so results will come from sustained content and link building rather than quick fixes";
}

/** A verdict is only ever claimed over the rows that carry a score. */
function describeDifficulty(
  averageDifficulty: number | null,
  coverage: SavedKeywordsCoverage,
): string {
  if (averageDifficulty === null) {
    return "Difficulty scores have not been fetched for this list, so how hard each one is to win is not sized here.";
  }
  const band = difficultyBand(averageDifficulty);
  if (coverage.scored === coverage.saved) {
    return `At an average difficulty of ${averageDifficulty} out of 100, this list is ${band}.`;
  }
  const unscored = formatNumber(coverage.saved - coverage.scored);
  return `Difficulty has been scored for ${formatNumber(coverage.scored)} of the ${formatNumber(coverage.saved)} keywords. At an average difficulty of ${averageDifficulty} out of 100 across those, that part of the list is ${band}. The other ${unscored} carry no difficulty score, so this is not a verdict on the whole list.`;
}

/**
 * Zero needs no caveat: the fit map can only ever remove keywords from this
 * count, so zero is right whether or not the profile was readable. Any other
 * number with the profile unread is an upper bound, so it is not printed at
 * all and the sheet says why instead.
 */
function describeQuickWins(
  portfolio: SavedKeywordsPortfolio,
  coverage: SavedKeywordsCoverage,
  fitStatus: SavedKeywordsFitStatus,
): string | null {
  // `offTargetQuickWins`, never `offTarget`: the sentence below says these were
  // "left out of that count", and only keywords that cleared every other bar
  // ever were. A wrong-customer keyword at KD 80 was never a candidate, so
  // counting it here tells the client we filtered work we never filtered.
  const { quickWins, offTargetQuickWins: offTarget } = portfolio;
  if (quickWins === 0) return null;
  if (fitStatus === "unavailable") {
    return "We could not read this project's business profile while this report was generated, so the low-difficulty shortlist is not counted here: that count sets aside keywords aimed at the wrong customer, and without the profile we cannot tell which those are.";
  }
  const base = `${formatNumber(quickWins)} of the ${formatNumber(coverage.scored)} scored keywords are low-difficulty targets with real search volume behind them — that is where we expect to see movement first.`;
  if (fitStatus !== "applied" || offTarget === 0) return base;
  const verb = offTarget === 1 ? "keyword is" : "keywords are";
  const pronoun = offTarget === 1 ? "it" : "them";
  return `${base} A further ${formatNumber(offTarget)} ${verb} left out of that count because your profile marks ${pronoun} as the wrong customer.`;
}

/**
 * Prose over the same portfolio the tiles read, and the same coverage counts,
 * so neither can generalise a partial join into a claim about the whole list.
 */
export function buildSavedKeywordsNarrative(
  portfolio: SavedKeywordsPortfolio,
  coverage: SavedKeywordsCoverage,
  fitStatus: SavedKeywordsFitStatus,
): string[] {
  const { saved, priced } = coverage;
  const volume = formatNumber(portfolio.totalVolume);
  const noun = saved === 1 ? "keyword" : "keywords";
  const paragraphs = [
    priced === saved
      ? `We are targeting ${formatNumber(saved)} ${noun} for you, together representing ${volume} searches a month.`
      : `We are targeting ${formatNumber(saved)} ${noun} for you. Search volumes have been fetched for ${formatNumber(priced)} of them, and those ${formatNumber(priced)} represent ${volume} searches a month; the other ${formatNumber(saved - priced)} have no volume data yet, so nothing on this page sizes them.`,
    describeDifficulty(portfolio.averageDifficulty, coverage),
  ];
  const quickWins = describeQuickWins(portfolio, coverage, fitStatus);
  if (quickWins) paragraphs.push(quickWins);
  return paragraphs;
}

type ReportStat = { label: string; value: string };

/**
 * Every figure the sheet prints, each labelled with the population it is over.
 * "Keywords targeted" is the true saved total; the other three say so when
 * they are computed from a subset. The second tile is "Low-difficulty
 * targets", never "Quick wins" — another chapter prints "Quick wins —
 * striking distance" meaning GSC keywords ranking 5–20 — and it is left off
 * entirely when the profile read could not confirm the count.
 */
export function buildSavedKeywordsFigures(
  portfolio: SavedKeywordsPortfolio,
  coverage: SavedKeywordsCoverage,
  fitStatus: SavedKeywordsFitStatus,
): { hero: ReportStat[]; tiles: ReportStat[] } {
  const { saved, priced, scored } = coverage;
  const of = `of ${formatNumber(saved)}`;
  const hero: ReportStat[] = [
    { label: "Keywords targeted", value: formatNumber(saved) },
    {
      label:
        priced === saved
          ? "Combined monthly searches"
          : `Monthly searches (${formatNumber(priced)} ${of} keywords)`,
      value: formatNumber(portfolio.totalVolume),
    },
  ];
  const tiles: ReportStat[] = [
    {
      label:
        scored === saved
          ? "Average difficulty"
          : `Average difficulty (${formatNumber(scored)} ${of} scored)`,
      value:
        portfolio.averageDifficulty === null
          ? "—"
          : String(portfolio.averageDifficulty),
    },
  ];
  if (fitStatus !== "unavailable" || portfolio.quickWins === 0) {
    tiles.push({
      label: "Low-difficulty targets",
      value: formatNumber(portfolio.quickWins),
    });
  }
  return { hero, tiles };
}

/** The table shows priced rows only, capped — both facts have to be said. */
export function targetListSubtitle(
  shown: number,
  coverage: SavedKeywordsCoverage,
): string {
  if (shown < coverage.priced) {
    return `The top ${formatNumber(shown)} of ${formatNumber(coverage.priced)} saved keywords with search volume, largest opportunity first.`;
  }
  if (coverage.priced < coverage.saved) {
    return `All ${formatNumber(coverage.priced)} saved keywords with search volume, largest opportunity first.`;
  }
  return "The saved keywords we're working toward, largest opportunity first.";
}

/**
 * Saved keywords are unique on (project, keyword, location, language), so the
 * same term legitimately appears twice with different figures. The market
 * column appears only when the printed rows span more than one — without it
 * those rows read as a contradiction, and `key` on the keyword collides.
 */
function TargetListTable({
  rows,
}: {
  rows: readonly SavedKeywordsChapterRow[];
}) {
  const showMarket = spansMultipleMarkets(rows);
  const showLanguage = new Set(rows.map((row) => row.languageCode)).size > 1;
  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Keyword</Table.Head>
            {showMarket ? <Table.Head>Market</Table.Head> : null}
            <Table.Head className="text-right">Monthly searches</Table.Head>
            <Table.Head className="text-right">Difficulty</Table.Head>
            <Table.Head>Intent</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.id}>
              <Table.Cell className="max-w-xs">
                <span className="line-clamp-1">{row.keyword}</span>
              </Table.Cell>
              {showMarket ? (
                <Table.Cell>{marketLabel(row, showLanguage)}</Table.Cell>
              ) : null}
              <Table.Cell className="text-right tabular-nums">
                {row.searchVolume === null
                  ? "—"
                  : formatNumber(row.searchVolume)}
              </Table.Cell>
              <Table.Cell className="text-right tabular-nums">
                {row.keywordDifficulty ?? "—"}
              </Table.Cell>
              <Table.Cell>{formatIntent(row.intent)}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}

/**
 * Adds the chapter, or drops it with the reason a client can act on.
 *
 * The gate: rows must exist AND at least one must carry a search volume. A
 * saved list with an empty metrics join would otherwise print two em-dash
 * tiles and an em-dash column, and a sheet of dashes in a client's hands is
 * worse than a line on the coverage list. `sections` is accepted for signature
 * parity; this chapter renders entirely from its own read.
 */
export function buildsavedKeywordsChapter(
  data: savedKeywordsReportData,
  out: ChapterCollector,
  sections?: unknown,
): void {
  void sections;

  // A failed read outranks every "nothing here" verdict, always.
  if (data.isError) {
    out.drop(TITLE, READ_FAILED);
    return;
  }
  if (data.isPending) {
    out.drop(TITLE, STILL_LOADING);
    return;
  }
  if (data.rows.length === 0) {
    out.drop(TITLE, NEVER_SAVED);
    return;
  }

  const coverage = summarizeCoverage(data.rows);
  if (coverage.priced === 0) {
    out.drop(TITLE, NO_VOLUMES);
    return;
  }

  const { portfolio, fitStatus } = data;
  const figures = buildSavedKeywordsFigures(portfolio, coverage, fitStatus);
  const topRows = data.rows
    .filter((row) => row.searchVolume !== null)
    .toSorted((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, TABLE_ROWS);

  const spec: ReportPageSpec = {
    key: "saved-keywords",
    number: "04",
    kicker: "Opportunities",
    title: TITLE,
    body: (
      <>
        <ReportHeroStats items={figures.hero} />
        <ReportNarrative
          paragraphs={buildSavedKeywordsNarrative(
            portfolio,
            coverage,
            fitStatus,
          )}
        />
        <Section
          title="Target list"
          subtitle={targetListSubtitle(topRows.length, coverage)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {figures.tiles.map((tile) => (
              <Tile key={tile.label} label={tile.label} value={tile.value} />
            ))}
          </div>
          <TargetListTable rows={topRows} />
        </Section>
        {/* `fetchedAt` dates the figures; `createdAt` would date when a
            keyword joined the list, a different fact. Nothing on the free read
            refreshes these numbers, so no wording may imply current-month. */}
        <ReportCallout>{describeFetchedAt(data.rows)}</ReportCallout>
      </>
    ),
  };
  out.add(spec);
}
