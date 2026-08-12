import { useQuery } from "@tanstack/react-query";
import { Table } from "@cloudflare/kumo/components/table";
import { getProjects } from "@/serverFunctions/projects";
import { listProjectCompetitors } from "@/serverFunctions/competitors";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import {
  competitorsPageSchema,
  type CompetitorRow,
  type CompetitorsPage,
} from "@/types/schemas/competitors";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { projectCompetitorsQueryKey } from "@/client/features/competitors/competitorsCacheUpdaters";
import { reapplyRestoredOverrides } from "@/client/features/competitors/reapplyRestoredOverrides";
import { groupCompetitorRows } from "@/client/features/competitors/groupCompetitorRows";
import { safeNormalizeDomain } from "@/client/features/competitors/shouldAdoptRestoredRun";
import { describeSnapshotGap } from "@/client/features/report/reportReads";
import { Section, Tile } from "@/client/features/report/ReportPrimitives";
import {
  ReportCallout,
  ReportNarrative,
} from "@/client/features/report/ReportChrome";
import {
  formatCount,
  formatPercent,
  formatPosition,
} from "@/client/features/report/reportModel";
import type {
  ChapterCollector,
  ReportPageSpec,
} from "@/client/features/report/reportChapters";

/**
 * Chapter 04 — "Who you're up against": the last competitor analysis, restored
 * from the run the project already paid for.
 *
 * Free by contract. `restoreLatestRun` reads one D1 row plus that run's own
 * durable R2 copy and `listProjectCompetitors` is a single D1 select — no
 * DataForSEO client is constructed on either path. The keyword gap and the link
 * gap are deliberately absent: neither is recorded as a run, their only copy
 * sits under the 7-day `dataforseo-cache/` prefix, and either bills on a miss.
 *
 * Three things about this data the sheet has to respect:
 *
 * 1. The run may be about SOMEBODY ELSE'S DOMAIN — Competitors analyses any
 *    target an operator types, and `AnalysisRunRepository.latest` orders by
 *    `lastRanAt` alone. Printing that under the client's letterhead is the worst
 *    failure available here, so the gate fails CLOSED: with no project domain in
 *    hand there is nothing to compare the run's label against, and "nothing to
 *    compare" is not "no mismatch". A disabled TanStack query still serves its
 *    cache entry, so a restored run is routinely in hand while `["projects"]` is
 *    still in flight.
 * 2. The stored payload is PRISTINE — no pin/exclude view applied — so the page
 *    is withheld until the overrides read RETURNS, not merely until it fails. An
 *    in-flight read falls back to `[]`, and `reapplyProjectCompetitors` does not
 *    just skip filtering on an empty list, it recomputes `hiddenCount` as 0: the
 *    hidden domains print and the callout disclosing them disappears.
 * 3. No absence may be printed that the reads did not establish — not by a
 *    sentence, not by a zero, and not by a row cap left unmentioned.
 */

const STALE_TIME = 10 * 60_000;
const CHAPTER_TITLE = "Who you're up against";

/** Nothing was ever recorded for this domain. */
const NEVER_RUN = "No competitor analysis has been saved for this domain.";

/**
 * Rows came back, but none survived grouping — all platforms or directories.
 * Never covers "we looked and Google returned nothing": `recordRun` only fires
 * when `stored.rows.length > 0`, so a run that genuinely found no one writes no
 * row and is identical to never-run. The report cannot tell those apart.
 */
const RAN_BUT_EMPTY =
  "The saved competitor analysis found no rival business sites for this domain — every site it surfaced was a platform, marketplace or directory rather than a competitor.";

/** Excluded rather than absent — the sentence above would be a plain falsehood:
 *  sites were found, and the agency marked them hidden. */
const ALL_HIDDEN =
  "Every competing site found for this domain is one you have marked as hidden, so none are listed here.";

/** Both causes at once; either sentence above alone misreports the other group. */
const HIDDEN_AND_PLATFORMS =
  "Apart from the sites you have marked as hidden, every site the saved competitor analysis surfaced for this domain was a platform, marketplace or directory rather than a competitor.";

/** No rows at all and nothing excluded: nothing to characterise either way. */
const NOTHING_STORED =
  "The saved competitor analysis holds no sites for this domain, so there is nothing to list here.";

/** Not the same accusation as never-run: an analysis may well exist, but it
 *  cannot be tied to this project, and an untied run may not print. */
const NO_DOMAIN =
  "This project has no domain on record, so a saved competitor analysis could not be matched to it.";

/**
 * The two overrides-read sentences, worded exactly as `describeSnapshotGap`
 * words them for the subject "this project's pinned and hidden competitors" —
 * spelled out here because this chapter owns its own reads rather than a
 * `ReportReadKey`. The tests assert both against that function's own output.
 */
