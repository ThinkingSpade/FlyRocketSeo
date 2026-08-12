import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table } from "@cloudflare/kumo/components/table";
import {
  getQueryMomentum,
  type QueryMomentumResult,
} from "@/serverFunctions/trendingOpportunities";
import {
  useKeywordFit,
  useProjectProfile,
} from "@/client/features/profiles/useProjectProfile";
import {
  computeQueryMomentum,
  momentumLabel,
  type MomentumDirection,
} from "@/client/features/trends/queryMomentum";
import { buildTrendingOpportunities } from "@/client/features/trends/opportunityActions";
import { Section, Tile } from "@/client/features/report/ReportPrimitives";
import {
  ReportCallout,
  ReportNarrative,
} from "@/client/features/report/ReportChrome";
import { formatCount, toPath } from "@/client/features/report/reportModel";
import type {
  ChapterCollector,
  ReportPageSpec,
} from "@/client/features/report/reportChapters";

/**
 * Chapter: which search terms gained and lost ground against the period before.
 *
 * Built on the FREE half of the Keyword Trends tab — `getQueryMomentum` is three
 * unmetered Search Console reads on the same query key as
 * `useTrendingOpportunities`, so a report opened after that tab costs nothing.
 * The tab's Google Trends comparison is metered AND worldwide for any non-local
 * project, so it is not printed here; the coverage list's "Trends" entry is
 * what discloses that to the client (see the footer).
 *
 * IMPRESSIONS, NEVER DEMAND. A Search Console impression moves when the SITE
 * moves — a page climbing from 35 to 8 gains impressions against perfectly flat
 * demand — so "searches for this grew" is a claim this data cannot support.
 */

const MOMENTUM_STALE_MS = 5 * 60_000;

/** Rows PRINTED per table. A display cap and nothing else: the tiles count
 *  every row and a capped table says so in its subtitle. A cap that reads as a
 *  finding is how a client gets told 296 of their terms held steady. */
const MAX_ROWS = 8;

/** Mirror of `opportunityActions.ts`'s private `DOMINANT_PAGE_SHARE`. Below
 *  this, no single page owns the query — the app elsewhere turns that into its
 *  own action, "Sort out competing pages". Kept in step by hand. */
const SPLIT_PAGE_SHARE = 0.6;

const CHAPTER_TITLE = "Search terms gaining and losing ground";

/**
 * Sentences a client may read instead of this chapter; each states only what
 * the read established.
 *
 * NEVER_RUN is reachable only when Search Console has no connection row at all:
 * `getQueryMomentum` returns `connected: false` for `GscNotConnectedError` and
 * rethrows everything else, so an expired grant or a denied property lands on
 * READ_FAILED instead of being blamed on the agency's setup. READ_FAILED is
 * worded exactly as `describeFailedReads` would — see the footer.
 */
const NEVER_RUN =
  "Search Console is not connected for this project, so Google search data is unavailable.";
const READ_FAILED =
  "The period-on-period keyword comparison could not be read while this report was generated — that request failed rather than returning nothing.";
const NO_TERMS =
  "Search Console returned no search terms for this property over the period compared, so there was nothing to measure against the four weeks before.";
const BASELINE_CUT_SHORT =
  " The previous period's list came back cut short, so some of those earlier figures may exist without having been returned.";
const STILL_LOADING =
  "The period-on-period keyword comparison was still loading when this report was generated.";

/** One printed row, narrower than `TrendingOpportunity` on purpose: no position
 *  (property-level, names no URL, already in Keyword rankings) and no action or
 *  reason (work instructions the quick-wins chapter owns). */
