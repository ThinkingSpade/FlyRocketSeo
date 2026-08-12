import { describe, expect, it, vi } from "vitest";
import { describeTrackerHeader } from "./rankTrackingSheet";

/**
 * The chapter builder: which sheets it adds, and which sentence the coverage
 * list gets when it drops one. What a sheet then says about movement and about
 * the position bands is pinned next door, in rankTrackingSheet.test.ts.
 *
 * The server-function modules import `cloudflare:workers`, which does not
 * resolve outside the worker runtime. Stubbing them keeps this test on the pure
 * builder — the hook is not exercised here, and no React Query context exists.
 */
vi.mock("@/serverFunctions/rank-tracking", () => ({
  getRankTrackingConfigSummaries: () => Promise.resolve([]),
  getLatestRankResults: () => Promise.resolve({ rows: [], run: null }),
  getRankChangeDigest: () =>
    Promise.resolve({ configs: [], latestRunAt: null }),
}));
vi.mock("@/serverFunctions/projects", () => ({
  getProjects: () => Promise.resolve([]),
}));

const { buildrankTrackingChapter } = await import("./rankTracking");
type ReportData = Parameters<typeof buildrankTrackingChapter>[0];
type ConfigRead = ReportData["configs"][number];
type Digest = NonNullable<ConfigRead["digest"]>;
type Mover = Digest["improved"][number];

/**
 * This chapter is printed and handed to a client, so the interesting assertion
 * is never "the chapter is missing" — it is which sentence the coverage list
 * gives as the reason. A read that threw must never print as "never set up".
 */

function collector() {
  const pages: Array<{ key: string; title: string }> = [];
  const drops: Array<{ title: string; reason: string }> = [];
  return {
    pages,
    drops,
    out: {
      add: (spec: { key: string; title: string }) => pages.push(spec),
      drop: (title: string, reason: string) => drops.push({ title, reason }),
    },
  };
}

function row(
  keyword: string,
  position: number | null,
  previousPosition: number | null,
  searchVolume: number | null = 100,
) {
  const desktop = {
    position,
    previousPosition,
    rankingUrl: null,
    serpFeatures: [],
  };
  return {
    trackingKeywordId: keyword,
    keyword,
    searchVolume,
    keywordDifficulty: null,
    cpc: null,
    desktop,
    mobile: { ...desktop },
  };
}

function mover(
  keyword: string,
  previousPosition: number | null,
  currentPosition: number | null,
): Mover {
  const delta =
    previousPosition != null && currentPosition != null
      ? previousPosition - currentPosition
      : null;
  return {
    keyword,
    searchVolume: 100,
    previousPosition,
    currentPosition,
    delta,
  };
}

function digest(overrides: Partial<Digest> = {}): Digest {
  return {
    configId: "config-1",
    domain: "example.com",
    latestRunAt: "2026-08-04 09:00:00",
    improved: [],
    declined: [],
    added: [],
    lost: [],
    improvedCount: 0,
    declinedCount: 0,
    addedCount: 0,
    lostCount: 0,
    ...overrides,
  };
}

function config(overrides: Partial<ConfigRead> = {}): ConfigRead {
  return {
    configId: "config-1",
    locationLabel: "United States",
    device: "desktop",
    serpDepth: 40,
    keywordCount: 3,
    lastRunCompletedAt: "2026-08-04 09:00:00",
    lastRunStatus: "completed",
    lastSkipReason: null,
    rows: [row("blue widgets", 4, 7), row("red widgets", 12, 12)],
    rowsError: false,
    rowsPending: false,
    digest: digest({
      improved: [mover("blue widgets", 7, 4)],
      improvedCount: 1,
    }),
    ...overrides,
  };
}

function data(overrides: Partial<ReportData> = {}): ReportData {
  return {
    domain: "example.com",
    projectsError: false,
    projectsPending: false,
    summariesError: false,
    summariesPending: false,
    moversError: false,
    moversPending: false,
    configCount: 1,
    matchedCount: 1,
    configs: [config()],
    ...overrides,
  };
}

function build(overrides: Partial<ReportData> = {}) {
  const sink = collector();
  buildrankTrackingChapter(data(overrides), sink.out);
  return sink;
}

