import { describe, expect, it, vi } from "vitest";

/**
 * The server-function modules pull in the D1 provider, which imports
 * `cloudflare:workers` and cannot load under Vitest's node environment. The
 * chapter's pure half never calls them, so they are stubbed at the module
 * boundary rather than the hook being tested through a React Query context.
 */
vi.mock("@/serverFunctions/analysisRuns", () => ({
  restoreLatestRun: () => Promise.resolve(null),
  restoreRun: () => Promise.resolve(null),
  getRecentRuns: () => Promise.resolve([]),
}));
vi.mock("@/serverFunctions/projects", () => ({
  getProjects: () => Promise.resolve([]),
}));
vi.mock("@/serverFunctions/searchPerformance", () => ({
  getSearchPerformanceReport: () => Promise.resolve({ connected: false }),
  getSearchPerformanceTable: () => Promise.resolve({ connected: false }),
}));

import {
  buildSerpNarrative,
  buildserpOverviewChapter,
  heroItems,
  serpTable,
  type SerpOverviewRun,
  type serpOverviewReportData,
} from "./serpOverview";
import type { ReportPageSpec } from "@/client/features/report/reportChapters";
import {
  CANNOT_VOUCH as REAL_CANNOT_VOUCH,
  NO_RELEVANT_RUN as REAL_NO_RELEVANT_RUN,
} from "./serpOverviewReads";

/**
 * This chapter is printed and handed to a client, so the interesting assertion
 * is never "the sheet is missing" — it is WHICH sentence the coverage list
 * gives as the reason. A failed read that prints as "never run" accuses the
 * agency of skipping work it may well have done, and a run for a competitor's
 * brand printed under "your keyword" is worse still.
 */

const GENERATED_AT = "2026-08-11T00:00:00.000Z";

const READ_FAILED =
  "The saved search-results lookup could not be read while this report was generated — that request failed rather than returning nothing.";
const NEVER_RUN =
  "No search-results lookup has been saved for this project, so this report does not show who else ranks for your keywords.";
// Imported, not retyped. Both are values the hook hands the builder, so this
// file only ever asserts pass-through — but a hand-copied literal here had
// already drifted from the real sentence, which made this file read as
// documentation of wording it does not actually pin.
const NO_RELEVANT_RUN = REAL_NO_RELEVANT_RUN;
const NO_GSC_TO_VOUCH = REAL_CANNOT_VOUCH.not_connected;

function run(overrides: Partial<SerpOverviewRun> = {}): SerpOverviewRun {
  return {
    keyword: "emergency plumber boston",
    fetchedAt: "2026-07-14T10:00:00.000Z",
    geographyLabel: "Boston, MA",
    searchVolume: 2400,
    domainTrafficUnavailable: false,
    results: [
      {
        rank: 1,
        title: "Boston Emergency Plumbers",
        url: "https://rival.com/emergency",
        domain: "rival.com",
        domainEtv: 41_000,
      },
      {
        rank: 2,
        title: "24/7 Plumbing",
        url: "https://example.com/emergency-plumber",
        domain: "example.com",
        domainEtv: 9100,
      },
    ],
    paaQuestions: ["How much does an emergency plumber cost?"],
    serpFeatures: [{ type: "people_also_ask", count: 4 }],
    ...overrides,
  };
}