export type KeywordTrendsRow = {
  query: string;
  impressions: number;
  direction: MomentumDirection;
  /** `momentumLabel`'s sentence, e.g. "+41% impressions vs last period". */
  label: string;
  /** Page taking the largest share of this query's impressions, or null when
   *  the attribution call returned no row. NULL MEANS "NOT ATTRIBUTED", never
   *  "no page ranks for this" — it prints as an em dash. */
  page: string | null;
  /** `page`'s share of known impressions, 0..1, or null when unattributed.
   *  Carried so the table can say when a term is SPLIT across the client's own
   *  pages: a bare URL reads as "this is the page that ranks", which a 28%
   *  share does not support. */
  pageShare: number | null;
};

type KeywordTrendsRange = {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
};

type ConnectedMomentum = Extract<QueryMomentumResult, { connected: true }>;

/**
 * The free reads this chapter needs, and nothing else.
 *
 * Not `useTrendingOpportunities`: that hook collapses `isError` and
 * `connected === false` into one `unavailable` flag, and in a printed report
 * "we could not read this" and "you never connected this" are two different
 * accusations. They stay separate fields here.
 */
export function usekeywordTrendsReportData(projectId: string) {
  const query = useQuery({
    // Verbatim from useTrendingOpportunities.ts:51 — a warm cache from the
    // Trends tab makes this chapter free to open.
    queryKey: ["queryMomentum", projectId, "last_28_days"],
    queryFn: () =>
      getQueryMomentum({ data: { projectId, dateRange: "last_28_days" } }),
    staleTime: MOMENTUM_STALE_MS,
  });

  // One free D1 read, already cached by every tab hosting the profile card.
  const { profile } = useProjectProfile(projectId);

  // Narrowing only works because `getQueryMomentum`'s handler carries an
  // explicit `QueryMomentumResult` return type.
  const raw = query.data;
  const connectedData: ConnectedMomentum | null =
    raw !== undefined && raw.connected ? raw : null;

  const keywords = useMemo(
    () => (connectedData?.current ?? []).map((row) => row.query),
    [connectedData],
  );
  const fit = useKeywordFit(profile, keywords);

  const built = useMemo(() => {
    if (!connectedData) return { rows: [] as KeywordTrendsRow[], excluded: 0 };

    const momentum = computeQueryMomentum({
      current: connectedData.current,
      previous: connectedData.previous,
      previousTruncated: connectedData.previousTruncated,
    });
    const byQuery = new Map(momentum.map((row) => [row.query, row]));

    // `buildTrendingOpportunities` drops keywords the confirmed profile marks
    // `wrong-customer` and orders by what is AT STAKE, so a term that fell from
    // 10,000 impressions to 1,000 outranks one that rose from 467 to 700.
    const rows = buildTrendingOpportunities({
      candidates: connectedData.current.flatMap((row) => {
        const own = byQuery.get(row.query);
        if (!own) return [];
        return [
          {
            keyword: row.query,
            momentum: own,
            position: row.position,
            page: row.page,
            pageShare: row.pageShare,
          },
        ];
      }),
      fit,
    }).map((opportunity) => ({
      query: opportunity.keyword,
      impressions: opportunity.momentum.impressions,
      direction: opportunity.momentum.direction,
      label: momentumLabel(opportunity.momentum),
      page: opportunity.page,
      pageShare: opportunity.pageShare,
    }));

    // Counted, not inferred from `rows.length`: an empty `rows` has two very
    // different causes — Search Console returned nothing, or the profile set
    // every term aside — and the chapter must not print one when the other is
    // true.
    const excluded = connectedData.current.filter(
      (row) => fit.get(row.query)?.verdict === "wrong-customer",
    ).length;
    return { rows, excluded };
  }, [connectedData, fit]);

  return {
    rows: built.rows,
    range: connectedData ? connectedData.range : null,
    /** Terms returned for the current period BEFORE the profile filter. Zero is
     *  the only honest basis for "there was nothing to measure". */
    currentQueryCount: connectedData?.current.length ?? 0,
    /** Of those, how many the confirmed profile marks `wrong-customer`. */
    excludedByFit: built.excluded,
    /** The current pull hit its row limit, so this is a sample of the terms. */
    currentTruncated: Boolean(connectedData?.currentTruncated),
    /** The PRIOR pull hit its row limit, so a missing baseline is not proof a
     *  term had no earlier figure. Separate from `currentTruncated` because the
     *  two license different sentences. */
    previousTruncated: Boolean(connectedData?.previousTruncated),
    /** Search Console has a connection row and the read succeeded. */
    connected: connectedData !== null,
    /** The read THREW. Never folded into `connected`. */
    isError: query.isError,
    /** Still in flight, so neither present nor absent. */
    isPending: query.isLoading,
  };
}

