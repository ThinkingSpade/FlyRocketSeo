import { describe, expect, it, vi } from "vitest";

/**
 * The chapter module pulls in two server-function modules for its own read
 * (`exportSavedKeywords`) and for the profile behind the fit map. Neither is
 * reachable from the pure builders under test, and loading them here would drag
 * the server's service layer — and `cloudflare:workers` with it — into a plain
 * node test. Stubbing the two leaf modules keeps the seam at the boundary.
 */
vi.mock("@/serverFunctions/keywords", () => ({
  exportSavedKeywords: vi.fn(),
}));
vi.mock("@/serverFunctions/projectProfile", () => ({
  autoDraftProjectProfile: vi.fn(),
  draftProjectProfile: vi.fn(),
  generateSeedKeywords: vi.fn(),
  getProjectProfile: vi.fn(),
  refineKeywordFit: vi.fn(),
  saveProjectProfile: vi.fn(),
}));

import { computeSavedPortfolio } from "@/client/features/saved-keywords/savedPortfolio";
import type { ChapterCollector } from "@/client/features/report/reportChapters";
import {
  buildSavedKeywordsFigures,
  buildSavedKeywordsNarrative,
  buildsavedKeywordsChapter,
  describeFetchedAt,
  marketLabel,
  spansMultipleMarkets,
  summarizeCoverage,
  type SavedKeywordsChapterRow,
  type SavedKeywordsFitStatus,
  type savedKeywordsReportData,
} from "./savedKeywords";

/**
 * This sheet is printed and handed to a client, so the assertion that matters
 * is never "the chapter is missing" — it is which sentence the coverage list
 * gives as the reason, and which sentence the sheet does NOT print. A read that
 * threw must never come out as "nothing has been saved"; a total over twelve
 * priced rows must never come out as a claim about two hundred.
 */

const READ_FAILED =
  "The saved keyword shortlist could not be read while this report was generated — that request failed rather than returning nothing.";
const NEVER_SAVED = "No keyword shortlist has been saved for this project yet.";
const NO_VOLUMES =
  "A keyword shortlist has been saved for this project, but no search volumes have been fetched for those keywords, so the list could not be sized for this report.";
const STILL_LOADING =
  "The saved keyword shortlist was still loading when this report was generated.";
const TITLE = "The keywords we're targeting";

let nextId = 0;

function row(
  overrides: Partial<SavedKeywordsChapterRow> = {},
): SavedKeywordsChapterRow {
  nextId += 1;
  return {
    id: `sk-${nextId}`,
    keyword: "emergency plumber leeds",
    locationCode: 2840,
    languageCode: "en",
    searchVolume: 1200,
    keywordDifficulty: 18,
    intent: "transactional",
    fetchedAt: "2026-07-04 09:12:00",
    ...overrides,
  };
}

function data(
  overrides: Partial<savedKeywordsReportData> = {},
): savedKeywordsReportData {
  const rows = overrides.rows ?? [];
  return {
    rows,
    portfolio: computeSavedPortfolio(rows),
    fitStatus: "not-configured",
    isError: false,
    isPending: false,
    ...overrides,
  };
}

function collect(input: savedKeywordsReportData) {
  const pages: Array<{ key: string; title: string; number: string }> = [];
  const omissions: Array<{ title: string; reason: string }> = [];
  const out: ChapterCollector = {
    add: (spec) =>
      pages.push({ key: spec.key, title: spec.title, number: spec.number }),
    drop: (title, reason) => omissions.push({ title, reason }),
  };
  buildsavedKeywordsChapter(input, out);
  return { pages, omissions };
}

/** The prose a client reads, for a hand-built list. */
function narrative(
  rows: SavedKeywordsChapterRow[],
  fitStatus: SavedKeywordsFitStatus = "not-configured",
): string {
  return buildSavedKeywordsNarrative(
    computeSavedPortfolio(rows),
    summarizeCoverage(rows),
    fitStatus,
  ).join(" ");
}