/**
 * Singular ("list", not "competitors") because `describeSnapshotGap` templates
 * a singular verb — "{subject} was still loading". A plural subject printed
 * "...competitors was still loading" on a sheet handed to a client.
 */
const OVERRIDES_SUBJECT = "this project's pinned and hidden competitor list";

/** Derived, never retyped: a hand-written copy of these had already drifted
 *  from the helper's wording by one verb. */
const OVERRIDES_READ_FAILED = describeSnapshotGap({
  subject: OVERRIDES_SUBJECT,
  isError: true,
  restoring: false,
  outcome: null,
  otherDomain: false,
});
const OVERRIDES_PENDING = describeSnapshotGap({
  subject: OVERRIDES_SUBJECT,
  isError: false,
  restoring: true,
  outcome: null,
  otherDomain: false,
});

/** Both sides through the same normalizer; "couldn't tell" counts as no match. */
function runCoversProjectDomain(runLabel: string, domain: string): boolean {
  const label = safeNormalizeDomain(runLabel);
  const project = safeNormalizeDomain(domain);
  return label != null && project != null && label === project;
}

/**
 * The free reads this chapter needs, and nothing else. Every key is one the
 * dashboard or the Competitors tab already uses — `["projects"]`, the restore's
 * `["analysisRun", "latest", projectId, feature]`, and
 * `projectCompetitorsQueryKey(projectId)` — so a warm cache costs zero fetches.
 */
export function usecompetitorsReportData(projectId: string) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: STALE_TIME,
  });
  const domain =
    projectsQuery.data?.find((entry) => entry.id === projectId)?.domain ?? null;
  const hasDomain = Boolean(domain);

  const run = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.competitors,
    schema: competitorsPageSchema,
    enabled: hasDomain,
  });

  // Same key the hidden-domains manager and `useRestoredCompetitorsRun` use,
  // so this is a cache hit whenever the Competitors tab has already been open.
  const overridesQuery = useQuery({
    queryKey: projectCompetitorsQueryKey(projectId),
    queryFn: () => listProjectCompetitors({ data: { projectId } }),
    enabled: hasDomain,
    staleTime: STALE_TIME,
  });

  // Fail closed on both sides of the gate: `covered` is the only route to a
  // rendered sheet, and `otherDomain` stays false without a domain, because
  // "this run is about someone else" is equally unestablished — the missing
  // domain is its own sentence, one branch earlier.
  const restored = run.restored;
  const covered =
    domain != null &&
    restored != null &&
    runCoversProjectDomain(restored.label, domain);
  const adopted = covered ? restored : null;

  // `undefined` means the read has not returned — never an empty override list.
  const overrides = overridesQuery.data ?? null;
  const applied = overrides
    ? reapplyRestoredOverrides(adopted, overrides)
    : null;

  return {
    projectsReadFailed: projectsQuery.isError,
    /** The project row had not arrived; nothing under it is established yet. */
    projectsPending: projectsQuery.isPending,
    /** False when the project row is missing or carries no domain. */
    hasDomain,
    overridesReadFailed: overridesQuery.isError,
    /** Why the snapshot is not here, when there is more to say than "never
     *  run". Expiry is the steady state here, not an edge case: payloads live
     *  under a 90-day lifecycle and a quarterly report sits on that boundary. */
    snapshotGap: describeSnapshotGap({
      subject: "the saved competitor analysis",
      isError: run.isError,
      restoring: run.isRestoring,
      outcome: run.outcome,
      otherDomain: domain != null && restored != null && !covered,
    }),
    /** A run was restored AND its label normalizes to this project's domain. */
    runAdopted: adopted != null,
    /** Null while the overrides are outstanding — see note 2 in the header. */
    page: applied?.result ?? null,
    /** For the dated narrative; the payload's own `fetchedAt` is the fallback. */
    lastRanAt: applied?.lastRanAt ?? null,
  };
}

type competitorsReportData = ReturnType<typeof usecompetitorsReportData>;

/**
 * Why this chapter has no sheet, most-explanatory-first. Every branch above the
 * last is a read that failed, a read that never returned, or a snapshot that
 * could not be used — none may fall through to `NEVER_RUN`, which blames the
 * agency for work it may well have done. Past `runAdopted`, a missing page is
 * the overrides read and nothing else: it failed, or it is not back yet.
 */
function describeChapterGap(data: competitorsReportData): string | null {
  const projectGap = describeSnapshotGap({
    subject: "this project's own record",
    isError: data.projectsReadFailed,
    restoring: data.projectsPending,
    outcome: null,
    otherDomain: false,
  });
  if (projectGap) return projectGap;
  if (!data.hasDomain) return NO_DOMAIN;
  if (data.snapshotGap) return data.snapshotGap;
  if (!data.runAdopted) return NEVER_RUN;
  if (data.overridesReadFailed) return OVERRIDES_READ_FAILED;
  if (!data.page) return OVERRIDES_PENDING;
  return null;
}