export type keywordTrendsReportData = ReturnType<
  typeof usekeywordTrendsReportData
>;

const MONTHS =
  "January February March April May June July August September October November December".split(
    " ",
  );

type IsoParts = { year: number; month: number; day: number };

/**
 * Parsed from the string, never through `new Date`: `new Date("2026-07-01")` is
 * UTC midnight, which renders as 30 June in any negative-offset timezone — a
 * printed period a day wrong at both ends, on a sheet whose whole point is the
 * comparison window.
 */
function parseIsoDate(value: string): IsoParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** "1–28 July 2026", collapsing whatever the two ends share. */
function formatDateSpan(start: string, end: string): string | null {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (!from || !to) return null;
  const fromMonth = MONTHS[from.month - 1];
  const toMonth = MONTHS[to.month - 1];
  if (from.year === to.year && from.month === to.month) {
    return `${from.day}–${to.day} ${toMonth} ${to.year}`;
  }
  if (from.year === to.year) {
    return `${from.day} ${fromMonth} – ${to.day} ${toMonth} ${to.year}`;
  }
  return `${from.day} ${fromMonth} ${from.year} – ${to.day} ${toMonth} ${to.year}`;
}

/** "1–28 July 2026 vs 3–30 June 2026", or null if either end is unparseable. */
export function describeComparisonPeriod(
  range: KeywordTrendsRange | null,
): string | null {
  if (!range) return null;
  const current = formatDateSpan(range.startDate, range.endDate);
  const previous = formatDateSpan(range.prevStartDate, range.prevEndDate);
  if (!current || !previous) return null;
  return `${current} vs ${previous}`;
}

type DirectionCensus = {
  rising: KeywordTrendsRow[];
  falling: KeywordTrendsRow[];
  flat: number;
  unknown: number;
  noBaseline: number;
};

/** Every row counted by direction. Nothing here is capped: `MAX_ROWS` is
 *  applied at render time only, so a tile can never print the cap. */
function countDirections(rows: KeywordTrendsRow[]): DirectionCensus {
  const of = (d: MomentumDirection) =>
    rows.filter((row) => row.direction === d);
  return {
    rising: of("rising"),
    falling: of("falling"),
    flat: of("flat").length,
    unknown: of("unknown").length,
    noBaseline: of("no-baseline").length,
  };
}

/** "a", "a and b", "a, b and c". */
function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function plural(count: number): string {
  return count === 1 ? "search term" : "search terms";
}

/**
 * Why nothing moved — counted, never assumed.
 *
 * The sentence this replaced said "every one either held steady or had too few
 * impressions to judge", which is false for a `no-baseline` row: that term had
 * NO earlier figure, so it was never judged at all. A property verified inside
 * the last four weeks lands there wholesale, and telling that client their
 * search terms held steady is a confident falsehood about their own account.
 */
function describeNoMovement(input: {
  flat: number;
  unknown: number;
  noBaseline: number;
  previousTruncated: boolean;
}): string {
  const note =
    input.noBaseline > 0 && input.previousTruncated ? BASELINE_CUT_SHORT : "";

  if (input.flat === 0 && input.unknown === 0 && input.noBaseline > 0) {
    return `Not one of the ${formatCount(input.noBaseline)} ${plural(input.noBaseline)} Search Console returned had a figure in the previous period, so no gain or loss could be measured — that is missing history, not steady performance.${note}`;
  }

  const parts: string[] = [];
  if (input.flat > 0) parts.push(`${formatCount(input.flat)} held steady`);
  if (input.unknown > 0) {
    parts.push(
      `${formatCount(input.unknown)} had too few impressions to judge`,
    );
  }
  if (input.noBaseline > 0) {
    parts.push(
      `${formatCount(input.noBaseline)} had no figure in the previous period to compare against`,
    );
  }
  return `No search term rose or fell far enough against the previous period to count as a change — ${joinClauses(parts)}.${note}`;
}

