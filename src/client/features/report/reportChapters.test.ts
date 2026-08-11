import { describe, expect, it } from "vitest";
import { buildReportChapters, type ChapterInput } from "./reportChapters";

/**
 * The report is printed and handed to a client, so the interesting assertion is
 * never "the chapter is missing" — it is which sentence the coverage list gives
 * as the reason. Every case below is one where a failed read used to print as a
 * confident "this was never run".
 */

type Data = ChapterInput["data"];

function data(overrides: Partial<Data> = {}): Data {
  return {
    project: undefined,
    domain: "example.com",
    clientOffer: null,
    readFailures: {},
    gsc: null,
    gscFailureReason: null,
    gscPending: false,
    insights: null,
    insightsPending: false,
    backlinks: null,
    domainOverview: null,
    domainSnapshotMissing: true,
    backlinksSnapshotMissing: true,
    domainSnapshotGap: null,
    backlinksSnapshotGap: null,
    keywordDetailsMissing: true,
    backlinkDetailsMissing: true,
    keywordDetailsLoading: false,
    backlinkDetailsLoading: false,
    keywordDetailsError: null,
    backlinkDetailsError: null,
    refreshKeywordDetails: () => {},
    refreshBacklinkDetails: () => {},
    latestAudit: null,
    auditPages: [],
    approvedFixes: [],
    brandVisibility: null,
    currentPages: [],
    previousPages: [],
    topQueries: [],
    topPages: [],
    rankings: [],
    suggestions: [],
    backlinkRows: [],
    referringDomains: [],
    ...overrides,
  };
}

function build(overrides: Partial<Data> = {}) {
  return buildReportChapters({
    data: data(overrides),
    sections: () => null,
    narrativeInput: null,
    positionMove: null,
    movers: [],
    technicalIssues: [],
    recommendations: ["Run a fresh site audit."],
  });
}

function reasonFor(
  result: ReturnType<typeof build>,
  title: string,
): string | undefined {
  return result.omissions.find((omission) => omission.title === title)?.reason;
}

describe("buildReportChapters coverage reasons", () => {
  it("blames a missing connection only when nothing threw", () => {
    expect(reasonFor(build(), "Click performance")).toContain(
      "Search Console is not connected",
    );
  });

  it("says a Search Console read failed instead of calling it disconnected", () => {
    const built = build({ readFailures: { gsc: true } });
    const reason = reasonFor(built, "Click performance");
    expect(reason).not.toContain("not connected");
    expect(reason).toContain("could not be read");
  });

  it("keeps the four connection verdicts distinct from a failure", () => {
    expect(
      reasonFor(
        build({ gscFailureReason: "requires_reconnect" }),
        "Click performance",
      ),
    ).toContain("expired");
  });

  it("names the page table when only that request threw", () => {
    // The summary report can be connected and healthy while this one fails, so
    // "no page rows for this period" would be a finding nobody made.
    const reason = reasonFor(
      build({ readFailures: { topPages: true } }),
      "Top performing pages",
    );
    expect(reason).toContain("page breakdown");
    expect(reason).not.toContain("No page rows");
  });

  it("names the content query rather than Search Console for movers", () => {
    const reason = reasonFor(
      build({ readFailures: { content: true } }),
      "Pages gaining ground",
    );
    expect(reason).toContain("content performance");
  });

  it("separates a failed audit history from an audit that never ran", () => {
    expect(reasonFor(build(), "Site health")).toBe(
      "No site audit has completed for this project yet.",
    );
    const reason = reasonFor(
      build({ readFailures: { audits: true } }),
      "Site health",
    );
    expect(reason).toContain("site audit history");
    expect(reason).toContain("could not be read");
  });

  it("separates a failed link-insights read from an empty quick-wins result", () => {
    const reason = reasonFor(
      build({ readFailures: { insights: true } }),
      "Quick wins & keyword conflicts",
    );
    expect(reason).toContain("internal link analysis");
    expect(reason).not.toContain("Search Console");
  });

  it("carries the snapshot's own verdict onto the backlink chapter", () => {
    expect(reasonFor(build(), "Backlink profile")).toBe(
      "No backlink analysis has been saved for this domain.",
    );
    expect(
      reasonFor(
        build({
          backlinksSnapshotGap: "The saved backlink analysis has expired.",
        }),
        "Backlink profile",
      ),
    ).toContain("expired");
  });

  it("says the paid keyword request failed rather than that it was never run", () => {
    const reason = reasonFor(
      build({ readFailures: { keywordDetails: true } }),
      "Keyword detail",
    );
    expect(reason).toContain("could not be read");
    expect(reason).not.toContain("has not been run");
  });

  it("says the AI visibility read failed rather than that it was never run", () => {
    const reason = reasonFor(
      build({ readFailures: { brandVisibility: true } }),
      "AI search visibility",
    );
    expect(reason).toContain("could not be read");
  });

  it("explains the project row itself when that read is what broke", () => {
    // Without it there is no domain, so every snapshot below was skipped rather
    // than run and found empty.
    expect(
      reasonFor(build({ readFailures: { projects: true } }), "Project details"),
    ).toContain("could not be read");
    expect(reasonFor(build(), "Project details")).toBeUndefined();
  });
});

describe("buildReportChapters not-covered list", () => {
  it("names every feature the report has no chapter for", () => {
    // An agency that ran rank tracking all month found no trace of it here —
    // not even a line saying the report does not look at it.
    expect(build().notCovered).toEqual([
      "Rank Tracking",
      "Local SEO",
      "Local Rank Grid",
      "Competitors",
      "Topic Clusters",
      "Saved Keywords",
      "Trends",
      "SERP",
      "Citations",
    ]);
  });

  it("lists them whatever the project has run", () => {
    expect(build({ readFailures: { gsc: true } }).notCovered).toHaveLength(9);
  });
});
