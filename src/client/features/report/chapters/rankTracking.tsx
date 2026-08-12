import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";
import {
  getLatestRankResults,
  getRankChangeDigest,
  getRankTrackingConfigSummaries,
} from "@/serverFunctions/rank-tracking";
import { computeScorecards } from "@/client/features/rank-tracking/rankTrackingScorecards";
import { resolveStoredConfigArea } from "@/client/features/rank-tracking/rankTrackingConfigArea";
import { LOCATIONS } from "@/shared/keyword-locations";
import { normalizeDomain } from "@/types/schemas/domain";
import {
  ReportCallout,
  ReportNarrative,
} from "@/client/features/report/ReportChrome";
import { Section, Tile } from "@/client/features/report/ReportPrimitives";
import {
  buildBandRows,
  checkState,
  DataTable,
  describeTrackerHeader,
  HISTORY_SUBJECT,
  MoversSection,
  plural,
  readGap,
  runNote,
  type RankTrackingConfigRead,
} from "@/client/features/report/chapters/rankTrackingSheet";
import type {
  ChapterCollector,
  ReportPageSpec,
} from "@/client/features/report/reportChapters";

/**
 * The rank-tracking chapter: the keywords this agency committed to checking,
 * where they sit, and what moved since the previous check.
 *
 * The three reads behind it are plain D1 queries — config summaries, the latest
 * stored results, and the change digest — and every one already has a cache key
 * the dashboard populates, so opening the report costs no provider call and,
 * for a project whose dashboard has been viewed, no extra fetch either. The two
 * metered paths in this feature (`triggerRankCheck`,
 * `refreshTrackingKeywordMetrics`) are never reached from here.
 *
 * Two things on this sheet are easy to get wrong in a way a client would
 * notice, so both are handled explicitly below:
 *
 *  1. A rank-tracking config carries its OWN domain, which may be a competitor
 *     the agency set up a tracker for. Printing that under "your keywords" is
 *     the worst failure available here, so every config is gated against the
 *     project's own domain before it can reach a page.
 *  2. The tiles and the movers table do NOT share a comparison baseline. The
 *     tiles come from `getLatestRankResults`, which compares against the last
 *     snapshot older than seven days and silently falls back to the earliest
 *     one on record; the movers come from the digest, which compares the two
 *     most recent completed full runs, on desktop only. Unlabelled, they would
 *     disagree about how many keywords improved, in print. Each block states
 *     its own basis, and the movers block says so rather than printing "no
 *     change" when the digest cannot answer for this tracker's device.
 *
 * The third trap is the run status. `lastRunCompletedAt` is the `completedAt`
 * of the newest run BY START TIME whatever its status, so it is null while a
 * check is in flight and non-null for a check that FAILED. Gating on it alone
 * deleted real positions from the PDF of any client whose report was generated
 * mid-check, and dated an empty finding to a failed run. Every state below is
 * decided by `lastRunStatus` beside it, and by whether stored rows exist —
 * rows come from completed runs only, so they outlive both.
 *
 * Nothing here can age out: these are plain D1 rows with no TTL and no purge
 * job, and snapshots are deliberately kept after a keyword is untracked. So
 * this chapter carries no "stored results are kept for a limited window"
 * sentence — that wording belongs to the R2-restored snapshots and would be
 * false here.
 *
 * This file owns the reads, the gates and the page assembly. What a sheet
 * actually says — one tracker's shape, the state of its newest run, the header
 * sentence, the position bands and the movement finding — lives beside it in
 * `rankTrackingSheet.tsx`, with the reasoning kept on each branch there.
 */

const STALE_TIME = 10 * 60_000;

/** One sheet per tracker, capped: the rest are named in the coverage list. */
const MAX_CONFIGS = 3;

/**
 * The band number. Rank tracking cannot ride under 01/Performance — that
 * chapter's callout asserts Search Console provenance and these positions are
 * checked directly on Google — so it needs its own kicker, and its own kicker
 * needs a number. 02 is currently Content's; sharing it is the change that
 * touches no other chapter. Renumbering Content onward is the alternative, and
 * that is the coordinator's call, not this file's.
 */