/** Why the comparison held no terms at all. */
function describeNoRows(data: keywordTrendsReportData): string {
  if (data.currentQueryCount === 0) return NO_TERMS;
  const count = formatCount(data.currentQueryCount);
  const terms = plural(data.currentQueryCount);
  if (data.excludedByFit === data.currentQueryCount) {
    return `All ${count} ${terms} Search Console returned for this period are marked in this project's profile as bringing the wrong customer, so none of them were compared.`;
  }
  return `Search Console returned ${count} ${terms} for this period, but none of them reached this comparison.`;
}

/**
 * The reason this chapter cannot be printed, or null while the read is still in
 * flight (the chapter stays, carrying the loading sentence).
 *
 * Order matters: a THROWN read outranks every other verdict, because it is the
 * only one that blames the agency for work it may well have done.
 */
function keywordTrendsDropReason(
  data: keywordTrendsReportData,
  census: DirectionCensus,
): string | null {
  if (data.isError) return READ_FAILED;
  if (data.isPending) return null;
  if (!data.connected) return NEVER_RUN;
  if (data.rows.length === 0) return describeNoRows(data);
  return describeNoMovement({
    flat: census.flat,
    unknown: census.unknown,
    noBaseline: census.noBaseline,
    previousTruncated: data.previousTruncated,
  });
}

/** "Top 8 of 61 by impressions at stake · 1–28 July 2026 vs …". The cap is
 *  stated on the table it applies to, so the tile above stays a true total. */
function tableSubtitle(
  shown: number,
  total: number,
  period: string | null,
): string | undefined {
  if (total <= shown) return period ?? undefined;
  const capped = `Top ${formatCount(shown)} of ${formatCount(total)} by impressions at stake`;
  return period ? `${capped} · ${period}` : capped;
}

function isSplitAcrossPages(row: KeywordTrendsRow): boolean {
  return row.pageShare !== null && row.pageShare < SPLIT_PAGE_SHARE;
}

