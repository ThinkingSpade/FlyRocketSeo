import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The two server-function modules this chapter's HOOK imports reach
 * `cloudflare:workers` through the shared middleware, which does not exist
 * outside a Worker. Only the pure builder is under test here, so they are
 * stubbed rather than loaded; nothing below ever calls a hook, so no React
 * Query context is ever needed.
 */
vi.mock("@/serverFunctions/trendingOpportunities", () => ({
  getQueryMomentum: vi.fn(),
}));
vi.mock("@/serverFunctions/projectProfile", () => ({
  autoDraftProjectProfile: vi.fn(),
  draftProjectProfile: vi.fn(),
  generateSeedKeywords: vi.fn(),
  getProjectProfile: vi.fn(),
  refineKeywordFit: vi.fn(),
  saveProjectProfile: vi.fn(),
}));

import {
  buildkeywordTrendsChapter,
  describeComparisonPeriod,
  type KeywordTrendsRow,
  type keywordTrendsReportData,
} from "./keywordTrends";
import type {
  ChapterCollector,
  ReportPageSpec,
} from "@/client/features/report/reportChapters";

/**
 * This chapter is printed and handed to a client, so the interesting assertion
 * is never "the chapter is missing" — it is which sentence the client reads.
 * "We could not read this", "you never connected this" and "nothing moved" are
 * three different claims, and only one of them can be true at a time.
 *
 * The pure builder is tested with hand-built data, never the hook: no
 * React Query context, no server function, no Worker. The body is plain JSX, so
 * `renderToStaticMarkup` gives the printed sheet's own words.
 */

function row(overrides: Partial<KeywordTrendsRow> = {}): KeywordTrendsRow {
  return {
    query: "dallas vending services",
    impressions: 420,
    direction: "rising",
    label: "+41% impressions vs last period",
    page: "https://example.com/vending",
    // Dominant by default: one page takes nearly all of this term's
    // impressions, so no "shared with your other pages" note is due.
    pageShare: 0.92,
    ...overrides,
  };
}

/** `n` rows of one direction, each with its own query so keys stay unique. */
function rows(n: number, overrides: Partial<KeywordTrendsRow> = {}) {
  return Array.from({ length: n }, (_, i) =>
    row({
      query: `term ${overrides.direction ?? "rising"} ${i}`,
      ...overrides,
    }),
  );
}

function data(
  overrides: Partial<keywordTrendsReportData> = {},
): keywordTrendsReportData {
  const built = overrides.rows ?? [];
  return {
    rows: built,
    range: null,
    currentQueryCount: built.length,
    excludedByFit: 0,
    currentTruncated: false,
    previousTruncated: false,
    connected: false,
    isError: false,
    isPending: false,
    ...overrides,
  };
}