const CHAPTER_NUMBER = "02";
const CHAPTER_KICKER = "Rank tracking";
const CHAPTER_TITLE = "Tracked keyword positions";

const LEAD =
  "These are the keywords we check for you on Google, where each one sits now, and which ones moved since the last check.";

const NEVER_RUN =
  "No keyword rank tracking has been set up for this project, so there are no tracked positions to report.";

/**
 * The same normalise-and-compare the snapshot hook uses
 * (`reportSnapshotMatchesDomain`, useReportSnapshots.ts:28), repeated here only
 * because that one is module-private and this chapter may not edit it. A domain
 * neither side can normalise is not a match — the gate fails closed.
 */
function matchesProjectDomain(config: string, project: string): boolean {
  try {
    return (
      normalizeDomain(config.replace(/^\*\./, "")) ===
      normalizeDomain(project.replace(/^\*\./, ""))
    );
  } catch {
    return false;
  }
}

/** A tracker's location, never guessed: an unknown code stays a bare code. */
function locationLabel(locationCode: number): string {
  return LOCATIONS[locationCode] ?? resolveStoredConfigArea(locationCode).label;
}

function useRankTrackingReportData(projectId: string) {
  // Same key the rest of the report already reads, so this costs no fetch.
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: STALE_TIME,
  });
  const domain =
    projectsQuery.data?.find((entry) => entry.id === projectId)?.domain ?? null;

  // Keys copied verbatim from RankTrackingCard and RankChangesCard.
  const summariesQuery = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
  const digestQuery = useQuery({
    queryKey: ["rankChangeDigest", projectId],
    queryFn: () => getRankChangeDigest({ data: { projectId } }),
    staleTime: STALE_TIME,
  });

  // The domain gate, and then largest tracker first so a capped project keeps
  // its biggest sheets rather than whichever was created earliest.
  const matchedAll = useMemo(
    () =>
      (summariesQuery.data ?? [])
        .filter((summary) =>
          domain == null ? false : matchesProjectDomain(summary.domain, domain),
        )
        .toSorted((a, b) => b.keywordCount - a.keywordCount),
    [summariesQuery.data, domain],
  );
  const matched = matchedAll.slice(0, MAX_CONFIGS);

  // Called with no `comparePeriod` on purpose: that is what the dashboard card
  // does, so this shares its cached entry rather than opening a second one.
  const resultsQueries = useQueries({
    queries: matched.map((config) => ({
      queryKey: ["rankTrackingResults", projectId, config.id],
      queryFn: () =>
        getLatestRankResults({ data: { projectId, configId: config.id } }),
      staleTime: STALE_TIME,
    })),
  });

  const configs: RankTrackingConfigRead[] = matched.map((config, index) => ({
    configId: config.id,
    locationLabel: locationLabel(config.locationCode),
    // Desktop, matching the dashboard card and the digest — unless the tracker
    // is mobile-only, where desktop would print all zeros.
    device: config.devices === "mobile" ? "mobile" : "desktop",
    serpDepth: config.serpDepth,
    keywordCount: config.keywordCount,
    lastRunCompletedAt: config.lastRunCompletedAt,
    lastRunStatus: config.lastRunStatus,
    lastSkipReason: config.lastSkipReason,
    rows: resultsQueries[index]?.data?.rows ?? [],
    rowsError: resultsQueries[index]?.isError ?? false,
    rowsPending: resultsQueries[index]?.isPending ?? false,
    digest:
      digestQuery.data?.configs.find((row) => row.configId === config.id) ??
      null,
  }));

  return {
    domain,
    projectsError: projectsQuery.isError,
    projectsPending: projectsQuery.isPending,
    summariesError: summariesQuery.isError,
    summariesPending: summariesQuery.isPending,
    moversError: digestQuery.isError,
    moversPending: digestQuery.isPending,
    /** Active trackers on this project, before the domain gate. */
    configCount: summariesQuery.data?.length ?? 0,
    /** Trackers whose domain is this project's, before the cap. */
    matchedCount: matchedAll.length,
    configs,
  };
}