function data(
  overrides: Partial<serpOverviewReportData> = {},
): serpOverviewReportData {
  return {
    domain: "example.com",
    run: run(),
    readFailed: null,
    snapshotGap: null,
    neverRun: false,
    unvouched: null,
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

function collect(input: serpOverviewReportData) {
  const pages: ReportPageSpec[] = [];
  const omissions: Array<{ title: string; reason: string }> = [];
  buildserpOverviewChapter(input, {
    add: (spec) => pages.push(spec),
    drop: (title, reason) => omissions.push({ title, reason }),
  });
  return { pages, omissions };
}

describe("buildserpOverviewChapter", () => {
  it("adds the chapter when a vouched, in-window run has results", () => {
    const { pages, omissions } = collect(data());
    expect(omissions).toEqual([]);
    expect(pages).toHaveLength(1);
    expect(pages[0].key).toBe("serp-overview");
    expect(pages[0].number).toBe("04");
    expect(pages[0].kicker).toBe("Opportunities");
    expect(pages[0].title).toBe("Who ranks for your keyword");
  });

  it("drops with the read-failed sentence when a read threw", () => {
    const { pages, omissions } = collect(
      data({ readFailed: READ_FAILED, run: null }),
    );
    expect(pages).toEqual([]);
    expect(omissions).toEqual([
      { title: "Who ranks for your keyword", reason: READ_FAILED },
    ]);
  });

  it("never lets a failed read print as never-run, even with a run in hand", () => {
    // The restore succeeded but a gate read threw, so the keyword is unvouched:
    // printing it would put an arbitrary query under "your keyword".
    const { pages, omissions } = collect(
      data({ readFailed: READ_FAILED, neverRun: true }),
    );
    expect(pages).toEqual([]);
    expect(omissions[0].reason).toBe(READ_FAILED);
    expect(omissions[0].reason).not.toBe(NEVER_RUN);
  });

  it("drops with the never-run sentence when nothing was ever run", () => {
    const { pages, omissions } = collect(data({ run: null, neverRun: true }));
    expect(pages).toEqual([]);
    expect(omissions).toEqual([
      { title: "Who ranks for your keyword", reason: NEVER_RUN },
    ]);
  });

  it("does not collapse an expired payload into never-run", () => {
    const expired =
      "The saved search-results lookup has expired — stored results are kept for a limited window — so it could not be included here. Re-running it restores this section.";
    const { omissions } = collect(
      data({ run: null, snapshotGap: expired, neverRun: false }),
    );
    expect(omissions[0].reason).toBe(expired);
  });

  it("says the saved lookups were for keywords the site does not rank for", () => {
    const { omissions } = collect(
      data({ run: null, unvouched: NO_RELEVANT_RUN }),
    );
    expect(omissions[0].reason).toBe(NO_RELEVANT_RUN);
  });

  it("names Search Console when it cannot vouch for any keyword", () => {
    const { omissions } = collect(
      data({ run: null, unvouched: NO_GSC_TO_VOUCH }),
    );
    expect(omissions[0].reason).toBe(NO_GSC_TO_VOUCH);
  });

  it("drops a lookup older than the 90-day payload window, with its date", () => {
    const { pages, omissions } = collect(
      data({ run: run({ fetchedAt: "2026-01-05T00:00:00.000Z" }) }),
    );
    expect(pages).toEqual([]);
    expect(omissions[0].reason).toBe(
      "The most recent search-results lookup for this project was made on 5 January 2026, too long ago to describe today's results page.",
    );
  });

  it("drops an undated lookup rather than claiming it is current", () => {
    const { pages, omissions } = collect(
      data({ run: run({ fetchedAt: "not-a-date" }) }),
    );
    expect(pages).toEqual([]);
    expect(omissions[0].reason).toContain("no readable date");
  });

  it("uses the ran-but-empty sentence, naming the keyword, for no listings", () => {
    const { pages, omissions } = collect(data({ run: run({ results: [] }) }));
    expect(pages).toEqual([]);
    expect(omissions[0].reason).toBe(
      "The saved lookup for “emergency plumber boston” found no ordinary listings on that results page — Google filled it entirely with ads and its own features.",
    );
  });
});

describe("buildSerpNarrative", () => {
  it("opens with the date, the keyword and the run's own geography", () => {
    const [, opening] = buildSerpNarrative(run(), "example.com", GENERATED_AT);
    expect(opening).toContain(
      "On 14 July 2026 we looked up “emergency plumber boston” as searched from Boston, MA.",
    );
  });

  it("omits the geography clause rather than assuming a national default", () => {
    const [, opening] = buildSerpNarrative(
      run({ geographyLabel: null }),
      "example.com",
      GENERATED_AT,
    );
    expect(opening).toContain("we looked up “emergency plumber boston”.");
    expect(opening).not.toContain("as searched from");
  });

  it("states the client's position from the matching domain row", () => {
    const [, opening] = buildSerpNarrative(
      run(),
      "www.example.com",
      GENERATED_AT,
    );
    expect(opening).toContain("Your site ranked #2 on that results page.");
  });

  it("counts only the listings the lookup actually saved", () => {
    const [, opening] = buildSerpNarrative(run(), "absent.com", GENERATED_AT);
    expect(opening).toContain(
      "Your site was not among the 2 ordinary listings that lookup saved from that page.",
    );
    // The wording this replaced. "Not in the top 20" asserts a twenty-result
    // check over a payload that saved two, which is a claim about the client's
    // ranking that the lookup never made.
    expect(opening).not.toContain("top 20");
    expect(opening).not.toContain("does not rank");
  });

  it("names the top-ranked domain and warns that features take clicks", () => {
    const [, , second] = buildSerpNarrative(run(), "example.com", GENERATED_AT);
    expect(second).toContain("The top-ranked result was rival.com.");
    expect(second).toContain("its own blocks on that page");
  });

  it("omits the position sentence when the project has no domain", () => {
    const [, opening] = buildSerpNarrative(run(), null, GENERATED_AT);
    expect(opening).not.toContain("Your site");
  });
});

describe("serpTable and heroItems", () => {
  it("marks the client's own row and shows both estimate columns", () => {
    const { heads, rows } = serpTable(run(), "example.com");
    expect(heads).toEqual([
      "Est. monthly traffic (whole site)",
      "Est. clicks from this keyword",
    ]);
    expect(rows.map((row) => row.isClient)).toEqual([false, true]);
    expect(rows[0].values).toEqual(["41,000", "648"]);
  });

  it("drops the traffic column entirely when that enrichment threw", () => {
    const { heads, rows } = serpTable(
      run({ domainTrafficUnavailable: true }),
      "example.com",
    );
    // A "—" would read as "this competitor has no traffic", which is an
    // affirmative false statement rather than a missing one.
    expect(heads).toEqual(["Est. clicks from this keyword"]);
    expect(rows[0].values).toHaveLength(1);
  });

  it("drops the clicks column when the keyword's volume is unknown", () => {
    const { heads } = serpTable(run({ searchVolume: null }), "example.com");
    expect(heads).toEqual(["Est. monthly traffic (whole site)"]);
  });

  it("omits the searches tile rather than dashing it when volume is unknown", () => {
    const items = heroItems(run({ searchVolume: null }), "example.com");
    expect(items.map((item) => item.label)).toEqual(["Your position"]);
    expect(items[0].value).toBe("#2");
  });

  it("names the payload's own depth when the client is absent from it", () => {
    const items = heroItems(run(), "absent.com");
    expect(items[1]).toEqual({
      label: "Your position",
      value: "Not in the top 2",
    });
  });
});