describe("buildsavedKeywordsChapter", () => {
  it("adds the chapter when saved keywords have search volumes", () => {
    const { pages, omissions } = collect(
      data({ rows: [row(), row({ keyword: "boiler repair leeds" })] }),
    );

    expect(omissions).toEqual([]);
    expect(pages).toEqual([
      { key: "saved-keywords", title: TITLE, number: "04" },
    ]);
  });

  it("drops it with the failed-read sentence when the read threw", () => {
    // The defect this whole chapter effort exists to fix: an empty list from a
    // request that never returned must not print as "never saved".
    const { pages, omissions } = collect(data({ rows: [], isError: true }));

    expect(pages).toEqual([]);
    expect(omissions).toEqual([{ title: TITLE, reason: READ_FAILED }]);
  });

  it("prefers the failed-read sentence even when rows are present", () => {
    const { pages, omissions } = collect(
      data({ rows: [row()], isError: true }),
    );

    expect(pages).toEqual([]);
    expect(omissions).toEqual([{ title: TITLE, reason: READ_FAILED }]);
  });

  it("drops it with the never-saved sentence when nothing was ever saved", () => {
    const { pages, omissions } = collect(data({ rows: [] }));

    expect(pages).toEqual([]);
    expect(omissions).toEqual([{ title: TITLE, reason: NEVER_SAVED }]);
  });

  it("drops it when a full list has no search volumes at all", () => {
    // The common case, and the one a padded chapter would come from: keywords
    // saved from outside a research run have an empty keyword_metrics join.
    const { pages, omissions } = collect(
      data({
        rows: [
          row({ searchVolume: null, keywordDifficulty: null, intent: null }),
          row({
            keyword: "boiler repair leeds",
            searchVolume: null,
            keywordDifficulty: null,
            intent: null,
          }),
        ],
      }),
    );

    expect(pages).toEqual([]);
    expect(omissions).toEqual([{ title: TITLE, reason: NO_VOLUMES }]);
  });

  it("keeps the chapter when only some rows carry a volume", () => {
    const { pages, omissions } = collect(
      data({
        rows: [row(), row({ keyword: "leeds plumber", searchVolume: null })],
      }),
    );

    expect(omissions).toEqual([]);
    expect(pages).toHaveLength(1);
  });

  it("says the read was still loading rather than that nothing was saved", () => {
    const { pages, omissions } = collect(data({ rows: [], isPending: true }));

    expect(pages).toEqual([]);
    expect(omissions).toEqual([{ title: TITLE, reason: STILL_LOADING }]);
  });
});

/**
 * Finding 1: a list whose metrics join is partial printed whole-list totals and
 * a whole-list difficulty verdict. Every figure now names its population.
 */
describe("partial metric coverage", () => {
  const unpriced = (index: number) =>
    row({ keyword: `k${index}`, searchVolume: null, keywordDifficulty: null });
  const partial = (): SavedKeywordsChapterRow[] => [
    row({ keyword: "emergency plumber", searchVolume: 900 }),
    // KD 18 and 26 average to exactly 22, the number the old whole-list
    // verdict printed as a claim about all ten.
    row({ keyword: "boiler repair", searchVolume: 500, keywordDifficulty: 26 }),
    ...Array.from({ length: 8 }, (_, index) => unpriced(index)),
  ];

  it("does not claim the whole list is worth the priced rows' volume", () => {
    const text = narrative(partial());

    expect(text).toContain(
      "We are targeting 10 keywords for you. Search volumes have been fetched for 2 of them, and those 2 represent 1,400 searches a month; the other 8 have no volume data yet, so nothing on this page sizes them.",
    );
    expect(text).not.toContain(
      "We are targeting 10 keywords for you, together representing 1,400 searches a month.",
    );
  });

  it("does not pass a two-row difficulty off as a verdict on ten keywords", () => {
    const text = narrative(partial());

    expect(text).toContain("Difficulty has been scored for 2 of the 10");
    expect(text).toContain("that part of the list is low-competition");
    expect(text).toContain("this is not a verdict on the whole list");
    expect(text).not.toContain(
      "At an average difficulty of 22 out of 100, this list is low-competition",
    );
  });

  it("scopes the low-difficulty count to the rows that carry a score", () => {
    const text = narrative(partial());

    expect(text).toContain("2 of the 2 scored keywords are low-difficulty");
    expect(text).not.toContain("2 of them are low-difficulty");
  });

  it("labels the hero and the difficulty tile with the priced population", () => {
    const rows = partial();
    const { hero, tiles } = buildSavedKeywordsFigures(
      computeSavedPortfolio(rows),
      summarizeCoverage(rows),
      "not-configured",
    );

    expect(hero[0]).toEqual({ label: "Keywords targeted", value: "10" });
    expect(hero[1]).toEqual({
      label: "Monthly searches (2 of 10 keywords)",
      value: "1,400",
    });
    expect(hero[1].label).not.toBe("Combined monthly searches");
    expect(tiles[0].label).toBe("Average difficulty (2 of 10 scored)");
  });

  it("keeps the plain labels and sentence when every row is priced", () => {
    const rows = [row({ searchVolume: 900 }), row({ searchVolume: 500 })];
    const { hero, tiles } = buildSavedKeywordsFigures(
      computeSavedPortfolio(rows),
      summarizeCoverage(rows),
      "not-configured",
    );

    expect(hero[1].label).toBe("Combined monthly searches");
    expect(tiles[0].label).toBe("Average difficulty");
    expect(narrative(rows)).toContain(
      "We are targeting 2 keywords for you, together representing 1,400 searches a month.",
    );
  });
});

