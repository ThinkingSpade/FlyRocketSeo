import { describe, expect, it, vi } from "vitest";

// The chapter's hook reaches the free restore + overrides server functions,
// which import the provider-aware `@/db` and through it `cloudflare:workers`.
// Only the pure builder is exercised below, but ESM still evaluates the whole
// import graph, so the runtime binding is stubbed the same way the server-side
// suites already do it.
vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: () => {},
}));

import {
  buildcompetitorsChapter,
  describeRowCap,
  pickTopRival,
  rankRowsForDisplay,
} from "./competitors";
import { describeSnapshotGap } from "@/client/features/report/reportReads";
import type {
  CompetitorRow,
  CompetitorsPage,
} from "@/types/schemas/competitors";
import type {
  ChapterCollector,
  ReportPageSpec,
} from "@/client/features/report/reportChapters";

type ChapterData = Parameters<typeof buildcompetitorsChapter>[0];

/**
 * This chapter is printed and handed to a client, so the interesting assertion
 * is almost never "the chapter is missing" — it is WHICH sentence the coverage
 * list gives as the reason. A restore that threw, a read that never returned
 * and a run that never happened are three different accusations, and only one
 * of them blames the agency.
 */

const NEVER_RUN = "No competitor analysis has been saved for this domain.";
const RAN_BUT_EMPTY =
  "The saved competitor analysis found no rival business sites for this domain — every site it surfaced was a platform, marketplace or directory rather than a competitor.";
const READ_FAILED =
  "The saved competitor analysis could not be read while this report was generated — that request failed rather than returning nothing.";
const ALL_HIDDEN =
  "Every competing site found for this domain is one you have marked as hidden, so none are listed here.";
const HIDDEN_AND_PLATFORMS =
  "Apart from the sites you have marked as hidden, every site the saved competitor analysis surfaced for this domain was a platform, marketplace or directory rather than a competitor.";
const NOTHING_STORED =
  "The saved competitor analysis holds no sites for this domain, so there is nothing to list here.";
const NO_DOMAIN =
  "This project has no domain on record, so a saved competitor analysis could not be matched to it.";
const PROJECTS_READ_FAILED =
  "This project's own record could not be read while this report was generated — that request failed rather than returning nothing.";
const PROJECTS_PENDING =
  "This project's own record was still loading when this report was generated.";
const OVERRIDES_READ_FAILED =
  "This project's pinned and hidden competitor list could not be read while this report was generated — that request failed rather than returning nothing.";
const OVERRIDES_PENDING =
  "This project's pinned and hidden competitor list was still loading when this report was generated.";

function row(overrides: Partial<CompetitorRow> = {}): CompetitorRow {
  return {
    domain: "rival.com",
    avgPosition: 4.2,
    intersections: 120,
    organicKeywords: 3400,
    organicTraffic: 9100,
    coverage: 0.35,
    beatsYouCount: 12,
    positionDelta: -1.4,
    source: "serp",
    pinned: false,
    category: null,
    ...overrides,
  };
}

/** The all-null row `applyProjectCompetitors` synthesizes for a pinned domain
 *  the restored run never surfaced, and sorts to the front. */
function pinnedGhost(domain: string): CompetitorRow {
  return row({
    domain,
    avgPosition: null,
    intersections: null,
    organicKeywords: null,
    organicTraffic: null,
    coverage: null,
    beatsYouCount: null,
    positionDelta: null,
    pinned: true,
  });
}

function page(overrides: Partial<CompetitorsPage> = {}): CompetitorsPage {
  return {
    rows: [row()],
    totalCount: 1,
    fetchedAt: "2026-07-14T10:00:00.000Z",
    seedSize: 40,
    hiddenCount: 0,
    discoveryMode: "serp",
    seedTruncated: false,
    ...overrides,
  };
}

function data(overrides: Partial<ChapterData> = {}): ChapterData {
  return {
    projectsReadFailed: false,
    projectsPending: false,
    hasDomain: true,
    overridesReadFailed: false,
    snapshotGap: null,
    runAdopted: false,
    page: null,
    lastRanAt: null,
    ...overrides,
  };
}

/** A restored run that passed the domain gate, with its overrides applied. */
function withRun(pageOverrides: Partial<CompetitorsPage> = {}) {
  return { runAdopted: true, page: page(pageOverrides) };
}

function build(overrides: Partial<ChapterData> = {}) {
  const pages: ReportPageSpec[] = [];
  const omissions: Array<{ title: string; reason: string }> = [];
  const out: ChapterCollector = {
    add: (spec) => pages.push(spec),
    drop: (title, reason) => omissions.push({ title, reason }),
  };
  buildcompetitorsChapter(data(overrides), out);
  return { pages, omissions };
}

function dropReason(result: ReturnType<typeof build>): string {
  expect(result.omissions).toHaveLength(1);
  return result.omissions[0].reason;
}

