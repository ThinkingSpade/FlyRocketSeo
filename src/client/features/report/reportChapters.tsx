import type { ReactNode } from "react";
import type { GscAccessFailureReason } from "@/shared/gsc";
import { toPath } from "@/client/features/report/reportModel";
import {
  buildClickNarrative,
  buildKeywordNarrative,
  buildPerformanceNarrative,
  buildTopPagesNarrative,
} from "@/client/features/report/reportNarrative";
import {
  ReportCallout,
  ReportNarrative,
} from "@/client/features/report/ReportChrome";
import {
  ContentMovers,
  type OnPageOptimizations,
} from "@/client/features/report/ReportImprovements";
import { buildSiteChapters } from "@/client/features/report/reportChaptersSite";
import {
  buildFeatureChapters,
  type ReportChapterData,
} from "@/client/features/report/chapters";
import { describeFailedReads } from "@/client/features/report/reportReads";
import type { ReportSectionKey } from "@/client/features/report/ReportSections";
import type { useClientReportData } from "@/client/features/report/useClientReportData";

/**
 * Which chapters the report prints, and why the others are left out.
 *
 * Every chapter used to print regardless of whether its analysis had run, so a
 * project with only Search Console disconnected produced thirteen sheets,
 * eleven of them a chapter band, a heading and one sentence of apology. A
 * chapter now earns its sheet by having something on it; the rest travel as one
 * grouped list on the summary page, which is shorter to read and names the
 * analysis that would fill each gap.
 *
 * The rule for what still counts as content: a finding stays, an absence goes.
 * "No page gained clicks this period" is a result the client needs and keeps
 * its page; "Search Console isn't connected" is not a result.
 *
 * This file holds the Search Console chapters; `reportChaptersSite` holds the
 * ones built from the crawl, the link profile and AI visibility.
 */

export type ReportPageSpec = {
  key: string;
  number: string;
  kicker: string;
  title: string;
  body: ReactNode;
};

/** A chapter left out, and the reason a client can act on. */
export type ReportOmission = { title: string; reason: string };

/** Where each builder puts its chapters, and its gaps. */
export type ChapterCollector = {
  add: (spec: ReportPageSpec) => void;
  drop: (title: string, reason: string) => void;
};

export type ChapterInput = {
  data: ReturnType<typeof useClientReportData>;
  /**
   * The eight feature chapters' own reads. Required rather than optional: a
   * caller that forgot it would drop eight chapters from the PDF with nothing
   * on the coverage list to say so, which is the exact failure this file
   * exists to prevent.
   */
  chapters: ReportChapterData;
  /** Renders the shared data sections, so one chapter can span pages. */
  sections: (only: ReportSectionKey[]) => ReactNode;
  narrativeInput: Parameters<typeof buildPerformanceNarrative>[0] | null;
  positionMove: number | null;
  movers: Parameters<typeof ContentMovers>[0]["rows"];
  technicalIssues: Parameters<typeof OnPageOptimizations>[0]["issues"];
  recommendations: string[];
};

// Reached only through `describeGscGap` now, so a thrown request can never
// arrive at this sentence by a route that skipped the failure check.
const NO_GSC =
  "Search Console is not connected for this project, so Google search data is unavailable.";

/**
 * Why Google search data is missing, in the coverage list a client reads.
 *
 * The server already distinguishes four causes and the Search Performance tab
 * surfaces all four (`getGscAccessNotice`). The report collapsed them into the
 * sentence above, so an expired grant or a revoked property permission on a
 * live, correctly-configured connection printed as "not connected" -- telling
 * the client the agency never set it up. `not_connected` keeps the original
 * wording, and a null reason (nothing settled yet) does too.
 */
function describeMissingGsc(reason: GscAccessFailureReason | null): string {
  switch (reason) {
    case "requires_reconnect":
      return "The Search Console connection expired, so Google search data could not be read for this period.";
    case "permission_denied":
      return "Google denied access to the connected Search Console property, so its data could not be read for this period.";
    case "api_not_configured":
      return "The Search Console API is not enabled for the connected Google Cloud project, so its data could not be read.";
    default:
      return NO_GSC;
  }
}

