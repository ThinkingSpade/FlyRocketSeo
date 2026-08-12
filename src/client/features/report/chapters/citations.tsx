import { Table } from "@cloudflare/kumo/components/table";
import type { z } from "zod";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { buildCitationReport } from "@/client/features/citations/citationModel";
import {
  ReportCallout,
  ReportHeroStats,
  ReportNarrative,
} from "@/client/features/report/ReportChrome";
import { Section } from "@/client/features/report/ReportPrimitives";
import { describeSnapshotGap } from "@/client/features/report/reportReads";
import type {
  ChapterCollector,
  ReportPageSpec,
} from "@/client/features/report/reportChapters";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { DIRECTORIES } from "@/shared/citations/directories";
import { citationTrackerResultSchema } from "@/types/schemas/citations";

/**
 * Client Report chapter: which major directories the business actually turned
 * up in, read from the last saved Citation Tracker run.
 *
 * FREE BY CONTRACT. The only read here is `restoreLatestRun` (via
 * `useAutoRestoredRun`), which reads a stored row plus an R2 object the run
 * already paid for and can never trigger a metered fetch. The metered path —
 * `getCitationReport`, which reaches DataForSEO's live SERP with credit feature
 * "local_seo" — is deliberately not imported here: it may only ever run from an
 * explicit click on the Local SEO tab, and this report opens for free.
 *
 * DATE, YES — PERIOD, NO. Every other chapter is period-over-period; this one
 * has no previous value to compare against and never will, because each run
 * overwrites the same (project, feature, cacheKey) row. So the sheet says
 * "as of <date>" and must never say "this month" or "this period".
 *
 * WHOSE BUSINESS THIS IS. Unlike the backlink and domain snapshots there is no
 * domain in the payload, so there is no `reportSnapshotMatchesDomain` check
 * available — `otherDomain` is hard false below. The row is scoped by
 * projectId at AnalysisRunRepository.latest(), and that scoping is the only
 * claim of ownership we can honestly make. What we can do instead is print the
 * business name, the city and the searched query on the sheet, so a
 * multi-location client whose last run was about another branch can see that
 * rather than be told it silently.
 */

type CitationRun = z.infer<typeof citationTrackerResultSchema>;

/**
 * The only sentence written here rather than reused.
 *
 * It names where the button lives and says outright that the check is not part
 * of the monthly crawl — without that, "no citation check" reads to a client as
 * "your agency never checked", which is an accusation the data does not
 * support. It covers ONLY that case: a failed or expired read comes from
 * `describeSnapshotGap`, a run that cannot be dated gets `UNDATED_RUN`, a
 * search with nothing in it gets `nothingToShow`, and the "nothing confirmed
 * anywhere" reading is `citationModel`'s own verdict text on the sheet.
 */
const NEVER_RUN =
  "No citation check has been saved for this project. It is a metered search run from the Local SEO tab, not part of the monthly crawl.";

/**
 * One title for the sheet and for the omission line, as every sibling chapter
 * does (`competitors.tsx` "Who you're up against", `serpOverview.tsx` "Who
 * ranks for your keyword").
 *
 * It deliberately does NOT reuse the string "Citations" from the summary
 * page's not-covered list. That list says of its entries "the report has no
 * chapter for them yet", and the omission block above it promises "running the
 * analysis named in each adds it to the next report" — so the same word in
 * both blocks printed two contradictory promises on one page, and named the
 * missing section something no chapter is ever called.
 */
const CHAPTER_TITLE = "Where your business shows up in directories";

/**
 * The date is the whole defence against a stale run printing as current fact,
 * so a run we cannot date is a run we cannot print — the same call
 * `serpOverview.tsx` makes for its own undated lookups.
 */
const UNDATED_RUN =
  "The saved citation check carries no readable date, so this report cannot confirm when it was made or whether it still describes today's search results.";

/**
 * The search ran, and came back with nothing this chapter can honestly draw on.
 *
 * Both wordings avoid the one sentence that would be a lie: that the business
 * is in no directories. Nothing was confirmed AND nothing was ruled out — a
 * 40pt "0" over an empty table would have said the first half only.
 */
function nothingToShow(resultCount: number): string {
  if (resultCount === 0) {
    return "The saved citation check came back with no search results at all, so it neither confirmed nor ruled out a single directory. Re-running it from the Local SEO tab is what would fill this section in.";
  }
  const results = resultCount === 1 ? "result" : "results";
  return `The saved citation check came back with only ${resultCount} search ${results} — too few to judge directory coverage from, and none of them was a directory on this report's list. Re-running it from the Local SEO tab is what would fill this section in.`;
}

