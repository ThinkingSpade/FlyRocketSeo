import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The chapter builder is pure, but its module pulls in `useAutoRestoredRun`
 * and the Search Console read, both of which reach a server function and from
 * there `cloudflare:workers`. Stubbing the two server-function modules keeps
 * the import graph loadable without a worker runtime; nothing below calls a
 * hook, so no React Query context is ever needed.
 */
vi.mock("@/serverFunctions/analysisRuns", () => ({
  restoreLatestRun: () => Promise.resolve({ status: "none" }),
  restoreRun: () => Promise.resolve({ status: "none" }),
  getRecentRuns: () => Promise.resolve([]),
}));
vi.mock("@/serverFunctions/searchPerformance", () => ({
  getSearchPerformanceReport: () => Promise.resolve({ connected: false }),
}));

// `vi.mock` is hoisted above this, so the stubs are already in place.
import {
  buildtopicClustersChapter,
  type topicClustersReportData,
} from "./topicClusters";

type Data = topicClustersReportData;
type Plan = NonNullable<Data["plan"]>;
type Coverage = NonNullable<Data["coverage"]>;

function keyword(word: string) {
  return { keyword: word, searchVolume: 100, keywordDifficulty: 20 };
}

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    topic: "solar panels",
    locationCode: 2840,
    languageCode: "en",
    hub: [keyword("solar panels")],
    clusters: [
      {
        name: "solar panel cost",
        keywords: [keyword("solar panel cost"), keyword("solar panel price")],
        totalVolume: 900,
      },
      {
        name: "solar panel installers",
        keywords: [keyword("solar panel installers")],
        totalVolume: 400,
      },
    ],
    fetchedAt: "2026-03-12T09:00:00.000Z",
    ...overrides,
  };
}

function data(overrides: Partial<Data> = {}): Data {
  return {
    plan: plan(),
    planIsError: false,
    planRestoring: false,
    planOutcome: "ready",
    confirmedAreaLabel: null,
    alsoMapped: [],
    gscState: "absent",
    gscFailureReason: null,
    samplingTruncated: false,
    coverage: null,
    ...overrides,
  };
}

function coverage(overrides: Partial<Coverage> = {}): Coverage {
  return {
    hub: { status: "covered", pageCount: 1, pages: ["/solar"] },
    clusters: {
      "solar panel cost": { status: "covered", pageCount: 1, pages: ["/cost"] },
      "solar panel installers": { status: "missing", pageCount: 0, pages: [] },
    },
    ...overrides,
  };
}

function build(overrides: Partial<Data> = {}) {
  const pages: Array<{ key: string; number: string; title: string }> = [];
  const omissions: Array<{ title: string; reason: string }> = [];
  const bodies: ReactNode[] = [];
  buildtopicClustersChapter(data(overrides), {
    add: (spec) => {
      pages.push({ key: spec.key, number: spec.number, title: spec.title });
      bodies.push(spec.body);
    },
    drop: (title, reason) => omissions.push({ title, reason }),
  });
  return {
    pages,
    omissions,
    reason: omissions[0]?.reason,
    html: bodies[0] ? renderToStaticMarkup(bodies[0]) : "",
  };
}

describe("buildtopicClustersChapter admission", () => {
  it("adds the chapter when a plan with clusters was restored", () => {
    const built = build();
    expect(built.omissions).toEqual([]);
    expect(built.pages).toEqual([
      { key: "topic-clusters", number: "02", title: "Topics worth owning" },
    ]);
  });

  it("says the read failed rather than that nothing was ever run", () => {
    // The defect this chapter effort exists to fix: a thrown request printing,
    // in a PDF handed to a client, as work the agency never did.
    const built = build({ plan: null, planIsError: true, planOutcome: null });
    expect(built.pages).toEqual([]);
    expect(built.reason).toBe(
      "The saved topic cluster plan could not be read while this report was generated — that request failed rather than returning nothing.",
    );
  });

  it("says nothing was saved only when the restore settled empty", () => {
    const built = build({ plan: null, planOutcome: "none" });
    expect(built.pages).toEqual([]);
    expect(built.reason).toBe(
      "No topic cluster plan has been saved for this project.",
    );
  });

  it("names the empty plan's own topic when the mapping found no clusters", () => {
    const built = build({ plan: plan({ clusters: [] }) });
    expect(built.pages).toEqual([]);
    expect(built.reason).toBe(
      "The saved topic plan for “solar panels” found no keyword clusters — too few related searches around that topic to group into a roadmap.",
    );
  });

  it("keeps an expired payload distinct from a plan that never ran", () => {
    const built = build({ plan: null, planOutcome: "expired" });
    expect(built.reason).toContain("has expired");
    expect(built.reason).not.toContain("has been saved");
  });

  it("keeps a still-loading restore distinct from a missing one", () => {
    const built = build({ plan: null, planRestoring: true, planOutcome: null });
    expect(built.reason).toContain("still loading");
  });
});

