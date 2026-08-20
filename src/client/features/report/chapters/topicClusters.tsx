import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table } from "@cloudflare/kumo/components/table";
import type { z } from "zod";
import { getRecentRuns } from "@/serverFunctions/analysisRuns";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import type { GscAccessFailureReason } from "@/shared/gsc";
import { topicClusterPlanSchema } from "@/types/schemas/topic-clusters";
import { extractStoredConfirmedAreaLabel } from "@/client/features/topic-clusters/clusterAreaLabel";
import {
  computeClusterPlanTotals,
  prioritizeClusters,
} from "@/client/features/topic-clusters/clusterPriorities";
import {
  getTopicCoverage,
  isProjectGscReport,
  type TopicCoverage,
} from "@/client/features/search-performance/projectGscInsights";
import { describeSnapshotGap } from "@/client/features/report/reportReads";
import {
  ReportCallout,
  ReportHeroStats,
  ReportNarrative,
} from "@/client/features/report/ReportChrome";
import { Section, Tile } from "@/client/features/report/ReportPrimitives";
import type {
  ChapterCollector,
  ReportPageSpec,
} from "@/client/features/report/reportChapters";

/**
 * Chapter 02: the saved topic cluster plan, crossed against what already ranks.
 *
 * Free to read — the plan comes back through `restoreLatestRun` and the metered
 * `getTopicClusters` is never imported. Two clocks are labelled apart: volumes
 * are rolling averages as of `plan.fetchedAt`, the cross is GSC's last 28 days.
 * No domain gate is possible (a plan is about a topic), so `otherDomain` below
 * is structurally `false`, not a skipped check. And every absence printed here
 * is qualified by the read that would have found it: the cross rests on a
 * clicks-ordered pull capped at 1000 rows, so "no page" is said only when that
 * pull ran to completion.
 */

type TopicClusterPlan = z.infer<typeof topicClusterPlanSchema>;

/** Per-cluster coverage keyed by cluster name, plus the hub's own. */
type TopicPlanCoverage = {
  hub: TopicCoverage;
  clusters: Record<string, TopicCoverage>;
};

/** Why Search Console is not backing the cross. A thrown request is not a
 *  disconnected account, nor is a sheet printed mid-load, and `absent` needs a
 *  SETTLED `{ connected: false }` payload — whose reason says which cause. */
type GscState = "connected" | "failed" | "pending" | "absent";

const CHAPTER_TITLE = "Topics worth owning";
const NEVER_RUN = "No topic cluster plan has been saved for this project.";
const DATE_FORMAT = { year: "numeric", month: "long", day: "numeric" } as const;
const ROADMAP_ROWS = 8; // rows that fit one sheet without a continuation
const ALSO_MAPPED_SHOWN = 4;