const STATUS_CONFIRMED = "Confirmed listing";
const STATUS_UNCONFIRMED = "Appeared, not confirmed";
const STATUS_ABSENT = "Didn't surface";

/**
 * The one free read this chapter needs.
 *
 * The query key is `useAutoRestoredRun`'s own — ["analysisRun", "latest",
 * projectId, "citation_tracker"] — which is exactly the key the Citation
 * Tracker section on the Local SEO tab already warms, so opening the report
 * after visiting that tab costs zero extra fetches.
 */
export function usecitationsReportData(projectId: string) {
  const run = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.citationTracker,
    schema: citationTrackerResultSchema,
    enabled: true,
  });

  return {
    citations: run.restored?.result ?? null,
    /**
     * Why `citations` is null, when there is more to say than "never run".
     *
     * `isError` is passed through rather than dropped: a restore that threw
     * used to flatten into the same null as a run that never happened, and the
     * report then printed "no citation check has been saved" — blaming the
     * agency for a request that failed. Null here means the ordinary never-run
     * case, which the builder words itself.
     */
    citationsGap: describeSnapshotGap({
      subject: "the saved citation check",
      isError: run.isError,
      restoring: run.isRestoring,
      outcome: run.outcome,
      // No domain in the payload to compare against; see the file comment.
      otherDomain: false,
    }),
  };
}

type citationsReportData = ReturnType<typeof usecitationsReportData>;

type CitationReport = ReturnType<typeof buildCitationReport>;

type DirectoryRow = { id: string; name: string; status: string };

/**
 * Whether the model judged the WHOLE list, or only reported what it saw.
 *
 * `buildCitationReport` returns `unknownVerdict` — and only ever from its
 * thin-data branch, where it leaves `missing` deliberately empty because an
 * absence claim off a handful of search results is not one it will make. Every
 * other path sets good/mixed/bad. So the tone is the model's own signal, and
 * without it this sheet may print no denominator, no remainder and no
 * whole-list table: each of those is a claim about the directories that are
 * NOT in `found`, which is exactly the claim being withheld.
 */
function judgedWholeList(report: CitationReport): boolean {
  return report.verdict.tone !== "unknown";
}

/**
 * The table's rows, built from the model's three arrays and never from
 * DIRECTORIES itself.
 *
 * That distinction is load-bearing. In the thin-data branch the model returns
 * `missing` deliberately empty, because an absence claim off four search
 * results is not one it is willing to make. A table driven off DIRECTORIES
 * would stamp "Didn't surface" on every row in that list from evidence the
 * model explicitly refused to draw — printed, in a client's PDF, as fact.
 */
function directoryRows(report: CitationReport): DirectoryRow[] {
  return [
    ...report.found.map((match) => ({
      id: match.directory.id,
      name: match.directory.name,
      status: STATUS_CONFIRMED,
    })),
    ...report.unconfirmed.map((match) => ({
      id: match.directory.id,
      name: match.directory.name,
      status: STATUS_UNCONFIRMED,
    })),
    ...report.missing.map((directory) => ({
      id: directory.id,
      name: directory.name,
      status: STATUS_ABSENT,
    })),
  ];
}

/**
 * The long-date pattern every other dated chapter in this report prints
 * (`localSeo.tsx`, `competitors.tsx`, serpOverview's `formatRunDate`), in the
 * reader's own timezone.
 *
 * This used to be `fetchedAt.slice(0, 10)`, which printed a raw ISO string —
 * and the UTC calendar day at that. A run made at 9pm on the 14th in Chicago
 * carries `2026-06-15T02:00:00Z`, so the sheet said "as of 2026-06-15": a day
 * the client had not lived yet, and later than the report's own "Generated"
 * foot, which is formatted locally.
 *
 * Null when the stored instant will not parse — the caller drops the chapter
 * rather than print an undateable run as current fact.
 */