/**
 * The Search Console gap sentence, with a thrown request outranking every
 * connection verdict.
 *
 * A failed query leaves `gsc` null and `gscFailureReason` null, which fell
 * through `describeMissingGsc` to "Search Console is not connected for this
 * project" — a claim about the agency's setup, printed because a request
 * timed out. Both chapter builders route through here so neither can drift.
 */
export function describeGscGap(data: ChapterInput["data"]): string {
  return (
    describeFailedReads(data.readFailures, ["gsc"]) ??
    describeMissingGsc(data.gscFailureReason)
  );
}

export const CHAPTER_BODY = "#2f3a49"; // matches ReportChrome's paragraph ink

/**
 * Features this report has no chapter for, at all, for any project.
 *
 * They are listed rather than left out because silence here is indistinguishable
 * from a finding: an agency that ran rank tracking every week for a month handed
 * over a report with no trace of it, and nothing on the sheet said whether that
 * meant "nothing happened" or "we never look at this". Naming them costs one
 * line and answers it.
 *
 * Hand-maintained on purpose — there is no registry of tabs to derive it from,
 * and a wrong entry here is a sentence in a client's PDF, so it should take a
 * deliberate edit. Building actual chapters for these is the real fix; until
 * then this is the honest placeholder.
 */
const NOT_COVERED: readonly string[] = [
  // The other eight now have chapters (see `./chapters`), so they reach the
  // coverage list only through `out.drop` with a project-specific reason.
  //
  // Local Rank Grid stays here, and not because it was forgotten: a grid scan
  // is addressed by its parameters, which live only in the tab's URL, and its
  // cache key is a digest of them with no row in D1 to enumerate. A chapter
  // could only guess at the parameters, and a wrong guess returns an empty
  // grid — byte-identical to a scan that found the client ranking nowhere.
  // Printing "you rank nowhere nearby" because we could not find the scan is
  // worse than printing nothing, so this line is the honest answer until the
  // scans are addressable.
  "Local Rank Grid",
];

export function buildReportChapters(input: ChapterInput): {
  pages: ReportPageSpec[];
  omissions: ReportOmission[];
  notCovered: readonly string[];
} {
  const pages: ReportPageSpec[] = [];
  const omissions: ReportOmission[] = [];
  const out: ChapterCollector = {
    add: (spec) => pages.push(spec),
    drop: (title, reason) => omissions.push({ title, reason }),
  };

  // Listed first because it explains the others: without the project row there
  // is no domain, so every snapshot and metered read below was skipped rather
  // than run and found empty.
  const projectGap = describeFailedReads(input.data.readFailures, ["projects"]);
  if (projectGap) out.drop("Project details", projectGap);

  buildSearchChapters(input, out);
  buildSiteChapters(input, out);
  buildFeatureChapters(input.chapters, out);

  // The band number is printed on every sheet, and the builders above emit
  // theirs in source order, not band order — the feature chapters run last but
  // carry bands 01 through 06. Sorting here keeps the printed numbers running
  // forwards through the PDF; `sort` is stable, so chapters sharing a band keep
  // the order their builder chose.
  const ordered = pages.toSorted((left, right) =>
    left.number.localeCompare(right.number),
  );

  return { pages: ordered, omissions, notCovered: NOT_COVERED };
}