// `targetListSubtitle`'s own describe block lives in
// savedKeywords.targetList.test.ts -- split out to stay under the max-lines cap.

/**
 * Finding 2: the "as of" line took the NEWEST fetch across the list, so one
 * keyword refreshed yesterday dated year-old figures to yesterday.
 */
describe("describeFetchedAt", () => {
  it("prints the span rather than dating everything to the newest fetch", () => {
    const sentence = describeFetchedAt([
      row({ fetchedAt: "2025-09-02 08:00:00" }),
      row({ keyword: "boiler repair", fetchedAt: "2026-08-10 11:30:00" }),
    ]);

    expect(sentence).toBe(
      "Search volumes and difficulty were fetched between September 2, 2025 and August 10, 2026 — each keyword's figures are as old as the day that keyword was last fetched. Generating this report does not refresh them.",
    );
    expect(sentence).not.toContain("shown as of August 10, 2026");
  });

  it("names the single day when every figure was fetched together", () => {
    const sentence = describeFetchedAt([
      row({ fetchedAt: "2026-08-10 11:30:00" }),
      row({ keyword: "boiler repair", fetchedAt: "2026-08-10 23:45:00" }),
    ]);

    expect(sentence).toBe(
      "Search volumes and difficulty were fetched on August 10, 2026; generating this report does not refresh them.",
    );
  });

  it("ignores rows that contribute no figure, and dates nothing when none do", () => {
    // A row with a fetchedAt but no volume and no difficulty contributes
    // nothing to the sheet, so it must not widen the claimed span either.
    const sentence = describeFetchedAt([
      row({ searchVolume: null, keywordDifficulty: null, fetchedAt: null }),
    ]);

    expect(sentence).toBe(
      "Search volumes and difficulty are shown as last fetched for this project; generating this report does not refresh them.",
    );
  });

  it("reads the SQLite timestamp shape as UTC, not local time", () => {
    // "2026-01-01 00:30:00" is January 1 in UTC and December 31 anywhere west
    // of it; the printed sheet must not disagree with the other backend.
    expect(describeFetchedAt([row({ fetchedAt: "2026-01-01 00:30:00" })])).toBe(
      "Search volumes and difficulty were fetched on January 1, 2026; generating this report does not refresh them.",
    );
  });
});

/**
 * Finding 3: a failed or in-flight profile read degraded to an empty fit map,
 * which silently inflated the low-difficulty count — and made it depend on
 * whether the profile query settled before the print.
 */
describe("low-difficulty count when the profile could not be read", () => {
  const rows = (): SavedKeywordsChapterRow[] => [
    row({ keyword: "emergency plumber", keywordDifficulty: 12 }),
    row({ keyword: "boiler repair", keywordDifficulty: 20 }),
  ];

  it("says the profile could not be read instead of printing the count", () => {
    const text = narrative(rows(), "unavailable");

    expect(text).toContain(
      "We could not read this project's business profile while this report was generated, so the low-difficulty shortlist is not counted here: that count sets aside keywords aimed at the wrong customer, and without the profile we cannot tell which those are.",
    );
    expect(text).not.toContain("2 of the 2 scored keywords are low-difficulty");
  });

  it("drops the tile rather than printing an unverified number", () => {
    const list = rows();
    const { tiles } = buildSavedKeywordsFigures(
      computeSavedPortfolio(list),
      summarizeCoverage(list),
      "unavailable",
    );

    expect(tiles.map((tile) => tile.label)).toEqual(["Average difficulty"]);
  });

  it("still prints a zero, which no unread exclusion could have changed", () => {
    const list = [row({ keywordDifficulty: 70 })];
    const { tiles } = buildSavedKeywordsFigures(
      computeSavedPortfolio(list),
      summarizeCoverage(list),
      "unavailable",
    );

    expect(tiles[1]).toEqual({ label: "Low-difficulty targets", value: "0" });
    expect(narrative(list, "unavailable")).not.toContain(
      "could not read this project's business profile",
    );
  });

  it("counts normally when there is simply no profile to check against", () => {
    const list = rows();
    const { tiles } = buildSavedKeywordsFigures(
      computeSavedPortfolio(list),
      summarizeCoverage(list),
      "not-configured",
    );

    expect(tiles[1]).toEqual({ label: "Low-difficulty targets", value: "2" });
    expect(narrative(list)).toContain(
      "2 of the 2 scored keywords are low-difficulty targets with real search volume behind them — that is where we expect to see movement first.",
    );
  });
});