/**
 * Why the table would be empty, in the client's terms. `groupCompetitorRows`
 * runs after exclusions, so "no competitors survived" has two independent
 * causes and they are different claims about the agency's own work: choosing on
 * `hiddenCount > 0` alone printed "every site found is one you hid" over a run
 * that also surfaced three directories.
 */
function describeNoRivals(hiddenCount: number, platformCount: number): string {
  if (platformCount === 0) {
    return hiddenCount > 0 ? ALL_HIDDEN : NOTHING_STORED;
  }
  return hiddenCount > 0 ? HIDDEN_AND_PLATFORMS : RAN_BUT_EMPTY;
}

/** Adds the chapter, or drops it with the reason a client can act on. */
export function buildcompetitorsChapter(
  data: competitorsReportData,
  out: ChapterCollector,
  _sections?: unknown,
): void {
  const gap = describeChapterGap(data);
  const page = data.page;
  if (gap || !page) {
    out.drop(CHAPTER_TITLE, gap ?? OVERRIDES_PENDING);
    return;
  }

  const grouped = groupCompetitorRows(page.rows);
  if (grouped.competitors.length === 0) {
    out.drop(
      CHAPTER_TITLE,
      describeNoRivals(page.hiddenCount, grouped.notCompetitors.length),
    );
    return;
  }

  out.add({
    key: "competitors",
    number: "04",
    kicker: "Opportunities",
    title: CHAPTER_TITLE,
    body: (
      <CompetitorsChapterBody
        page={page}
        rows={grouped.competitors}
        lastRanAt={data.lastRanAt}
      />
    ),
  } satisfies ReportPageSpec);
}

/** The same long-date pattern the Site health section already prints. */
function formatRunDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Dated, never periodic. The serp seed was drawn from Search Console's last 28
 * days AT RUN TIME, so a March run describes a window ending in March, not this
 * report's period — "this month" would be false for any run older than a month.
 */
function buildParagraphs(page: CompetitorsPage, lastRanAt: string | null) {
  const paragraphs: string[] = [];
  const date = formatRunDate(lastRanAt) ?? formatRunDate(page.fetchedAt);
  if (date) {
    paragraphs.push(`FlyRocketSEO last looked for competing sites on ${date}.`);
  }
  if (page.discoveryMode === "serp" && page.seedSize > 0) {
    paragraphs.push(
      `It compared ${formatCount(page.seedSize)} of the searches your site actually appeared for in Google against the sites outranking you on them.`,
    );
  }
  return paragraphs;
}

/** One callout per sheet, but both sentences when both apply: the exclusions
 *  note is the only place the sheet admits the agency filtered this list, and
 *  ranking it behind the seed note hid that fact entirely. */
function buildCallout(page: CompetitorsPage): string | null {
  const notes: string[] = [];
  if (page.seedTruncated) {
    notes.push(
      "Google returned the maximum number of search terms for this comparison, so searches you rank lower for may not be represented above.",
    );
  }
  if (page.hiddenCount > 0) {
    notes.push(
      page.hiddenCount === 1
        ? "1 domain you have marked as not a competitor is excluded from this list."
        : `${page.hiddenCount} domains you have marked as not competitors are excluded from this list.`,
    );
  }
  return notes.length > 0 ? notes.join(" ") : null;
}

const SERP_SUBTITLE =
  "These are the other sites showing up for the searches you appear for, and how much of that ground each one is taking from you.";
const DOMAIN_SUBTITLE =
  "These are the other sites ranking for the same keywords as you, and how much search ground each one already holds.";

/** The metric each mode's table is ranked by — the one the server ordered on
 *  (`rankSerpCompetitors`: beatsYouCount; the domain-overlap mapper:
 *  intersections). Null on rows the other mode measured, and on any row
 *  `applyProjectCompetitors` synthesized for a pin the run never surfaced. */
function strengthOf(row: CompetitorRow, serp: boolean): number | null {
  return serp ? row.beatsYouCount : row.intersections;
}

/**
 * Restores the strength order for display. `applyProjectCompetitors` re-sorts
 * pinned-first, which is right for the tab and wrong here: this sheet's headers
 * promise a ranking, and a pinned row can carry no metrics at all. Measured
 * rows first in the server's own order, unmeasured last where the cap cuts.
 */
export function rankRowsForDisplay(
  rows: CompetitorRow[],
  serp: boolean,
): CompetitorRow[] {
  return rows.toSorted(
    (a, b) => (strengthOf(b, serp) ?? -1) - (strengthOf(a, serp) ?? -1),
  );
}