describe("buildtopicClustersChapter sheet", () => {
  it("dates the landscape and refuses to call it a reporting period", () => {
    const html = build().html;
    expect(html).toContain("March 12, 2026");
    expect(html).toContain("not a count for this reporting period");
  });

  it("does not claim a coverage check it never made", () => {
    const html = build().html;
    expect(html).not.toContain("your next pages");
    expect(html).toContain("Search Console is not connected for this project");
    // A row of blanks under "Where your site already ranks" reads as three
    // zeros, so the whole section is omitted instead.
    expect(html).not.toContain("Where your site already ranks");
  });

  it("says the Search Console read failed rather than blaming the connection", () => {
    const html = build({ gscState: "failed" }).html;
    expect(html).toContain("could not be read");
    expect(html).not.toContain("is not connected");
  });

  /**
   * `getSearchPerformanceReport` RESOLVES `{ connected: false, reason }` for an
   * expired grant, a revoked permission and a disabled API — nothing throws, so
   * the failed/pending ladder above never sees them. Collapsing all four into
   * "not connected" prints, in a PDF handed to the client, that the agency
   * never set Search Console up — and contradicts the summary chapters, which
   * word the same four causes apart.
   */
  it("names an expired connection instead of calling it never connected", () => {
    const html = build({
      gscState: "absent",
      gscFailureReason: "requires_reconnect",
    }).html;
    expect(html).toContain("The Search Console connection expired");
    expect(html).not.toContain("Search Console is not connected");
  });

  it("names a denied property instead of calling it never connected", () => {
    const html = build({
      gscState: "absent",
      gscFailureReason: "permission_denied",
    }).html;
    expect(html).toContain(
      "Google denied access to the connected Search Console property",
    );
    expect(html).not.toContain("Search Console is not connected");
  });

  it("names a disabled API instead of calling it never connected", () => {
    const html = build({
      gscState: "absent",
      gscFailureReason: "api_not_configured",
    }).html;
    expect(html).toContain("The Search Console API is not enabled");
    expect(html).not.toContain("Search Console is not connected");
  });

  it("still says not connected for a genuinely unconnected project", () => {
    const html = build({
      gscState: "absent",
      gscFailureReason: "not_connected",
    }).html;
    expect(html).toContain("Search Console is not connected for this project");
    expect(html).not.toContain("connection expired");
  });

  it("prints the coverage cross when Search Console is connected", () => {
    const html = build({ gscState: "connected", coverage: coverage() }).html;
    expect(html).toContain("Where your site already ranks");
    expect(html).toContain("Two or more pages competing");
    expect(html).toContain("your next pages");
    expect(html).toContain("last 28 days");
  });

  it("softens missing coverage when the matched pull was capped", () => {
    const html = build({
      gscState: "connected",
      coverage: coverage(),
      samplingTruncated: true,
    }).html;
    expect(html).toContain("among the Search Console rows we retrieved");
    expect(html).not.toContain("have no page on your site ranking for them");
  });

  /**
   * The hero stat and the tile are the two largest figures on the sheet and
   * neither has room for a caveat. Against a capped pull the absence they
   * asserted is not established — a page may rank below where the pull
   * stopped — so the hero drops the claim for a figure that is true either
   * way, and the tile's label carries the qualification.
   */
  it("does not headline an absence a capped pull cannot establish", () => {
    const html = build({
      gscState: "connected",
      coverage: coverage(),
      samplingTruncated: true,
    }).html;
    expect(html).not.toContain("No page ranking yet");
    expect(html).not.toContain("Not yet covered");
    expect(html).toContain("Monthly searches");
    expect(html).toContain("No match in the rows we read");
    expect(html).toContain(
      "so the third figure counts clusters with no match among those rows, not clusters with no page",
    );
  });

  it("headlines the absence when the pull it rests on was complete", () => {
    const html = build({ gscState: "connected", coverage: coverage() }).html;
    expect(html).toContain("No page ranking yet");
    expect(html).toContain("Not yet covered");
    expect(html).not.toContain("No match in the rows we read");
  });

  it("counts the clusters it mapped, not the ones the table has room for", () => {
    // The plan holds up to 12 clusters and the roadmap prints 8, so "below"
    // named a set the reader cannot see.
    const html = build({
      gscState: "connected",
      coverage: coverage({
        clusters: {
          "solar panel cost": {
            status: "covered",
            pageCount: 1,
            pages: ["/cost"],
          },
          "solar panel installers": {
            status: "covered",
            pageCount: 1,
            pages: ["/installers"],
          },
        },
      }),
    }).html;
    expect(html).toContain("Every one of the 2 clusters we mapped");
    expect(html).not.toContain("clusters below");
  });

  it("caveats nationwide volumes whenever the run stored a target area", () => {
    const html = build({ confirmedAreaLabel: "Plano, Texas" }).html;
    expect(html).toContain("nationwide");
    expect(html).toContain("Plano, Texas");
  });

  it("admits the other topics this sheet does not show", () => {
    const html = build({ alsoMapped: ["heat pumps", "battery storage"] }).html;
    expect(html).toContain("We also mapped: heat pumps, battery storage");
  });
});