/**
 * Finding 4: the same keyword is legitimately saved twice for two markets, and
 * the row shape dropped the id, so React keyed on a colliding string and the
 * two rows printed identical with different numbers.
 */
describe("multi-market rows", () => {
  const us = () => row({ keyword: "emergency plumber", locationCode: 2840 });
  const uk = () =>
    row({
      keyword: "emergency plumber",
      locationCode: 2826,
      searchVolume: 300,
    });

  it("labels the two rows so the different volumes are explained", () => {
    const rows = [us(), uk()];

    expect(spansMultipleMarkets(rows)).toBe(true);
    expect(rows.map((r) => marketLabel(r, false))).toEqual([
      "United States",
      "United Kingdom",
    ]);
    // Distinct ids, so the printed rows are keyed apart rather than collided.
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    expect(summarizeCoverage(rows)).toEqual({ saved: 2, priced: 2, scored: 2 });
  });

  it("distinguishes two languages inside one country", () => {
    const rows = [us(), row({ locationCode: 2840, languageCode: "es" })];

    expect(spansMultipleMarkets(rows)).toBe(true);
    expect(marketLabel(rows[1], true)).toBe("United States · ES");
  });

  it("adds no market column to an ordinary single-market list", () => {
    expect(
      spansMultipleMarkets([us(), row({ keyword: "boiler repair" })]),
    ).toBe(false);
  });
});

describe("buildSavedKeywordsNarrative", () => {
  it("sizes the list and describes the difficulty in words", () => {
    const text = narrative([
      row({ searchVolume: 1200, keywordDifficulty: 12 }),
      row({
        keyword: "boiler repair leeds",
        searchVolume: 800,
        keywordDifficulty: 20,
      }),
    ]);

    expect(text).toContain(
      "We are targeting 2 keywords for you, together representing 2,000 searches a month.",
    );
    expect(text).toContain("this list is low-competition");
    expect(text).toContain("2 of the 2 scored keywords are low-difficulty");
  });

  it("does not claim a difficulty verdict when no difficulty was fetched", () => {
    const rows = [row({ searchVolume: 500, keywordDifficulty: null })];
    const paragraphs = buildSavedKeywordsNarrative(
      computeSavedPortfolio(rows),
      summarizeCoverage(rows),
      "not-configured",
    );

    expect(paragraphs[1]).toBe(
      "Difficulty scores have not been fetched for this list, so how hard each one is to win is not sized here.",
    );
    // No low-difficulty sentence: nothing qualified, so nothing is promised.
    expect(paragraphs).toHaveLength(2);
  });

  it("calls a hard list competitive rather than burying the score", () => {
    expect(
      narrative([
        row({ searchVolume: 500, keywordDifficulty: 72 }),
        row({
          keyword: "leeds plumber",
          searchVolume: 900,
          keywordDifficulty: 80,
        }),
      ]),
    ).toContain("this list is competitive");
  });

  it("names the off-target keywords the profile ruled out", () => {
    const rows = [
      row({ keyword: "emergency plumber", keywordDifficulty: 12 }),
      row({ keyword: "plumbing jobs", keywordDifficulty: 15 }),
    ];
    const portfolio = computeSavedPortfolio(
      rows,
      new Map([
        [
          "plumbing jobs",
          { verdict: "wrong-customer" as const, reason: "hiring intent" },
        ],
      ]),
    );

    const text = buildSavedKeywordsNarrative(
      portfolio,
      summarizeCoverage(rows),
      "applied",
    ).join(" ");

    expect(text).toContain("1 of the 2 scored keywords are low-difficulty");
    expect(text).toContain(
      "A further 1 keyword is left out of that count because your profile marks it as the wrong customer.",
    );
  });
});