/**
 * The strongest rival, or null when no row carries the metric that would make
 * it strongest. "Toughest rival" is a superlative claim and row order is not
 * evidence for it: pinning alone puts a domain first, and a pin the run never
 * surfaced arrives with every metric null — so the tile named the agency's own
 * bookmark over a table row of em-dashes. Same rule the insights verdict
 * follows: rate only what was measured, or say nothing at all.
 */
export function pickTopRival(
  rows: CompetitorRow[],
  serp: boolean,
): CompetitorRow | null {
  const best = rankRowsForDisplay(rows, serp)[0] ?? null;
  return best && strengthOf(best, serp) != null ? best : null;
}

/** Eight rows, not ten: narrative plus tiles plus this table has to fit one
 *  printed sheet, and a chapter that overflows continues onto a sheet with no
 *  chapter band and no folio. */
const MAX_ROWS = 8;

/** What the sheet says about the rows the cap cut. A display cap must never
 *  read as a finding: the tile reports every rival found, and this names the
 *  cap out loud. Null when nothing was cut — there is nothing to disclose. */
export function describeRowCap(total: number): string | null {
  if (total <= MAX_ROWS) return null;
  return `Showing the top ${MAX_ROWS} of ${formatCount(total)} competing sites found for this domain.`;
}

/**
 * The columns switch on `discoveryMode` and never render both sets. The two
 * modes populate disjoint fields — the domain-overlap mapper leaves
 * coverage/beatsYouCount null on every row, and serp ranking leaves
 * intersections null — so the wrong set is a table of em-dashes.
 */
function tableColumns(serp: boolean): string[] {
  return serp
    ? ["Beats you on", "Share of your searches", "Their avg position"]
    : [
        "Keywords you both rank for",
        "Their ranked keywords",
        "Their est. monthly traffic",
      ];
}

function rowCells(
  row: CompetitorRow,
  page: CompetitorsPage,
  serp: boolean,
): string[] {
  if (!serp) {
    return [
      formatCount(row.intersections),
      formatCount(row.organicKeywords),
      formatCount(row.organicTraffic),
    ];
  }
  return [
    row.beatsYouCount == null
      ? "—"
      : `${row.beatsYouCount} of ${page.seedSize}`,
    formatPercent(row.coverage),
    formatPosition(row.avgPosition),
  ];
}

function CompetitorsTable({
  page,
  rows,
  serp,
}: {
  page: CompetitorsPage;
  rows: CompetitorRow[];
  serp: boolean;
}) {
  const cap = describeRowCap(rows.length);
  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Site</Table.Head>
            {tableColumns(serp).map((header) => (
              <Table.Head key={header} className="text-right">
                {header}
              </Table.Head>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.slice(0, MAX_ROWS).map((row) => (
            <Table.Row key={row.domain}>
              <Table.Cell className="max-w-xs">
                <span className="line-clamp-1">{row.domain}</span>
              </Table.Cell>
              {rowCells(row, page, serp).map((value, index) => (
                <Table.Cell
                  key={index}
                  className="text-right tabular-nums whitespace-nowrap"
                >
                  {value}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      {cap ? (
        <p className="px-3 py-2 text-xs text-base-content/60">{cap}</p>
      ) : null}
    </div>
  );
}

function CompetitorsChapterBody({
  page,
  rows,
  lastRanAt,
}: {
  page: CompetitorsPage;
  rows: CompetitorRow[];
  lastRanAt: string | null;
}) {
  const serp = page.discoveryMode === "serp";
  const top = pickTopRival(rows, serp);
  const callout = buildCallout(page);
  // Every tile omits `change`: this is the only chapter with no previous
  // period, and a blank delta chip would read as data missing. The count is
  // every rival found, not the capped table length, and the top-rival tile is
  // absent rather than "—" when nothing was measured.
  const tiles: Array<[string, string]> = [
    ["Rivals found", formatCount(rows.length)],
  ];
  if (serp) tiles.push(["Searches compared", formatCount(page.seedSize)]);
  if (top) {
    tiles.push(
      serp
        ? ["Toughest rival", top.domain]
        : ["Shared keywords, top rival", formatCount(top.intersections)],
    );
  }
  return (
    <Section
      title="Competing sites"
      subtitle={serp ? SERP_SUBTITLE : DOMAIN_SUBTITLE}
    >
      <ReportNarrative paragraphs={buildParagraphs(page, lastRanAt)} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <Tile key={label} label={label} value={value} />
        ))}
      </div>
      <CompetitorsTable
        page={page}
        rows={rankRowsForDisplay(rows, serp)}
        serp={serp}
      />
      {callout ? <ReportCallout>{callout}</ReportCallout> : null}
    </Section>
  );
}