/** One table, capped at `MAX_ROWS` and saying so whenever it cuts. */
function MomentumSection({
  title,
  rows,
  period,
}: {
  title: string;
  rows: KeywordTrendsRow[];
  period: string | null;
}) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, MAX_ROWS);
  return (
    <Section
      title={title}
      subtitle={tableSubtitle(shown.length, rows.length, period)}
    >
      <div className="overflow-x-auto rounded-lg border border-base-300">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>Search term</Table.Head>
              <Table.Head className="text-right">Impressions</Table.Head>
              <Table.Head>vs previous period</Table.Head>
              {/* Not "Page it shows for": this is the page taking the largest
                  known impression share, which at 28% is not a page that owns
                  the term. */}
              <Table.Head>Page taking most impressions</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {shown.map((row) => (
              <Table.Row key={row.query}>
                <Table.Cell className="max-w-xs">
                  <span className="line-clamp-1">{row.query}</span>
                </Table.Cell>
                <Table.Cell className="text-right tabular-nums">
                  {formatCount(row.impressions)}
                </Table.Cell>
                <Table.Cell>{row.label}</Table.Cell>
                <Table.Cell className="max-w-xs">
                  {/* `toPath(null)` is an em dash. A query in this pull is one
                      the site was SHOWN for, so an unattributed page never
                      licenses "no page ranks for this". */}
                  <span className="line-clamp-1">{toPath(row.page)}</span>
                  {isSplitAcrossPages(row) ? (
                    <span className="block text-xs text-base-content/60">
                      Shared with your other pages — this one takes about{" "}
                      {Math.round((row.pageShare ?? 0) * 100)}%
                    </span>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
    </Section>
  );
}

function chapterSpec(body: ReactNode): ReportPageSpec {
  return {
    key: "keyword-trends",
    number: "01",
    kicker: "Performance",
    title: CHAPTER_TITLE,
    body,
  };
}

/**
 * Adds the chapter, or drops it with the reason a client can act on.
 *
 * ADMISSION RULE: at least one term must have risen or fallen. `flat`,
 * `unknown` and `no-baseline` rows are not content. A read still in flight
 * keeps the chapter, the rule the Search Console chapters already follow, and
 * rows already in hand outrank a background error.
 */
export function buildkeywordTrendsChapter(
  data: keywordTrendsReportData,
  out: ChapterCollector,
  sections?: unknown,
): void {
  // This chapter renders its own body; the shared sections are not used.
  void sections;

  const census = countDirections(data.rows);
  if (census.rising.length === 0 && census.falling.length === 0) {
    const reason = keywordTrendsDropReason(data, census);
    if (reason === null) {
      out.add(chapterSpec(<ReportNarrative paragraphs={[STILL_LOADING]} />));
    } else {
      out.drop(CHAPTER_TITLE, reason);
    }
    return;
  }

  const printed = [
    ...census.rising.slice(0, MAX_ROWS),
    ...census.falling.slice(0, MAX_ROWS),
  ];
  const caveats = [
    printed.some(isSplitAcrossPages)
      ? "Where a term is marked as shared, several of your own pages split its impressions and no single one owns it — the page named is only the largest of them."
      : null,
    data.currentTruncated
      ? "This comparison is drawn from a sample of the search terms Search Console returned for this property, not from every one of them."
      : null,
    data.previousTruncated
      ? "The previous period's list came back cut short, so some terms are counted here as having no earlier figure when one may exist."
      : null,
  ].filter((text): text is string => text !== null);

  const period = describeComparisonPeriod(data.range);
  out.add(
    chapterSpec(
      <>
        <ReportNarrative
          paragraphs={[
            "The searches you already show up for, and which of them grew or shrank against the four weeks before.",
          ]}
        />
        <div className="grid grid-cols-3 gap-3">
          {/* True totals. The tables below are capped; these are not. */}
          <Tile
            label="Terms compared"
            value={formatCount(
              census.rising.length + census.falling.length + census.flat,
            )}
          />
          <Tile
            label="Gained ground"
            value={formatCount(census.rising.length)}
          />
          <Tile
            label="Lost ground"
            value={formatCount(census.falling.length)}
          />
        </div>
        <MomentumSection
          title="Gaining ground"
          rows={census.rising}
          period={period}
        />
        <MomentumSection
          title="Losing ground"
          rows={census.falling}
          period={period}
        />
        {caveats.map((text) => (
          <ReportCallout key={text}>{text}</ReportCallout>
        ))}
      </>,
    ),
  );
}

/**
 * FOR THE COORDINATOR.
 *
 * 1. `READ_FAILED` is the exact string `describeFailedReads` produces for a
 *    subject of "the period-on-period keyword comparison". Adding
 *    `queryMomentum` to `ReportReadKey`/`READ_SUBJECTS` in reportReads.ts lets
 *    it become `describeFailedReads(readFailures, ["queryMomentum"])` with no
 *    change to the printed sheet. Inlined so this file owns no shared edit.
 * 2. `NOT_COVERED` in reportChapters.tsx holds the bare string "Trends" — not
 *    "Trends (Google Trends comparison)", whatever an earlier version of this
 *    comment claimed. DO NOT DELETE IT when wiring this chapter up: it is the
 *    client's only disclosure that the metered Google Trends comparison was
 *    never run, and this chapter covers none of it. Renaming it would read
 *    better beside this chapter, but that touches a shared file and
 *    reportChapters.test.ts, so it is the coordinator's call.
 */