/** React escapes apostrophes and ampersands; a client reads the glyph. */
function decode(html: string): string {
  return html
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

function build(overrides: Partial<keywordTrendsReportData> = {}) {
  const pages: ReportPageSpec[] = [];
  const bodies: ReactNode[] = [];
  const omissions: Array<{ title: string; reason: string }> = [];
  const out: ChapterCollector = {
    add: (spec) => {
      pages.push(spec);
      bodies.push(spec.body);
    },
    drop: (title, reason) => omissions.push({ title, reason }),
  };
  buildkeywordTrendsChapter(data(overrides), out);
  return {
    pages,
    omissions,
    reason: omissions[0]?.reason ?? "",
    html: bodies[0] ? decode(renderToStaticMarkup(bodies[0])) : "",
  };
}

/** The figure printed on a named tile, e.g. tileValue(html, "Gained ground"). */
function tileValue(html: string, label: string): string | null {
  const match = new RegExp(`${label}</div>.*?tabular-nums">([^<]*)<`).exec(
    html,
  );
  return match?.[1] ?? null;
}

const TITLE = "Search terms gaining and losing ground";
const HELD_STEADY_FOR_ALL =
  "every one either held steady or had too few impressions to judge";

describe("buildkeywordTrendsChapter admission", () => {
  it("adds the chapter when a term rose or fell", () => {
    const built = build({
      connected: true,
      rows: [row(), row({ query: "dfw vending", direction: "falling" })],
    });
    expect(built.omissions).toEqual([]);
    expect(built.pages).toHaveLength(1);
    expect(built.pages[0].title).toBe(TITLE);
    expect(built.pages[0].key).toBe("keyword-trends");
  });

  it("keeps the chapter on a single riser", () => {
    expect(build({ connected: true, rows: [row()] }).pages).toHaveLength(1);
  });

  it("does not count flat, unknown or no-baseline rows as content", () => {
    const built = build({
      connected: true,
      rows: [
        row({ direction: "flat", label: "Impressions steady" }),
        row({ query: "breakroom services", direction: "unknown" }),
        row({ query: "dfw vending", direction: "no-baseline" }),
      ],
    });
    expect(built.pages).toEqual([]);
    expect(built.omissions[0].title).toBe(TITLE);
  });

  it("keeps the chapter while the read is still in flight", () => {
    // A chapter dropped mid-load would claim, in a PDF that outlives the load,
    // that the data was missing.
    const built = build({ isPending: true });
    expect(built.omissions).toEqual([]);
    expect(built.html).toContain(
      "The period-on-period keyword comparison was still loading when this report was generated.",
    );
    expect(built.html).not.toContain("not connected");
  });

  it("still prints a warm cache when a background refetch threw", () => {
    const built = build({ connected: true, isError: true, rows: [row()] });
    expect(built.omissions).toEqual([]);
    expect(built.pages).toHaveLength(1);
  });
});

describe("buildkeywordTrendsChapter tiles count every row, not the cap", () => {
  // Finding 1. The tiles used to read `.length` off an already-sliced array, so
  // a property with 61 risers and 44 fallers printed "Gained ground 8 / Lost
  // ground 8" beside "Terms compared 312" — from which a client subtracts and
  // concludes 296 of their search terms held steady. A display cap must never
  // read as a finding.
  const big = {
    connected: true,
    rows: [
      ...rows(61, { direction: "rising" }),
      ...rows(44, { direction: "falling" }),
      ...rows(207, { direction: "flat", label: "Impressions steady" }),
    ],
  };

  it("prints the true totals on the tiles", () => {
    const { html } = build(big);
    expect(tileValue(html, "Gained ground")).toBe("61");
    expect(tileValue(html, "Lost ground")).toBe("44");
    expect(tileValue(html, "Terms compared")).toBe("312");
    // The cap itself must not be the number on either movement tile.
    expect(tileValue(html, "Gained ground")).not.toBe("8");
    expect(tileValue(html, "Lost ground")).not.toBe("8");
  });

  it("says on each table that it is showing the top eight", () => {
    const { html } = build({
      ...big,
      range: {
        startDate: "2026-07-01",
        endDate: "2026-07-28",
        prevStartDate: "2026-06-03",
        prevEndDate: "2026-06-30",
      },
    });
    expect(html).toContain("Top 8 of 61 by impressions at stake");
    expect(html).toContain("Top 8 of 44 by impressions at stake");
    expect(html).toContain("1–28 July 2026 vs 3–30 June 2026");
  });

  it("prints only the top eight rows in each table", () => {
    const { html } = build(big);
    const printed = html.match(/term rising \d+/g) ?? [];
    expect(printed).toHaveLength(8);
    expect(html).toContain("term rising 0");
    expect(html).not.toContain("term rising 8");
  });

  it("claims no cap when every row fits", () => {
    const { html } = build({
      connected: true,
      rows: rows(3, { direction: "rising" }),
      range: {
        startDate: "2026-07-01",
        endDate: "2026-07-28",
        prevStartDate: "2026-06-03",
        prevEndDate: "2026-06-30",
      },
    });
    expect(tileValue(html, "Gained ground")).toBe("3");
    expect(html).not.toContain("Top 3 of 3");
    expect(html).not.toContain("by impressions at stake");
    expect(html).toContain("1–28 July 2026 vs 3–30 June 2026");
  });
});

describe("buildkeywordTrendsChapter coverage reasons", () => {
  it("says the read failed rather than that it was never run", () => {
    const built = build({ isError: true });
    expect(built.pages).toEqual([]);
    expect(built.reason).toBe(
      "The period-on-period keyword comparison could not be read while this report was generated — that request failed rather than returning nothing.",
    );
    expect(built.reason).not.toContain("not connected");
  });

  it("blames a thrown read even when Search Console is connected", () => {
    const built = build({ isError: true, connected: true });
    expect(built.reason).toContain("could not be read");
    expect(built.reason).not.toContain("held steady");
  });

  it("names the missing connection when nothing was ever run", () => {
    const built = build({ connected: false });
    expect(built.pages).toEqual([]);
    expect(built.omissions).toEqual([
      {
        title: TITLE,
        reason:
          "Search Console is not connected for this project, so Google search data is unavailable.",
      },
    ]);
  });

  it("counts what actually held steady", () => {
    const built = build({
      connected: true,
      rows: rows(12, { direction: "flat", label: "Impressions steady" }),
    });
    expect(built.reason).toBe(
      "No search term rose or fell far enough against the previous period to count as a change — 12 held steady.",
    );
    expect(built.reason).not.toContain("no figure in the previous period");
  });
});

describe("buildkeywordTrendsChapter never calls missing history 'steady'", () => {
  // Finding 2. One sentence used to cover every empty outcome: "every one
  // either held steady or had too few impressions to judge". That is false for
  // a `no-baseline` row — the term had no earlier figure and was never judged
  // — and a property verified inside the last four weeks lands there wholesale.

  it("says there was no earlier figure when every row lacks a baseline", () => {
    const built = build({
      connected: true,
      rows: rows(31, { direction: "no-baseline", label: "No earlier figure" }),
    });
    expect(built.reason).toBe(
      "Not one of the 31 search terms Search Console returned had a figure in the previous period, so no gain or loss could be measured — that is missing history, not steady performance.",
    );
    expect(built.reason).not.toContain(HELD_STEADY_FOR_ALL);
    expect(built.reason).not.toContain("held steady");
    expect(built.reason).not.toContain("not connected");
  });

  it("admits the baseline may exist when the prior pull was cut short", () => {
    const built = build({
      connected: true,
      previousTruncated: true,
      rows: rows(31, { direction: "no-baseline", label: "No earlier figure" }),
    });
    expect(built.reason).toContain(
      "The previous period's list came back cut short, so some of those earlier figures may exist without having been returned.",
    );
  });

  it("counts each outcome separately when they are mixed", () => {
    const built = build({
      connected: true,
      rows: [
        ...rows(4, { direction: "flat", label: "Impressions steady" }),
        ...rows(2, { direction: "unknown", label: "Too few impressions" }),
        ...rows(9, { direction: "no-baseline", label: "No earlier figure" }),
      ],
    });
    expect(built.reason).toBe(
      "No search term rose or fell far enough against the previous period to count as a change — 4 held steady, 2 had too few impressions to judge and 9 had no figure in the previous period to compare against.",
    );
    expect(built.reason).not.toContain(HELD_STEADY_FOR_ALL);
  });

  it("does not claim terms held steady when there were no terms", () => {
    const built = build({ connected: true, rows: [], currentQueryCount: 0 });
    expect(built.reason).toBe(
      "Search Console returned no search terms for this property over the period compared, so there was nothing to measure against the four weeks before.",
    );
    expect(built.reason).not.toContain("held steady");
    expect(built.reason).not.toContain("every one");
  });

  it("blames the profile, not the data, when the profile excluded every term", () => {
    const built = build({
      connected: true,
      rows: [],
      currentQueryCount: 34,
      excludedByFit: 34,
    });
    expect(built.reason).toBe(
      "All 34 search terms Search Console returned for this period are marked in this project's profile as bringing the wrong customer, so none of them were compared.",
    );
    expect(built.reason).not.toContain("returned no search terms");
    expect(built.reason).not.toContain("held steady");
  });

  it("claims no mechanism it cannot prove when terms went missing elsewhere", () => {
    const built = build({
      connected: true,
      rows: [],
      currentQueryCount: 5,
      excludedByFit: 1,
    });
    expect(built.reason).toBe(
      "Search Console returned 5 search terms for this period, but none of them reached this comparison.",
    );
    expect(built.reason).not.toContain("wrong customer");
    expect(built.reason).not.toContain("held steady");
  });
});

describe("buildkeywordTrendsChapter page attribution", () => {
  // Finding 3. `page` is the page taking the largest KNOWN impression share.
  // Printed bare under "Page it shows for", a 28% share read as "this is the
  // page that ranks for it" — and a PDF has no hover help to correct it.

  it("marks a term whose impressions are split across the client's own pages", () => {
    const { html } = build({
      connected: true,
      rows: [row({ pageShare: 0.28 })],
    });
    expect(html).toContain(
      "Shared with your other pages — this one takes about 28%",
    );
    expect(html).toContain(
      "several of your own pages split its impressions and no single one owns it",
    );
  });

  it("says nothing about sharing when one page owns the term", () => {
    const { html } = build({
      connected: true,
      rows: [row({ pageShare: 0.91 })],
    });
    expect(html).not.toContain("Shared with your other pages");
    expect(html).not.toContain("no single one owns it");
  });

  it("leaves an unattributed page as an em dash and claims nothing", () => {
    const { html } = build({
      connected: true,
      rows: [row({ page: null, pageShare: null })],
    });
    expect(html).toContain("—");
    expect(html).not.toContain("Shared with your other pages");
    expect(html).not.toContain("no page ranks");
  });

  it("does not head the column as the page that ranks", () => {
    const { html } = build({ connected: true, rows: [row()] });
    expect(html).toContain("Page taking most impressions");
    expect(html).not.toContain("Page it shows for");
  });
});

describe("buildkeywordTrendsChapter sampling caveats", () => {
  it("says the current pull was a sample when it was cut short", () => {
    const { html } = build({
      connected: true,
      currentTruncated: true,
      rows: [row()],
    });
    expect(html).toContain(
      "drawn from a sample of the search terms Search Console returned",
    );
  });

  it("warns that a missing baseline may be the prior pull's cut, not a fact", () => {
    const { html } = build({
      connected: true,
      previousTruncated: true,
      rows: [row()],
    });
    expect(html).toContain(
      "some terms are counted here as having no earlier figure when one may exist",
    );
  });

  it("prints neither caveat when both pulls were complete", () => {
    const { html } = build({ connected: true, rows: [row()] });
    expect(html).not.toContain("drawn from a sample");
    expect(html).not.toContain("cut short");
  });
});

describe("describeComparisonPeriod", () => {
  it("collapses a span inside one month", () => {
    expect(
      describeComparisonPeriod({
        startDate: "2026-07-01",
        endDate: "2026-07-28",
        prevStartDate: "2026-06-03",
        prevEndDate: "2026-06-30",
      }),
    ).toBe("1–28 July 2026 vs 3–30 June 2026");
  });

  it("keeps both months when a span crosses one", () => {
    // Parsed from the string, never through `new Date` — UTC midnight rendered
    // in a negative-offset timezone is a day wrong at both ends.
    expect(
      describeComparisonPeriod({
        startDate: "2026-06-28",
        endDate: "2026-07-25",
        prevStartDate: "2025-12-29",
        prevEndDate: "2026-01-25",
      }),
    ).toBe("28 June – 25 July 2026 vs 29 December 2025 – 25 January 2026");
  });

  it("returns null rather than a half-formed period", () => {
    expect(describeComparisonPeriod(null)).toBeNull();
    expect(
      describeComparisonPeriod({
        startDate: "not-a-date",
        endDate: "2026-07-28",
        prevStartDate: "2026-06-03",
        prevEndDate: "2026-06-30",
      }),
    ).toBeNull();
  });
});