describe("buildcompetitorsChapter", () => {
  it("adds the chapter when a serp-mode run restored with real rivals", () => {
    const result = build({
      ...withRun(),
      lastRanAt: "2026-07-14T10:00:00.000Z",
    });

    expect(result.omissions).toEqual([]);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({
      key: "competitors",
      number: "04",
      kicker: "Opportunities",
      title: "Who you're up against",
    });
  });

  it("adds the chapter for a domain-mode run too", () => {
    const result = build(
      withRun({
        discoveryMode: "domain",
        seedSize: 0,
        rows: [
          row({
            source: "domain",
            coverage: null,
            beatsYouCount: null,
            positionDelta: null,
          }),
        ],
      }),
    );

    expect(result.omissions).toEqual([]);
    expect(result.pages).toHaveLength(1);
  });

  it("drops it with the read-failed sentence when the restore threw", () => {
    const gap = describeSnapshotGap({
      subject: "the saved competitor analysis",
      isError: true,
      restoring: false,
      outcome: null,
      otherDomain: false,
    });

    const result = build({ snapshotGap: gap });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(READ_FAILED);
  });

  it("never reports a failed read as a run that never happened", () => {
    const gap = describeSnapshotGap({
      subject: "the saved competitor analysis",
      isError: true,
      restoring: false,
      outcome: null,
      otherDomain: false,
    });

    // Even with a page in hand, the failure has to win — and it must not fall
    // through to the never-run sentence, which is the defect this chapter
    // effort exists to fix.
    expect(dropReason(build({ snapshotGap: gap, ...withRun() }))).not.toBe(
      NEVER_RUN,
    );
    expect(dropReason(build({ snapshotGap: gap }))).toContain(
      "could not be read",
    );
  });

  it("drops it with the never-run sentence when nothing was ever run", () => {
    const result = build({ runAdopted: false, page: null, snapshotGap: null });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(NEVER_RUN);
  });

  it("routes an expired payload to the snapshot gap, not to never-run", () => {
    const gap = describeSnapshotGap({
      subject: "the saved competitor analysis",
      isError: false,
      restoring: false,
      outcome: "expired",
      otherDomain: false,
    });

    const dropped = dropReason(build({ snapshotGap: gap }));
    expect(dropped).toContain("has expired");
    expect(dropped).not.toBe(NEVER_RUN);
  });

  it("refuses to print a run recorded against another domain", () => {
    const gap = describeSnapshotGap({
      subject: "the saved competitor analysis",
      isError: false,
      restoring: false,
      outcome: "ready",
      otherDomain: true,
    });

    const result = build({ snapshotGap: gap });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toContain("covers a different domain");
  });

  it("names the project record when that read is what threw", () => {
    const result = build({ projectsReadFailed: true });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(PROJECTS_READ_FAILED);
  });

  // Finding 2: the project row had not arrived, so nothing under it was ever
  // established. A disabled restore query still serves its cache entry, so a
  // page can be in hand here — it may not print, and the reason may not be
  // "no competitor analysis has been saved".
  it("says the project record was still loading, not that nothing was ever run", () => {
    const result = build({ projectsPending: true, ...withRun() });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(PROJECTS_PENDING);
    expect(dropReason(result)).not.toBe(NEVER_RUN);
    expect(dropReason(result)).not.toBe(NO_DOMAIN);
  });

  it("keeps the still-loading wording the house vocabulary uses", () => {
    expect(
      describeSnapshotGap({
        subject: "this project's own record",
        isError: false,
        restoring: true,
        outcome: null,
        otherDomain: false,
      }),
    ).toBe(PROJECTS_PENDING);
  });

  // Finding 1: the domain gate must fail CLOSED. With no project domain there
  // is nothing to compare the run's label against, so a cached run for some
  // other target must not print under this client's letterhead — and the
  // reason must not be an absence nobody established.
  it("refuses to print a run when the project has no domain to match it against", () => {
    const result = build({ hasDomain: false, ...withRun() });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(NO_DOMAIN);
    expect(dropReason(result)).not.toBe(NEVER_RUN);
    expect(dropReason(result)).not.toContain("found no rival business sites");
  });

  it("drops it rather than render unfiltered when the overrides read threw", () => {
    // The page is present and would render — but without this project's
    // exclusions it would print domains the agency deliberately hid.
    const result = build({ overridesReadFailed: true, ...withRun() });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(OVERRIDES_READ_FAILED);
  });

  // Finding 3: an overrides read that has not RETURNED is the same hazard as
  // one that threw — `?? []` recomputes hiddenCount to 0, so hidden domains
  // print with nothing on the sheet disclosing them.
  it("drops it while the overrides read is still outstanding", () => {
    const result = build({ runAdopted: true, page: null });

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(OVERRIDES_PENDING);
    expect(dropReason(result)).not.toBe(NEVER_RUN);
  });

  it("keeps both overrides sentences in the house vocabulary", () => {
    const overrides = (isError: boolean, restoring: boolean) =>
      describeSnapshotGap({
        subject: "this project's pinned and hidden competitor list",
        isError,
        restoring,
        outcome: null,
        otherDomain: false,
      });

    expect(overrides(true, false)).toBe(OVERRIDES_READ_FAILED);
    expect(overrides(false, true)).toBe(OVERRIDES_PENDING);
  });

  it("drops it when every row surfaced was a platform or directory", () => {
    const result = build(
      withRun({ rows: [row({ domain: "youtube.com", category: "video" })] }),
    );

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(RAN_BUT_EMPTY);
  });

  it("says the rivals were hidden, not absent, when exclusions emptied it", () => {
    const result = build(withRun({ rows: [], hiddenCount: 3 }));

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(ALL_HIDDEN);
  });

  // Finding 5: `hiddenCount > 0` does not establish that every site found was
  // hidden. Two were excluded here and three directories were found and are
  // not hidden — so neither single-cause sentence is true.
  it("does not claim every site found was hidden when directories were found too", () => {
    const result = build(
      withRun({
        hiddenCount: 2,
        rows: [
          row({ domain: "youtube.com", category: "video" }),
          row({ domain: "yelp.com", category: "directory" }),
          row({ domain: "amazon.com", category: "marketplace" }),
        ],
      }),
    );

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(HIDDEN_AND_PLATFORMS);
    expect(dropReason(result)).not.toBe(ALL_HIDDEN);
    expect(dropReason(result)).not.toBe(RAN_BUT_EMPTY);
  });

  it("does not characterise sites it never had when the payload is empty", () => {
    const result = build(withRun({ rows: [], hiddenCount: 0 }));

    expect(result.pages).toEqual([]);
    expect(dropReason(result)).toBe(NOTHING_STORED);
    expect(dropReason(result)).not.toBe(ALL_HIDDEN);
    expect(dropReason(result)).not.toBe(RAN_BUT_EMPTY);
  });

  it("keeps a pinned platform as a competitor", () => {
    const result = build(
      withRun({
        rows: [row({ domain: "youtube.com", category: "video", pinned: true })],
      }),
    );

    expect(result.omissions).toEqual([]);
    expect(result.pages).toHaveLength(1);
  });
});