/**
 * Exported under the name the coordinator wires. The hook itself keeps a
 * conventional `use`-prefixed name so the rules-of-hooks lint can see it.
 */
export const userankTrackingReportData = useRankTrackingReportData;
type rankTrackingReportData = ReturnType<typeof userankTrackingReportData>;

/** A tile delta in the shape `Tile` renders it, hidden when flat and null when
 *  there is no comparison at all — never a fabricated zero. */
function tileChange(value: number | null, unit: "" | " pts" = "") {
  if (value == null || Math.abs(value) < (unit ? 0.05 : 1)) return null;
  const size = unit ? value.toFixed(1) : String(value);
  return { text: `${value > 0 ? "+" : ""}${size}${unit}`, good: value > 0 };
}

/**
 * Why this whole chapter is missing, when the answer is the same for every
 * tracker. House ordering: a failed read outranks everything, then "never set
 * up", then "set up but never checked", and only then the data itself.
 */
function describeChapterGap(data: rankTrackingReportData): string | null {
  const projectGap = readGap(
    "this project's own record",
    data.projectsError,
    data.projectsPending,
  );
  if (projectGap) return projectGap;
  if (data.domain == null) {
    return "This project has no domain set, so its tracked keyword positions could not be matched to it.";
  }

  // The last argument is the domain gate: a tracker exists, but it watches
  // someone else's domain — a competitor this agency analysed. It must never
  // print under "your keywords".
  const historyGap = readGap(
    HISTORY_SUBJECT,
    data.summariesError,
    data.summariesPending,
    data.configCount > 0 && data.matchedCount === 0,
  );
  if (historyGap) return historyGap;

  if (data.configCount === 0) return NEVER_RUN;
  // Only when NO tracker has ever started a run AND none has stored positions.
  // A null `lastRunCompletedAt` alone means a check is in flight, which is not
  // the same thing and must not delete a year of real positions from the PDF.
  const neverChecked =
    data.configs.length > 0 &&
    data.configs.every(
      (config) =>
        config.rows.length === 0 && checkState(config).kind === "never",
    );
  if (neverChecked) {
    const keywords = data.configs.reduce(
      (total, config) => total + config.keywordCount,
      0,
    );
    // Not the same accusation as "not set up": the agency did the setup here.
    return `Rank tracking is set up for this project with ${plural(keywords, "keyword")}, but no check has completed yet, so there are no positions to report.`;
  }
  return null;
}

/** Why one tracker has no sheet, when the others may still have theirs. */
function describeConfigGap(config: RankTrackingConfigRead): string | null {
  const gap = readGap(HISTORY_SUBJECT, config.rowsError, config.rowsPending);
  if (gap) return gap;

  const where = config.locationLabel;
  const state = checkState(config);

  if (config.keywordCount === 0) {
    return `Rank tracking is set up for ${where}, but no keywords have been added to it yet, so there are no positions to report.`;
  }

  // Stored positions come from completed runs only, so an empty `rows` is the
  // one state in which we truly hold nothing — and the reason for it is the
  // newest run's status, never the presence of a timestamp.
  if (config.rows.length === 0) {
    switch (state.kind) {
      case "running":
        return `A rank check for ${where} was still running when this report was generated, and no earlier check has completed, so there are no positions to report yet.`;
      case "failed":
        return state.outOfCredits
          ? `The most recent rank check for ${where} did not run${state.on ? ` on ${state.on}` : ""} because the account was out of rank-check credits, and no earlier check left positions on record.`
          : `The most recent rank check for ${where} failed${state.on ? ` on ${state.on}` : ""}, and no earlier check left positions on record, so there are no positions to report.`;
      case "completed":
        return `The most recent check for ${where} completed${state.on ? ` on ${state.on}` : ""} but stored no positions for these keywords, so there is nothing to report from it.`;
      default:
        return `Rank tracking is set up for ${where} with ${plural(config.keywordCount, "keyword")}, but no check has completed yet, so there are no positions to report.`;
    }
  }

  if (computeScorecards(config.rows, config.device).ranking > 0) return null;

  // Every stored position is "not ranking". serpDepth is per-config (10–100),
  // so "top 20" would be a false claim — and only a COMPLETED newest run lets
  // this finding carry a date. Stamping a failed run's `completedAt` on it
  // would credit a check that produced nothing.
  const scope = `none of the ${plural(config.keywordCount, "tracked keyword")} placed within the top ${config.serpDepth} of Google results for ${where}`;
  if (state.kind === "completed" && state.on) {
    return `Rankings were checked on ${state.on}, and ${scope}.`;
  }
  return `In the most recent check that completed, ${scope}.${runNote(state)}`;
}