export function usetopicClustersReportData(projectId: string) {
  const run = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.topicClusters,
    schema: topicClusterPlanSchema,
    enabled: true,
  });

  // The Recent runs list's own key and limit, so a visit to the tab warmed it.
  const recentQuery = useQuery({
    queryKey: ["analysisRuns", "recent", projectId, RUN_FEATURES.topicClusters],
    queryFn: () =>
      getRecentRuns({
        data: { projectId, feature: RUN_FEATURES.topicClusters, limit: 10 },
      }),
    staleTime: 60_000,
  });

  // The report's own Search Console key, verbatim: a cache read, not a fetch.
  const gscQuery = useQuery({
    queryKey: ["report-gsc", projectId],
    queryFn: () => getSearchPerformanceReport({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });

  const plan = run.restored?.result ?? null;
  const gsc = isProjectGscReport(gscQuery.data) ? gscQuery.data : null;

  const coverage = useMemo<TopicPlanCoverage | null>(() => {
    if (!plan || !gsc) return null;
    const clusters: Record<string, TopicCoverage> = {};
    for (const cluster of plan.clusters) {
      const terms = cluster.keywords.map((entry) => entry.keyword);
      clusters[cluster.name] = getTopicCoverage(gsc, terms);
    }
    const hubTerms = [plan.topic, ...plan.hub.map((entry) => entry.keyword)];
    return { hub: getTopicCoverage(gsc, hubTerms), clusters };
  }, [plan, gsc]);

  // "absent" only for a payload that came back saying so; an undefined one
  // that never settled is "pending", not evidence about the connection.
  const gscState: GscState = gsc
    ? "connected"
    : gscQuery.isError
      ? "failed"
      : gscQuery.data === undefined
        ? "pending"
        : "absent";

  // `getSearchPerformanceReport` does not throw for an access failure: all four
  // classified causes resolve to `{ connected: false, reason }` and only
  // unclassifiable faults are re-thrown, so "no data" is never "never
  // connected" — that accuses us of work we did do.
  const gscFailureReason: GscAccessFailureReason | null =
    gscQuery.data && !gscQuery.data.connected ? gscQuery.data.reason : null;

  // A failed history read is not "only one topic was mapped": the list is
  // empty and the extra line simply does not print.
  const alsoMapped = (recentQuery.data ?? [])
    .map((entry) => entry.label)
    .filter((label) => label !== run.restored?.label);

  return {
    plan,
    // The restore's verdict raw, so the builder words it; and the run's OWN
    // persisted caveat state, never today's scope control.
    planIsError: run.isError,
    planRestoring: run.isRestoring,
    planOutcome: run.outcome,
    confirmedAreaLabel: extractStoredConfirmedAreaLabel(
      run.restored?.params ?? null,
    ),
    alsoMapped,
    gscState,
    gscFailureReason,
    samplingTruncated: gsc?.sampling.queryPages.truncated ?? false,
    coverage,
  };
}

export type topicClustersReportData = ReturnType<
  typeof usetopicClustersReportData
>;

export function buildtopicClustersChapter(
  data: topicClustersReportData,
  out: ChapterCollector,
  sections?: unknown,
): void {
  // Unused: the shared data sections belong to the Search Console chapters.
  void sections;

  const { plan } = data;
  if (!plan) {
    // Failed, loading, expired and unreadable stay distinct; only what is left
    // over is "nobody ever ran this". `otherDomain` is structurally false — a
    // topic is not a domain, so no competitor's data can be here.
    out.drop(
      CHAPTER_TITLE,
      describeSnapshotGap({
        subject: "the saved topic cluster plan",
        isError: data.planIsError,
        restoring: data.planRestoring,
        outcome: data.planOutcome,
        otherDomain: false,
      }) ?? NEVER_RUN,
    );
    return;
  }
  if (plan.clusters.length === 0) {
    out.drop(
      CHAPTER_TITLE,
      `The saved topic plan for “${plan.topic}” found no keyword clusters — too few related searches around that topic to group into a roadmap.`,
    );
    return;
  }

  out.add({
    key: "topic-clusters",
    number: "02",
    kicker: "Content",
    title: CHAPTER_TITLE,
    body: <TopicClustersBody data={data} plan={plan} />,
  } satisfies ReportPageSpec);
}

const formatNumber = (value: number) => value.toLocaleString("en-US");

function countStatuses(coverage: TopicPlanCoverage) {
  const all = Object.values(coverage.clusters);
  const by = (status: TopicCoverage["status"]) =>
    all.filter((entry) => entry.status === status).length;
  return {
    covered: by("covered"),
    missing: by("missing"),
    cannibalized: by("cannibalized"),
    total: all.length,
  };
}

/** What we did, then which topic and when. The "checked which of those" half
 *  drops without a cross — it describes work this sheet did not do — and the
 *  topic, unvetted input, is framed as what we mapped, not as the client's. */
function buildIntroParagraph(plan: TopicClusterPlan, hasCoverage: boolean) {
  const lead = hasCoverage
    ? "We mapped the search landscape around the topic you sell into, grouped it into clusters, and checked which of those your site already ranks for — the ones nothing on your site answers are your next pages."
    : "We mapped the search landscape around the topic you sell into and grouped it into clusters of related searches.";
  const pulled = new Date(plan.fetchedAt);
  const mapped = Number.isNaN(pulled.getTime())
    ? ""
    : ` on ${pulled.toLocaleDateString("en-US", DATE_FORMAT)}`;
  return `${lead} The topic we mapped was “${plan.topic}”, and the landscape was pulled${mapped} — the search volumes below are rolling monthly averages from the day of that pull, not a count for this reporting period.`;
}

function describeHub(hub: TopicCoverage, subject: string, capped: boolean) {
  if (hub.status === "cannibalized")
    return `${formatNumber(hub.pageCount)} of your pages compete for ${subject}, which splits the ranking between them.`;
  if (hub.status === "covered")
    return `Your site already has a page ranking for ${subject}.`;
  return capped
    ? `No page of yours was found ranking for ${subject} in the rows we retrieved, so the hub page is worth writing first.`
    : `Nothing on your site ranks for ${subject} yet, so the hub page is the first thing to write.`;
}

/** The coverage verdict. `getTopicCoverage` matches a clicks-ordered, capped
 *  pull, so a capped one says "no matching page among the rows we retrieved",
 *  never "you have no page" — a false claim about a page that may rank well. */
function buildCoverageParagraph(
  topic: string,
  coverage: TopicPlanCoverage,
  capped: boolean,
) {
  const { covered, missing, cannibalized, total } = countStatuses(coverage);
  // Not "clusters below": the plan holds up to 12 and the table prints 8, so
  // these counts are about what we mapped, not about what is printed under.
  const head =
    missing === 0
      ? `Every one of the ${total} clusters we mapped already has a page ranking on your site.`
      : capped
        ? `${missing} of the ${total} clusters have no matching page among the Search Console rows we retrieved — the strongest candidates for new pages, though a page ranking below where that pull stopped would not show here.`
        : `${missing} of the ${total} clusters have no page on your site ranking for them — those are your next pages.`;
  const split = `${covered} already ${covered === 1 ? "has" : "have"} a page ranking, and ${cannibalized} ${cannibalized === 1 ? "has" : "have"} two or more pages competing for the same searches.`;
  const hub = describeHub(coverage.hub, `“${topic}” itself`, capped);
  return `${head} ${split} ${hub} This coverage check reads your Search Console data for the last 28 days, a different period from the search volumes above.`;
}

/** Worded to match `describeMissingGsc` in `reportChapters.tsx`: one
 *  deliverable must not say "expired" on the summary sheet and "you never
 *  connected it" here. Only `not_connected` says never connected. */
const GSC_GAP_CAUSE: Record<GscAccessFailureReason, string> = {
  not_connected: "Search Console is not connected for this project",
  requires_reconnect: "The Search Console connection expired",
  permission_denied:
    "Google denied access to the connected Search Console property",
  api_not_configured:
    "The Search Console API is not enabled for the connected Google Cloud project",
};

/** Why the roadmap has not been crossed against the site's own rankings. */
function describeMissingCoverage(
  state: GscState,
  reason: GscAccessFailureReason | null,
) {
  const tail = "so this roadmap has not been checked against your own rankings";
  if (state === "failed")
    return `Search Console data could not be read while this report was generated, ${tail}.`;
  if (state === "pending")
    return `Search Console data was still loading when this report was generated, ${tail}.`;
  // A settled failure with no reason at all keeps the generic sentence.
  return `${GSC_GAP_CAUSE[reason ?? "not_connected"]}, ${tail} — the clusters below are ranked by search demand against difficulty alone.`;
}

/** The tiles count every cluster in the plan, not the eight the roadmap prints,
 *  so the true total is stated where they are read — and a capped pull makes
 *  the third tile unmatched clusters, which is not uncovered ones. */
function coverageSectionSubtitle(total: number, truncated: boolean) {
  const lead = `All ${formatNumber(total)} clusters, matched against your Search Console rows for the last 28 days.`;
  return truncated
    ? `${lead} That pull stopped at the rows Google returned first, so the third figure counts clusters with no match among those rows, not clusters with no page.`
    : lead;
}

function coverageCell(entry: TopicCoverage | undefined, truncated: boolean) {
  if (!entry) return "—";
  if (entry.status === "covered") return "1 page ranking";
  if (entry.status === "cannibalized")
    return `${formatNumber(entry.pageCount)} pages competing`;
  return truncated ? "Not in the rows retrieved" : "No page yet";
}

type RoadmapProps = {
  plan: TopicClusterPlan;
  coverage: TopicPlanCoverage | null;
  truncated: boolean;
};

/** The GscRowsTable idiom written locally — its columns (clicks/impressions/
 *  CTR/position) do not exist here. Clusters only: the plan holds up to 150
 *  keywords and a per-keyword dump overflows onto sheets with no folio. */
function RoadmapTable({ plan, coverage, truncated }: RoadmapProps) {
  const ranked = prioritizeClusters(plan.clusters).slice(0, ROADMAP_ROWS);
  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Cluster</Table.Head>
            <Table.Head>Priority</Table.Head>
            <Table.Head className="text-right">Monthly searches</Table.Head>
            <Table.Head className="text-right">Difficulty</Table.Head>
            {coverage ? <Table.Head>Coverage</Table.Head> : null}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {ranked.map((cluster) => (
            <Table.Row key={cluster.name}>
              <Table.Cell className="max-w-md">
                <span className="line-clamp-1">{cluster.name}</span>
              </Table.Cell>
              <Table.Cell>P{cluster.priority}</Table.Cell>
              <Table.Cell className="text-right tabular-nums">
                {formatNumber(cluster.totalVolume)}
              </Table.Cell>
              <Table.Cell className="text-right tabular-nums">
                {cluster.averageDifficulty == null
                  ? "—"
                  : formatNumber(Math.round(cluster.averageDifficulty))}
              </Table.Cell>
              {coverage ? (
                <Table.Cell>
                  {coverageCell(coverage.clusters[cluster.name], truncated)}
                </Table.Cell>
              ) : null}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}

type BodyProps = { data: topicClustersReportData; plan: TopicClusterPlan };

function TopicClustersBody({ data, plan }: BodyProps) {
  const { coverage, samplingTruncated: truncated } = data;
  const totals = computeClusterPlanTotals(plan.clusters);
  const counts = coverage ? countStatuses(coverage) : null;
  const shown = Math.min(ROADMAP_ROWS, plan.clusters.length);
  const named = data.alsoMapped.slice(0, ALSO_MAPPED_SHOWN);
  const extra = data.alsoMapped.length - named.length;
  // A capped pull cannot establish an absence, and neither a 4xl hero figure
  // nor a tile label has room to qualify one. So the hero prints demand, true
  // either way, and the tile says what the pull actually proved.
  const heroStats = [
    {
      label: "Topic clusters mapped",
      value: formatNumber(totals.clusterCount),
    },
    counts && !truncated
      ? { label: "No page ranking yet", value: formatNumber(counts.missing) }
      : { label: "Monthly searches", value: formatNumber(totals.totalVolume) },
  ];
  const missingLabel = truncated
    ? "No match in the rows we read"
    : "Not yet covered";
  const lead = plan.clusters.length > shown ? `the ${shown} strongest of ` : "";

  return (
    <>
      <ReportHeroStats items={heroStats} />
      <ReportNarrative
        paragraphs={[
          buildIntroParagraph(plan, coverage != null),
          coverage
            ? buildCoverageParagraph(plan.topic, coverage, truncated)
            : describeMissingCoverage(data.gscState, data.gscFailureReason),
        ]}
      />
      {/* Omitted without the cross: a row of em-dashes reads as three zeros. */}
      {counts ? (
        <Section
          title="Where your site already ranks"
          subtitle={coverageSectionSubtitle(counts.total, truncated)}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="Covered" value={formatNumber(counts.covered)} />
            <Tile
              label="Two or more pages competing"
              value={formatNumber(counts.cannibalized)}
            />
            <Tile label={missingLabel} value={formatNumber(counts.missing)} />
          </div>
        </Section>
      ) : null}
      <Section
        title="The roadmap"
        subtitle={`Ranked by search volume against difficulty — ${lead}${plan.clusters.length} clusters.`}
      >
        <RoadmapTable plan={plan} coverage={coverage} truncated={truncated} />
      </Section>
      {/* Mandatory when set: the keyword source has no metro equivalent, so
          these overstate a local client's demand, in the direction that
          flatters us. */}
      {data.confirmedAreaLabel ? (
        <ReportCallout>
          These search volumes are nationwide. This project&apos;s confirmed
          target area is {data.confirmedAreaLabel}, and the keyword source
          behind this plan has no local equivalent — expect real demand in your
          area to be a fraction of the figures above.
        </ReportCallout>
      ) : null}
      {coverage && truncated ? (
        <ReportCallout>
          Search Console returned more rows than we retrieved for this period,
          so a cluster shown above with no match may still have a page ranking
          below where that pull stopped.
        </ReportCallout>
      ) : null}
      {named.length > 0 ? (
        <ReportNarrative
          paragraphs={[
            `This chapter covers the most recent topic we mapped. We also mapped: ${named.join(", ")}${extra > 0 ? `, and ${extra} more` : ""}.`,
          ]}
        />
      ) : null}
    </>
  );
}