describe("buildrankTrackingChapter", () => {
  it("adds the chapter when a tracker has checked positions", () => {
    const { pages, drops } = build();
    expect(drops).toEqual([]);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      key: "rank-tracking-config-1",
      title: "Tracked keyword positions",
    });
  });

  it("drops with the read-failure sentence when the history read threw", () => {
    const { pages, drops } = build({
      summariesError: true,
      // The never-run shape is also true here; the failure must still win.
      configCount: 0,
      matchedCount: 0,
      configs: [],
    });
    expect(pages).toEqual([]);
    expect(drops).toEqual([
      {
        title: "Tracked keyword positions",
        reason:
          "The saved rank tracking history could not be read while this report was generated — that request failed rather than returning nothing.",
      },
    ]);
  });

  it("drops with the read-failure sentence when one tracker's results threw", () => {
    const { pages, drops } = build({
      configs: [config({ rowsError: true, rows: [] })],
    });
    expect(pages).toEqual([]);
    expect(drops[0].reason).toBe(
      "The saved rank tracking history could not be read while this report was generated — that request failed rather than returning nothing.",
    );
  });

  it("drops with the never-run sentence when nothing was ever set up", () => {
    const { pages, drops } = build({
      configCount: 0,
      matchedCount: 0,
      configs: [],
    });
    expect(pages).toEqual([]);
    expect(drops).toEqual([
      {
        title: "Tracked keyword positions",
        reason:
          "No keyword rank tracking has been set up for this project, so there are no tracked positions to report.",
      },
    ]);
  });

  it("separates set-up-but-never-checked from never set up", () => {
    // No run has ever started: no status, no timestamp, nothing stored. This is
    // the ONLY shape that earns this sentence — see the in-flight cases below.
    const { drops } = build({
      configs: [
        config({
          lastRunCompletedAt: null,
          lastRunStatus: null,
          rows: [],
          digest: null,
          keywordCount: 12,
        }),
      ],
    });
    expect(drops[0].reason).toBe(
      "Rank tracking is set up for this project with 12 keywords, but no check has completed yet, so there are no positions to report.",
    );
  });

  it("interpolates the config's own serpDepth into the empty sentence", () => {
    const { pages, drops } = build({
      configs: [
        config({
          serpDepth: 60,
          keywordCount: 5,
          rows: [row("blue widgets", null, null)],
          digest: digest(),
        }),
      ],
    });
    expect(pages).toEqual([]);
    // The date is rendered in the reader's locale, so only its presence is
    // pinned here; `serpDepth` is the assertion that matters — hard-coding
    // "top 20" would be a false statement in a client's PDF.
    expect(drops[0].reason).toMatch(
      /^Rankings were checked on .*2026.*, and none of the 5 tracked keywords placed within the top 60 of Google results for United States\.$/,
    );
  });

  it("never prints a competitor's tracker under this project's keywords", () => {
    // A tracker exists, but none of them matched the project domain.
    const { pages, drops } = build({
      configCount: 2,
      matchedCount: 0,
      configs: [],
    });
    expect(pages).toEqual([]);
    expect(drops[0].reason).toBe(
      "The saved rank tracking history on file covers a different domain than this project, so it was not used.",
    );
  });

  it("keeps a still-loading read out of the never-run sentence", () => {
    const { drops } = build({
      summariesPending: true,
      configCount: 0,
      matchedCount: 0,
      configs: [],
    });
    expect(drops[0].reason).toBe(
      "The saved rank tracking history was still loading when this report was generated.",
    );
  });

  it("gives every matched tracker its own sheet, capped at three", () => {
    const { pages, drops } = build({
      matchedCount: 5,
      configs: [
        config({ configId: "a", locationLabel: "United States" }),
        config({ configId: "b", locationLabel: "United Kingdom" }),
        config({ configId: "c", locationLabel: "Canada" }),
      ],
    });
    expect(pages.map((page) => page.key)).toEqual([
      "rank-tracking-a",
      "rank-tracking-b",
      "rank-tracking-c",
    ]);
    expect(pages[0].title).toBe("Tracked keyword positions — United States");
    expect(drops[0]).toEqual({
      title: "Tracked keyword positions — other locations",
      reason:
        "This project tracks 5 locations; the 3 with the most keywords are reported above.",
    });
  });

  it("drops the whole chapter when the project record could not be read", () => {
    const { pages, drops } = build({ projectsError: true, domain: null });
    expect(pages).toEqual([]);
    expect(drops[0].reason).toBe(
      "This project's own record could not be read while this report was generated — that request failed rather than returning nothing.",
    );
  });

  it("still prints the standing when only the mover digest failed", () => {
    const { pages, drops } = build({
      moversError: true,
      configs: [config({ digest: null })],
    });
    expect(drops).toEqual([]);
    expect(pages).toHaveLength(1);
  });
});