export function buildrankTrackingChapter(
  data: rankTrackingReportData,
  out: ChapterCollector,
  sections?: unknown,
): void {
  // Accepted only so every chapter builder can be wired identically; this one
  // renders from its own reads and shares no section with the rest.
  void sections;

  const chapterGap = describeChapterGap(data);
  if (chapterGap) {
    out.drop(CHAPTER_TITLE, chapterGap);
    return;
  }

  const multiple = data.configs.length > 1;
  for (const config of data.configs) {
    // A dropped location reads to a client as keywords we stopped tracking, so
    // each tracker gets its own sheet or its own named line in the coverage
    // list — never a silent pick of one.
    const title = multiple
      ? `${CHAPTER_TITLE} — ${config.locationLabel}`
      : CHAPTER_TITLE;
    const gap = describeConfigGap(config);
    if (gap) out.drop(title, gap);
    else out.add(buildConfigPage({ config, data, title }));
  }

  if (data.matchedCount > MAX_CONFIGS) {
    out.drop(
      `${CHAPTER_TITLE} — other locations`,
      `This project tracks ${plural(data.matchedCount, "location")}; the ${MAX_CONFIGS} with the most keywords are reported above.`,
    );
  }
}

const TILE_NOTE =
  "Compared against each keyword's last recorded position from more than seven days earlier, or its earliest recorded position where there is none. Visibility is an estimated share of the clicks these positions could earn, weighted by search volume — not measured traffic.";

function buildConfigPage({
  config,
  data,
  title,
}: {
  config: RankTrackingConfigRead;
  data: rankTrackingReportData;
  title: string;
}): ReportPageSpec {
  const cards = computeScorecards(config.rows, config.device);
  const header = describeTrackerHeader(config, data.domain);
  // Counts lead because they are always real. Visibility trails, and is never
  // a fabricated zero: it is null whenever no tracked keyword carries a search
  // volume, the normal state for a project that never paid for keyword metrics.
  const tiles: Array<[string, string, ReturnType<typeof tileChange>]> = [
    ["Ranking keywords", String(cards.ranking), tileChange(cards.rankingDelta)],
    ["Top 3", String(cards.top3), null],
    ["Top 10", String(cards.top10), null],
    [
      "Visibility (est.)",
      cards.visibility === null ? "—" : `${cards.visibility.toFixed(1)}%`,
      tileChange(cards.visibilityDelta, " pts"),
    ],
  ];
  const bands = buildBandRows(config);

  return {
    key: `rank-tracking-${config.configId}`,
    number: CHAPTER_NUMBER,
    kicker: CHAPTER_KICKER,
    title,
    body: (
      <>
        <ReportNarrative paragraphs={[LEAD, header]} />
        <Section title="Where these keywords stand" subtitle={TILE_NOTE}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tiles.map(([label, value, change]) => (
              <Tile key={label} label={label} value={value} change={change} />
            ))}
          </div>
        </Section>
        <Section
          title="Positions before and now"
          subtitle={`How many of these keywords sat in each band of Google's results for ${config.locationLabel}, then and now.${bands.note}`}
        >
          <DataTable
            columns={["Bucket", "Previous", "Now"]}
            rows={bands.rows}
          />
        </Section>
        <MoversSection config={config} data={data} />
        <ReportCallout>
          These positions were checked directly on Google for the location and
          device named above, on this tracker&apos;s own schedule. They are not
          Search Console figures.
        </ReportCallout>
      </>
    ),
  };
}
