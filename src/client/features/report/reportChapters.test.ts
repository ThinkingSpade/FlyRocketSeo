import { describe, expect, it, vi } from "vitest";

// `buildReportChapters` now reaches the eight feature builders, and those
// modules sit beside their hooks, which import the server functions and so the
// D1 provider. Only the Workers builtin is stubbed — the repo's standing idiom
// for this — rather than the app's own modules, so the builders under test are
// the real ones.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { buildReportChapters, type ChapterInput } from "./reportChapters";
import type { ReportChapterData } from "./chapters";

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
    auditDomainExpirationJson: null,
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

/**
 * A project where none of the eight feature analyses has ever been run.
 *
 * Typed rather than cast: these chapters print sentences about work the agency
 * did or did not do, so when one grows a field the compiler should stop here
 * and make someone decide what "nothing has been run" means for it.
 */
function emptyChapters(): ReportChapterData {
  return {
    keywordTrends: {
      rows: [],
      range: null,
      currentQueryCount: 0,
      excludedByFit: 0,
      currentTruncated: false,
      previousTruncated: false,
      connected: false,
      isError: false,
      isPending: false,
    },
    topicClusters: {
      plan: null,
      planIsError: false,
      planRestoring: false,
      planOutcome: "none",
      confirmedAreaLabel: null,
      alsoMapped: [],
      gscState: "absent",
      gscFailureReason: null,
      samplingTruncated: false,
      coverage: null,
    },
    competitors: {
      projectsReadFailed: false,
      projectsPending: false,
      hasDomain: false,
      overridesReadFailed: false,
      snapshotGap: null,
      runAdopted: false,
      page: null,
      lastRanAt: null,
    },
    savedKeywords: {
      rows: [],
      portfolio: {
        keywordCount: 0,
        totalVolume: 0,
        averageDifficulty: null,
        quickWins: 0,
        offTarget: 0,
        offTargetQuickWins: 0,
        intentMix: [],
      },
      // Nothing saved, so there is nothing to check against the profile and
      // the count is complete rather than an upper bound.
      fitStatus: "not-configured",
      isError: false,
      isPending: false,
    },
    serpOverview: {
      domain: "example.com",
      run: null,
      readFailed: null,
      snapshotGap: null,
      neverRun: true,
      unvouched: null,
      generatedAt: "2026-08-11T00:00:00.000Z",
    },
    rankTracking: {
      domain: "example.com",
      projectsError: false,
      projectsPending: false,
      summariesError: false,
      summariesPending: false,
      moversError: false,
      moversPending: false,
      configCount: 0,
      matchedCount: 0,
      configs: [],
    },
    localSeo: {
      profile: null,
      domain: "example.com",
      connected: false,
      posts: [],
      periodStart: "2026-07-14",
      periodEnd: "2026-08-11",
      periodLabel: "last 28 days",
      readFailures: {
        projects: false,
        localBusiness: false,
        gbpConnection: false,
        gbpPosts: false,
      },
      pendingReads: {
        projects: false,
        localBusiness: false,
        gbpConnection: false,
        gbpPosts: false,
      },
    },
    citations: { citations: null, citationsGap: null },
  };
}

function build(overrides: Partial<Data> = {}) {
  return buildReportChapters({
    data: data(overrides),
    chapters: emptyChapters(),
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
    // The other eight moved from this blanket line to real chapters, so each
    // now reaches the coverage list through its own builder with a reason
    // about THIS project. Local Rank Grid stays: its scans are addressed by
    // parameters that live only in the tab's URL, and a guessed lookup returns
    // an empty grid — indistinguishable from a scan that found the client
    // ranking nowhere.
    expect(build().notCovered).toEqual(["Local Rank Grid"]);
  });

  it("lists it whatever the project has run", () => {
    expect(build({ readFailures: { gsc: true } }).notCovered).toHaveLength(1);
  });

  it("gives the eight a named reason rather than dropping them silently", () => {
    // The point of the chapters is that a feature never leaves the report
    // without a sentence. With nothing run, every one of them owes the
    // coverage list a line.
    const titles = build().omissions.map((omission) => omission.title);
    // The client-facing chapter titles, not the tab names: the coverage list
    // is read by someone who has never seen the app.
    for (const title of [
      "Tracked keyword positions", // Rank Tracking
      "Your Google Business Profile", // Local SEO
      "Who you're up against", // Competitors
      "Topics worth owning", // Topic Clusters
      "The keywords we're targeting", // Saved Keywords
      "Search terms gaining and losing ground", // Trends
      "Who ranks for your keyword", // SERP
      "Where your business shows up in directories", // Citations
    ]) {
      expect(titles, `no coverage line for ${title}`).toContain(title);
    }
  });
});