// Finding 4: "Toughest rival" is a superlative claim, and row order is not
// evidence for it — `applyProjectCompetitors` sorts pinned-first and
// synthesizes an all-null row for a pin the run never surfaced.
describe("pickTopRival", () => {
  it("names the rival that actually beats you most, not the pinned one", () => {
    const rows = [
      pinnedGhost("wayfair.com"),
      row({ domain: "weak.com", beatsYouCount: 3 }),
      row({ domain: "strong.com", beatsYouCount: 21 }),
    ];

    expect(pickTopRival(rows, true)?.domain).toBe("strong.com");
    expect(pickTopRival(rows, true)?.domain).not.toBe("wayfair.com");
  });

  it("names nobody when no row carries the metric that would rank it", () => {
    // Every tile this feeds is omitted rather than printing the agency's own
    // bookmark over a table row of em-dashes.
    expect(pickTopRival([pinnedGhost("wayfair.com")], true)).toBeNull();
    expect(pickTopRival([pinnedGhost("wayfair.com")], false)).toBeNull();
  });

  it("ranks domain mode on shared keywords, the metric that mode measures", () => {
    const rows = [
      pinnedGhost("wayfair.com"),
      row({ domain: "few.com", intersections: 8, beatsYouCount: null }),
      row({ domain: "many.com", intersections: 300, beatsYouCount: null }),
    ];

    expect(pickTopRival(rows, false)?.domain).toBe("many.com");
  });
});

describe("rankRowsForDisplay", () => {
  it("puts measured rivals ahead of a pinned row with no metrics", () => {
    const rows = [
      pinnedGhost("wayfair.com"),
      row({ domain: "strong.com", beatsYouCount: 21 }),
    ];

    expect(rankRowsForDisplay(rows, true).map((entry) => entry.domain)).toEqual(
      ["strong.com", "wayfair.com"],
    );
  });

  it("leaves the server's own order alone among measured rows", () => {
    const rows = [
      row({ domain: "a.com", beatsYouCount: 9 }),
      row({ domain: "b.com", beatsYouCount: 9 }),
    ];

    expect(rankRowsForDisplay(rows, true).map((entry) => entry.domain)).toEqual(
      ["a.com", "b.com"],
    );
  });
});

describe("describeRowCap", () => {
  it("reports the true total when the table shows only the top rows", () => {
    expect(describeRowCap(23)).toBe(
      "Showing the top 8 of 23 competing sites found for this domain.",
    );
  });

  it("says nothing when the cap cut nothing", () => {
    expect(describeRowCap(8)).toBeNull();
    expect(describeRowCap(1)).toBeNull();
  });
});