/** Chapters 01–02: everything derived from Search Console. */
function buildSearchChapters(input: ChapterInput, out: ChapterCollector): void {
  const { data, sections, narrativeInput, positionMove } = input;
  const { gsc, topQueries, topPages, readFailures } = data;
  // A request still in flight is neither present nor absent. Keeping those
  // chapters in is what stops the report claiming, in a PDF that outlives the
  // load, that data is missing when it was merely still arriving.
  const loading = data.gscPending || data.insightsPending;
  const gscGap = describeGscGap(data);

  if (gsc || data.domainOverview || data.backlinks || loading) {
    out.add({
      key: "performance",
      number: "01",
      kicker: "Performance",
      title: "Overall performance",
      body: (
        <>
          {narrativeInput ? (
            <ReportNarrative
              paragraphs={buildPerformanceNarrative(narrativeInput)}
            />
          ) : null}
          {/* Only claim the Search Console provenance when this chapter was
              actually admitted on GSC data. A domain-overview or backlink
              snapshot admits it too, and in that case this callout printed
              "we read your Search Console data" directly above the summary
              section's own "Search Console isn't connected for this project"
              -- two contradictory sentences on one sheet handed to a
              client. */}
          {gsc ? (
            <ReportCallout>
              FlyRocketSEO read this period&apos;s Search Console data and
              compared it against the previous period to build every figure on
              this page.
            </ReportCallout>
          ) : null}
          {sections(["summary"])}
        </>
      ),
    });
  } else {
    // Three possible sources, so the reason names whichever one actually broke
    // before falling back to "none of them exist" — an expired snapshot and a
    // project that never ran the analysis both landed on that last sentence.
    out.drop(
      "Overall performance",
      describeFailedReads(readFailures, ["gsc"]) ??
        data.domainSnapshotGap ??
        data.backlinksSnapshotGap ??
        "No Search Console connection, domain overview snapshot or backlink snapshot is available for this project.",
    );
  }

  if (narrativeInput) {
    out.add({
      key: "clicks",
      number: "01",
      kicker: "Performance",
      title: "Click performance",
      body: (
        <>
          <ReportNarrative paragraphs={buildClickNarrative(narrativeInput)} />
          <ReportCallout>
            Every click here is someone who chose your result over the rest of
            the page — the titles and descriptions in chapter 03 are what move
            it.
          </ReportCallout>
        </>
      ),
    });
  } else if (!loading) {
    out.drop("Click performance", gscGap);
  }

  if (topPages.length > 0) {
    out.add({
      key: "top-pages",
      number: "01",
      kicker: "Performance",
      title: "Top performing pages",
      body: (
        <>
          <ReportNarrative
            paragraphs={buildTopPagesNarrative(
              topPages.map((row) => ({
                path: toPath(row.key),
                clicks: row.clicks,
                impressions: row.impressions,
              })),
            )}
          />
          {sections(["pages"])}
        </>
      ),
    });
  } else if (!loading) {
    // The page table is its own request: it can throw while the summary report
    // is healthy and connected, in which case "no page rows for this period" is
    // a finding we never made.
    out.drop(
      "Top performing pages",
      describeFailedReads(readFailures, ["topPages"]) ??
        (gsc ? "No page rows for this period." : gscGap),
    );
  }

  if (topQueries.length > 0) {
    out.add({
      key: "keywords",
      number: "01",
      kicker: "Performance",
      title: "Keyword rankings",
      body: (
        <>
          <ReportNarrative
            paragraphs={buildKeywordNarrative(
              topQueries.map((row) => ({
                query: row.key,
                clicks: row.clicks,
                impressions: row.impressions,
              })),
              positionMove,
            )}
          />
          {sections(["queries"])}
        </>
      ),
    });
  } else if (!loading) {
    out.drop(
      "Keyword rankings",
      describeFailedReads(readFailures, ["topQueries"]) ??
        (gsc ? "No query rows for this period." : gscGap),
    );
  }

  // Kept even when nothing gained ground: with the underlying data present,
  // "no page gained clicks" is a finding the client needs, not an absence.
  if (data.currentPages.length > 0 || data.previousPages.length > 0) {
    out.add({
      key: "movers",
      number: "02",
      kicker: "Content",
      title: "Pages gaining ground",
      body: <ContentMovers rows={input.movers} />,
    });
  } else if (!loading) {
    // Not NO_GSC unconditionally: these rows come from the content query, not
    // the GSC report, so Search Console can be connected and healthy while
    // this chapter has nothing -- and the client was told their Search Console
    // was not connected. Same shape the chapters above already use.
    out.drop(
      "Pages gaining ground",
      describeFailedReads(readFailures, ["content"]) ??
        (gsc ? "No page-level movement was recorded for this period." : gscGap),
    );
  }
}
