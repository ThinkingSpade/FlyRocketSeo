import { describe, expect, it } from "vitest";
import {
  buildSearchAnalyticsRequest,
  GSC_ANALYTICS_ROW_CEILING,
  GSC_MCP_ROW_CEILING,
  resolveDateRange,
} from "@/server/features/gsc/searchAnalytics";

const TODAY = new Date("2026-05-28T00:00:00Z");

/** Inclusive day count between two YYYY-MM-DD dates, the way GSC counts them:
 *  both endpoints are included in the range. */
function inclusiveDays(startDate: string, endDate: string): number {
  const day = 24 * 60 * 60 * 1000;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return (end - start) / day + 1;
}

describe("resolveDateRange", () => {
  it("ends convenience ranges 3 days back for GSC data lag", () => {
    // TODAY is 2026-05-28T00:00:00Z, which is still 2026-05-27 in Pacific Time —
    // and Google interprets startDate/endDate in Pacific. So "today" is the 27th
    // and the lagged end is the 24th, not the 25th.
    const { endDate } = resolveDateRange({ dateRange: "last_28_days" }, TODAY);
    expect(endDate).toBe("2026-05-24");
  });

  it("makes a range named N days span exactly N days", () => {
    // This replaces an assertion that pinned the off-by-one as correct: it
    // expected 2026-04-27 to 2026-05-25, which is 29 inclusive dates for a range
    // called "last 28 days". Counting the window means the bug cannot come back
    // dressed as a different literal.
    const window = resolveDateRange({ dateRange: "last_28_days" }, TODAY);
    expect(inclusiveDays(window.startDate, window.endDate)).toBe(28);

    const week = resolveDateRange({ dateRange: "last_7_days" }, TODAY);
    expect(inclusiveDays(week.startDate, week.endDate)).toBe(7);
  });

  it("resolves 'today' in Pacific Time, not UTC", () => {
    // 07:00Z is midnight PDT on the same calendar day; 06:00Z is still the
    // previous Pacific day. A UTC-based implementation returns the same range
    // for both and is silently a day out for part of every day.
    const afterPacificMidnight = resolveDateRange(
      { dateRange: "last_7_days" },
      new Date("2026-05-28T07:30:00Z"),
    );
    const beforePacificMidnight = resolveDateRange(
      { dateRange: "last_7_days" },
      new Date("2026-05-28T06:30:00Z"),
    );

    expect(afterPacificMidnight.endDate).toBe("2026-05-25");
    expect(beforePacificMidnight.endDate).toBe("2026-05-24");
  });

  it("clamps the start to the 16-month floor", () => {
    const { startDate } = resolveDateRange(
      { dateRange: "last_16_months" },
      TODAY,
    );
    // The floor is today - 16 months, and "today" is the PACIFIC date for the
    // injected instant (2026-05-27, not the UTC 2026-05-28).
    expect(startDate).toBe("2025-01-27");
  });

  it("passes explicit dates through, clamping start to the floor", () => {
    const { startDate, endDate } = resolveDateRange(
      { startDate: "2020-01-01", endDate: "2026-05-01" },
      TODAY,
    );
    expect(startDate).toBe("2025-01-27"); // clamped to the Pacific-derived floor
    expect(endDate).toBe("2026-05-01");
  });

  it("leaves an in-range explicit start untouched", () => {
    const { startDate } = resolveDateRange(
      { startDate: "2026-01-01", endDate: "2026-05-01" },
      TODAY,
    );
    expect(startDate).toBe("2026-01-01");
  });
});

describe("buildSearchAnalyticsRequest", () => {
  it("wraps flat filters into a single AND dimensionFilterGroup", () => {
    const request = buildSearchAnalyticsRequest(
      {
        projectId: "p1",
        dimensions: ["query"],
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: "https://example.com/post",
          },
        ],
      },
      TODAY,
    );
    // The whole point: GSC ignores a top-level `filters` field.
    expect(request).not.toHaveProperty("filters");
    expect(request.dimensionFilterGroups).toEqual([
      {
        groupType: "and",
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: "https://example.com/post",
          },
        ],
      },
    ]);
  });

  it("omits dimensionFilterGroups when no filters are given", () => {
    const request = buildSearchAnalyticsRequest({ projectId: "p1" }, TODAY);
    expect(request.dimensionFilterGroups).toBeUndefined();
  });

  it("defaults dimensions, type, dataState, and rowLimit", () => {
    const request = buildSearchAnalyticsRequest({ projectId: "p1" }, TODAY);
    expect(request.dimensions).toEqual(["query"]);
    expect(request.type).toBe("web");
    expect(request.dataState).toBe("all");
    expect(request.rowLimit).toBe(1000);
  });

  it("clamps rowLimit to the 1000 ceiling", () => {
    expect(
      buildSearchAnalyticsRequest({ projectId: "p1", rowLimit: 99999 }, TODAY)
        .rowLimit,
    ).toBe(1000);
    expect(
      buildSearchAnalyticsRequest({ projectId: "p1", rowLimit: 0 }, TODAY)
        .rowLimit,
    ).toBe(1);
  });

  it("only includes startRow when positive", () => {
    expect(
      buildSearchAnalyticsRequest({ projectId: "p1" }, TODAY).startRow,
    ).toBeUndefined();
    expect(
      buildSearchAnalyticsRequest({ projectId: "p1", startRow: 1000 }, TODAY)
        .startRow,
    ).toBe(1000);
  });
});

describe("row ceiling", () => {
  // The 1000-row cap exists to protect the MCP agent's context window. The
  // analytics UI inherited it silently, which made every truncation flag
  // downstream unreachable: callers asked for 5000, got 1000, and then tested
  // `rows.length >= 5000` to decide whether the pull was truncated.
  it("clamps to the MCP ceiling by default", () => {
    const request = buildSearchAnalyticsRequest(
      { projectId: "p1", rowLimit: 5000 },
      TODAY,
    );
    expect(request.rowLimit).toBe(GSC_MCP_ROW_CEILING);
  });

  it("honours an explicit analytics ceiling", () => {
    const request = buildSearchAnalyticsRequest(
      { projectId: "p1", rowLimit: 5000 },
      TODAY,
      GSC_ANALYTICS_ROW_CEILING,
    );
    expect(request.rowLimit).toBe(5000);
  });

  it("still clamps a request above the supplied ceiling", () => {
    const request = buildSearchAnalyticsRequest(
      { projectId: "p1", rowLimit: 99_000 },
      TODAY,
      GSC_ANALYTICS_ROW_CEILING,
    );
    expect(request.rowLimit).toBe(GSC_ANALYTICS_ROW_CEILING);
  });

  it("keeps the analytics ceiling above the MCP one", () => {
    // Guards the regression directly: if these converge again, the analytics
    // path silently loses pagination headroom and truncation detection breaks.
    expect(GSC_ANALYTICS_ROW_CEILING).toBeGreaterThan(GSC_MCP_ROW_CEILING);
  });
});