/**
 * Every case below printed a confident falsehood over the agency's own work
 * before it was fixed, so each one pins the sentence that must NOT appear as
 * well as the one that must.
 */

describe("a check that is still running", () => {
  const inFlight = {
    // The newest run by start time is the pending one, so its completedAt is
    // null even though earlier checks stored every position on the sheet.
    lastRunCompletedAt: null,
    lastRunStatus: "running",
  };

  it("keeps the sheet instead of dropping the chapter", () => {
    const { pages, drops } = build({ configs: [config(inFlight)] });
    expect(drops).toEqual([]);
    expect(pages).toHaveLength(1);
  });

  it("says a check is running rather than that none has completed", () => {
    const header = describeTrackerHeader(config(inFlight), "example.com");
    expect(header).toBe(
      "We track 3 keywords for example.com in United States on desktop. A newer check was still running when this report was generated, so these positions come from the most recent check that completed.",
    );
    // The two claims this used to make: a date it does not have, and an
    // accusation that the agency never ran anything.
    expect(header).not.toContain("the most recent check completed on");
    expect(header).not.toContain("no check has completed yet");
  });

  it("names the in-flight run when there are no earlier positions", () => {
    const { pages, drops } = build({
      configs: [config({ ...inFlight, rows: [] })],
    });
    expect(pages).toEqual([]);
    expect(drops[0].reason).toBe(
      "A rank check for United States was still running when this report was generated, and no earlier check has completed, so there are no positions to report yet.",
    );
    expect(drops[0].reason).not.toContain(
      "but no check has completed yet, so there are no positions to report",
    );
  });
});

describe("a check that failed", () => {
  // A failed run DOES stamp completedAt, so the old date gate read it as a
  // check that completed and found nothing.
  const failed = { lastRunStatus: "failed" };

  it("never dates an empty finding to the run that failed", () => {
    const { pages, drops } = build({
      configs: [
        config({
          ...failed,
          keywordCount: 5,
          serpDepth: 60,
          rows: [row("blue widgets", null, null)],
        }),
      ],
    });
    expect(pages).toEqual([]);
    expect(drops[0].reason).toMatch(
      /^In the most recent check that completed, none of the 5 tracked keywords placed within the top 60 of Google results for United States\. The most recent check failed on .*2026.*, so these positions come from the last check that completed\.$/,
    );
    expect(drops[0].reason).not.toMatch(/^Rankings were checked on/);
  });

  it("names the failure rather than reporting an empty result", () => {
    const { drops } = build({ configs: [config({ ...failed, rows: [] })] });
    expect(drops[0].reason).toMatch(
      /^The most recent rank check for United States failed on .*2026.*, and no earlier check left positions on record, so there are no positions to report\.$/,
    );
    expect(drops[0].reason).not.toContain("placed within the top");
  });

  it("says so when the check was skipped for credits", () => {
    const { drops } = build({
      configs: [
        config({
          ...failed,
          rows: [],
          lastSkipReason: "insufficient_credits",
        }),
      ],
    });
    expect(drops[0].reason).toContain(
      "because the account was out of rank-check credits",
    );
    expect(drops[0].reason).not.toContain("no check has completed yet");
  });

  it("still prints the sheet when earlier checks left positions", () => {
    const { pages, drops } = build({ configs: [config(failed)] });
    expect(drops).toEqual([]);
    expect(pages).toHaveLength(1);
    const header = describeTrackerHeader(config(failed), "example.com");
    expect(header).toContain(
      "so these positions come from the last check that completed",
    );
    expect(header).not.toContain("the most recent check completed on");
  });
});
