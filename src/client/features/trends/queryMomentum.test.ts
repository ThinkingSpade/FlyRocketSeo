import { describe, expect, it } from "vitest";
import {
  computeQueryMomentum,
  momentumLabel,
  type QueryMomentum,
} from "./queryMomentum";

const run = (
  current: Array<{ query: string; impressions: number }>,
  previous: Array<{ query: string; impressions: number }>,
  previousTruncated = false,
) => computeQueryMomentum({ current, previous, previousTruncated });

const byQuery = (rows: QueryMomentum[], query: string) =>
  rows.find((row) => row.query === query);

describe("computeQueryMomentum", () => {
  it("calls a clear increase rising, with the percentage", () => {
    const [row] = run(
      [{ query: "office coffee service", impressions: 150 }],
      [{ query: "office coffee service", impressions: 100 }],
    );
    expect(row.direction).toBe("rising");
    expect(row.percent).toBe(50);
  });

  it("calls a clear decrease falling", () => {
    const [row] = run(
      [{ query: "dfw vending", impressions: 40 }],
      [{ query: "dfw vending", impressions: 100 }],
    );
    expect(row.direction).toBe("falling");
    expect(row.percent).toBe(-60);
  });

  it("treats a swing inside the dead band as flat", () => {
    // 15% is ranking jitter on a small site, not a trend.
    const [row] = run(
      [{ query: "micro market", impressions: 115 }],
      [{ query: "micro market", impressions: 100 }],
    );
    expect(row.direction).toBe("flat");
  });

  it("issues no verdict below the impression floor", () => {
    // 3 -> 6 is not "up 100%". Saying so is how the tab loses trust.
    const [row] = run(
      [{ query: "breakroom vending", impressions: 6 }],
      [{ query: "breakroom vending", impressions: 3 }],
    );
    expect(row.direction).toBe("unknown");
    expect(row.percent).toBeNull();
  });

  it("reports no baseline when the query had no prior row", () => {
    const [row] = run(
      [{ query: "micro market dallas", impressions: 60 }],
      [{ query: "something else", impressions: 20 }],
      false,
    );
    expect(row.direction).toBe("no-baseline");
    expect(row.prevImpressions).toBeNull();
    expect(row.percent).toBeNull();
  });

  it("still reports no baseline when the prior fetch was truncated", () => {
    // Truncation is one of several reasons a row can be absent -- GSC also
    // sorts by clicks and withholds anonymised queries -- so absence never
    // implies novelty either way. The flag only drives UI copy.
    const [row] = run(
      [{ query: "micro market dallas", impressions: 60 }],
      [{ query: "something else", impressions: 20 }],
      true,
    );
    expect(row.direction).toBe("no-baseline");
  });

  it("treats a prior row of zero impressions as no prior row", () => {
    // Dividing by it would yield Infinity.
    const [row] = run(
      [{ query: "office pantry service", impressions: 80 }],
      [{ query: "office pantry service", impressions: 0 }],
    );
    expect(row.direction).toBe("no-baseline");
    expect(row.percent).toBeNull();
    expect(Number.isFinite(row.percent ?? 0)).toBe(true);
  });

  it("sums duplicate prior rows for the same query", () => {
    // GSC can return one row per page for a query; the prior fetch is
    // query-dimensioned, but defend against it either way.
    const [row] = run(
      [{ query: "vending service", impressions: 300 }],
      [
        { query: "vending service", impressions: 100 },
        { query: "vending service", impressions: 100 },
      ],
    );
    expect(row.prevImpressions).toBe(200);
    expect(row.percent).toBe(50);
  });

  it("never emits a non-finite percentage", () => {
    const rows = run(
      [
        { query: "a", impressions: 100 },
        { query: "b", impressions: 100 },
        { query: "c", impressions: 5 },
      ],
      [{ query: "a", impressions: 0 }],
    );
    for (const row of rows) {
      expect(row.percent === null || Number.isFinite(row.percent)).toBe(true);
    }
  });

  it("keeps one output row per input row, in order", () => {
    const rows = run(
      [
        { query: "a", impressions: 100 },
        { query: "b", impressions: 50 },
      ],
      [],
    );
    expect(rows.map((row) => row.query)).toEqual(["a", "b"]);
  });

  it("handles an empty prior period without throwing", () => {
    const rows = run([{ query: "a", impressions: 100 }], []);
    expect(byQuery(rows, "a")?.direction).toBe("no-baseline");
  });
});

describe("momentumLabel", () => {
  const base = { query: "k", impressions: 100, prevImpressions: 50 };

  it("shows a signed percentage for a real trend", () => {
    expect(momentumLabel({ ...base, percent: 50, direction: "rising" })).toBe(
      "+50% impressions vs last period",
    );
    expect(momentumLabel({ ...base, percent: -40, direction: "falling" })).toBe(
      "-40% impressions vs last period",
    );
  });

  it("shows no number for the honest non-answers", () => {
    expect(
      momentumLabel({
        ...base,
        prevImpressions: null,
        percent: null,
        direction: "no-baseline",
      }),
    ).toBe("No earlier figure to compare");
    expect(
      momentumLabel({ ...base, percent: null, direction: "unknown" }),
    ).toBe("Too few impressions to judge");
  });
});