function formatDay(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The provenance line under the table heading.
 *
 * The query, the business, the city and the date are the whole defence against
 * a stale or wrong-location run printing as current fact. They are not
 * decoration and should not be trimmed for width.
 */
function provenance(result: CitationRun, day: string): string {
  const where = result.city
    ? `${result.businessName}, ${result.city}`
    : result.businessName;
  return `Searched "${result.query}" · ${where} · as of ${day}`;
}

function DirectoryTable({ rows }: { rows: DirectoryRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Directory</Table.Head>
            <Table.Head>Status</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.id}>
              <Table.Cell>{row.name}</Table.Cell>
              <Table.Cell>{row.status}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}

function citationsChapter(
  result: CitationRun,
  report: CitationReport,
  rows: DirectoryRow[],
  day: string,
): ReportPageSpec {
  const judged = judgedWholeList(report);
  // Only meaningful when coverage was NOT judged: there, the table holds just
  // the directories that appeared, and this is how many of the list it is
  // silent about. In the judged branch every directory has a row and this is 0.
  const unlisted = DIRECTORIES.length - rows.length;

  return {
    key: "citations",
    // 07/"Local presence" is the pairing `localSeo.tsx` already owns, and the
    // number↔kicker pairing is 1:1 in the printed band. 06 belongs to "Next
    // steps"; taking it here numbered two different sections 06 and split one
    // kicker across two numbers.
    number: "06",
    kicker: "Local presence",
    title: CHAPTER_TITLE,
    body: (
      <>
        {/* Never a hero figure for `missing`: that is an absence the data
            cannot carry at 40pt type. And never a denominator unless the model
            judged the whole list — "1 of 19" printed above "too few to judge
            citation coverage" makes, in 40pt, the exact claim the sentence
            below it refuses to make. */}
        <ReportHeroStats
          items={[
            {
              label: judged ? "Confirmed listings" : "Confirmed in this search",
              value: judged
                ? `${report.found.length} of ${DIRECTORIES.length}`
                : String(report.found.length),
            },
            {
              label: "Also appeared",
              value: String(report.unconfirmed.length),
            },
          ]}
        />
        {/* citationModel already writes this report's honesty bar — including
            the "none confirmed" reading, which is a finding and keeps its
            sheet. Render the string; do not paraphrase it, or the two copies
            will drift. */}
        <ReportNarrative paragraphs={[report.verdict.read]} />
        <Section
          title={judged ? "Directories checked" : "What this search turned up"}
          subtitle={
            judged || unlisted === 0
              ? provenance(result, day)
              : `${provenance(result, day)} · Only the directories that appeared are listed; the other ${unlisted} on this list could not be judged from a search this thin.`
          }
        >
          <DirectoryTable rows={rows} />
        </Section>
        <ReportCallout>
          A directory that did not surface in this search is not proof no
          listing exists, and a duplicate listing does real harm — check by hand
          before creating anything.
        </ReportCallout>
      </>
    ),
  };
}

/**
 * Adds the chapter, or drops it with the reason a client can act on.
 *
 * Added whenever a run restored with something to show — including when the
 * search confirmed nothing across the whole list. Under the report's own rule,
 * "none of the directories surfaced" is a finding and keeps its sheet.
 *
 * Dropped, with the cause named each time, when there is no saved run, when
 * the read failed or expired, when the run cannot be dated, and when the
 * search was too thin to judge coverage AND turned up no directory at all —
 * that last sheet would have been a 40pt "0" over an empty table, which reads
 * as "your business is in no directories" and is a claim this data cannot make.
 */
export function buildcitationsChapter(
  data: citationsReportData,
  out: ChapterCollector,
  sections?: unknown,
): void {
  // This chapter renders no shared data section; the parameter exists so the
  // coordinator can call every chapter builder through one signature.
  void sections;

  const result = data.citations;
  if (!result) {
    // The gap sentence always wins when there is one: a failed read, a payload
    // that aged out of R2, a stored shape this report can no longer parse and a
    // restore still in flight are four different things, and every one of them
    // used to print as "no citation check has been saved".
    out.drop(CHAPTER_TITLE, data.citationsGap ?? NEVER_RUN);
    return;
  }

  const day = formatDay(result.fetchedAt);
  if (!day) {
    out.drop(CHAPTER_TITLE, UNDATED_RUN);
    return;
  }

  const report = buildCitationReport({
    business: {
      name: result.businessName,
      city: result.city,
      phone: result.phone,
    },
    results: result.results,
  });
  const rows = directoryRows(report);

  // A 0-result run is stored and restores as ready (CitationTrackerService
  // caches and records regardless of count), so this branch is reached, not
  // theoretical.
  if (!judgedWholeList(report) && rows.length === 0) {
    out.drop(CHAPTER_TITLE, nothingToShow(result.results.length));
    return;
  }

  out.add(citationsChapter(result, report, rows, day));
}
