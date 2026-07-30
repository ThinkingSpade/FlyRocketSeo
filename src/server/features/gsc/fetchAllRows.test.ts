import { describe, expect, it, vi } from "vitest";
import type {
  GscSearchAnalyticsRequest,
  GscSearchAnalyticsRow,
} from "@/server/lib/gscClient";
import {
  fetchAllRows,
  pullWasTruncated,
} from "@/server/features/gsc/fetchAllRows";

const BASE: Omit<GscSearchAnalyticsRequest, "startRow"> = {
  startDate: "2026-01-01",
  endDate: "2026-01-28",
};

function rows(count: number, offset = 0): GscSearchAnalyticsRow[] {
  return Array.from({ length: count }, (_, i) => ({
    keys: [`q${offset + i}`],
    clicks: 1,
    impressions: 10,
    ctr: 0.1,
    position: 5,
  }));
}

/**
 * A stand-in for a property with `total` exposed rows.
 *
 * Honours `rowLimit` and `startRow` the way the real API does — never returning
 * more rows than were requested. An earlier version ignored `rowLimit`, which
 * made a correct final partial page look like an over-fetch in the code under
 * test.
 */
function propertyWith(total: number) {
  return vi.fn(async (req: GscSearchAnalyticsRequest) => {
    const start = req.startRow ?? 0;
    const wanted = req.rowLimit ?? total;
    return rows(Math.max(0, Math.min(wanted, total - start)), start);
  });
}

/** Always returns exactly `count` rows, whatever was asked for. */
function alwaysReturns(count: number) {
  return vi.fn(async (_req: GscSearchAnalyticsRequest) => rows(count));
}

describe("fetchAllRows", () => {
  it("fetches the whole ceiling in one request when the provider allows it", async () => {
    // The point of the ceiling sitting below the provider's per-request maximum:
    // no pagination round trips in the common case.
    const query = alwaysReturns(4000);

    const result = await fetchAllRows(query, BASE, 5000);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0].rowLimit).toBe(5000);
    expect(result.rows).toHaveLength(4000);
    expect(result.truncated).toBe(false);
  });

  it("treats a short page as exhaustion", async () => {
    const query = alwaysReturns(120);

    const result = await fetchAllRows(query, BASE, 5000);

    expect(result.rowsExamined).toBe(120);
    expect(result.truncated).toBe(false);
  });

  it("reports truncation when the ceiling is filled exactly", async () => {
    // A full page is NOT proof of exhaustion, so absence of a row after this
    // pull is not evidence that the row does not exist.
    const query = alwaysReturns(5000);

    const result = await fetchAllRows(query, BASE, 5000);

    expect(result.rows).toHaveLength(5000);
    expect(result.truncated).toBe(true);
  });

  it("paginates when the caller caps a request below the ceiling", async () => {
    // Insurance: if the per-request maximum is ever lower than the ceiling, the
    // same loop runs more iterations rather than silently under-fetching.
    const query = propertyWith(10_000);

    const result = await fetchAllRows(query, { ...BASE, rowLimit: 1000 }, 2500);
    const keys = result.rows.map((r) => r.keys?.[0]);

    expect(query).toHaveBeenCalledTimes(3);
    expect(result.rows).toHaveLength(2500);
    expect(new Set(keys).size).toBe(2500);
    expect(keys[0]).toBe("q0");
    expect(keys[2499]).toBe("q2499");
    expect(result.truncated).toBe(true);
  });

  it("never requests more rows than the ceiling leaves room for", async () => {
    const query = propertyWith(10_000);

    await fetchAllRows(query, { ...BASE, rowLimit: 1000 }, 2500);

    // The final page must ask for 500, not 1000, or we pay parse CPU for rows
    // we would immediately discard.
    expect(query.mock.calls[2]?.[0].rowLimit).toBe(500);
  });

  it("stops at a partial page mid-pagination", async () => {
    // Exhaustion can land inside a page boundary; the loop must not keep asking.
    const query = propertyWith(1400);

    const result = await fetchAllRows(query, { ...BASE, rowLimit: 1000 }, 5000);

    expect(query).toHaveBeenCalledTimes(2);
    expect(result.rows).toHaveLength(1400);
    expect(result.truncated).toBe(false);
  });

  it("omits startRow on the first request and sets it thereafter", async () => {
    const query = propertyWith(10_000);

    await fetchAllRows(query, { ...BASE, rowLimit: 1000 }, 2000);

    expect(query.mock.calls[0]?.[0].startRow).toBeUndefined();
    expect(query.mock.calls[1]?.[0].startRow).toBe(1000);
  });

  it("handles an empty result without claiming truncation", async () => {
    const query = alwaysReturns(0);

    const result = await fetchAllRows(query, BASE, 5000);

    expect(result.rows).toEqual([]);
    expect(result.rowsExamined).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("preserves the caller's filters and dimensions on every page", async () => {
    const query = propertyWith(10_000);

    await fetchAllRows(
      query,
      { ...BASE, rowLimit: 1000, dimensions: ["query", "page"] },
      2000,
    );

    for (const [request] of query.mock.calls) {
      expect(request.dimensions).toEqual(["query", "page"]);
      expect(request.startDate).toBe("2026-01-01");
      expect(request.endDate).toBe("2026-01-28");
    }
  });
});

describe("pullWasTruncated", () => {
  it("is true when the pull came back exactly full", () => {
    expect(
      pullWasTruncated({ rows: rows(1000), request: { rowLimit: 1000 } }),
    ).toBe(true);
  });

  it("is false when the pull came back short", () => {
    expect(
      pullWasTruncated({ rows: rows(999), request: { rowLimit: 1000 } }),
    ).toBe(false);
  });

  it("uses the applied limit, so a clamped request is still detected", () => {
    // The original defect: a caller asked for 5000 and the builder clamped to
    // 1000, but truncation was tested against 5000 -- so a pull that was plainly
    // cut short reported itself complete. Passing the request AS SENT is what
    // makes this detectable, so the 1000 rows below are correctly truncated even
    // though 1000 was never what the caller wanted.
    const asSent = { rows: rows(1000), request: { rowLimit: 1000 } };
    const asRequested = 5000;

    expect(pullWasTruncated(asSent)).toBe(true);
    expect(asSent.rows.length).toBeLessThan(asRequested);
  });

  it("assumes truncation when no limit was recorded", () => {
    // Deliberately conservative: with no applied limit we cannot establish
    // completeness, and over-claiming absence is the failure mode that matters.
    // In practice buildSearchAnalyticsRequest always sets rowLimit, so this is a
    // guard rather than a live path.
    expect(pullWasTruncated({ rows: [], request: {} })).toBe(true);
  });
});

describe("fetchAllRows guards", () => {
  it("rejects a zero rowLimit instead of looping forever", async () => {
    // `0 < ceiling` stays true while nothing is ever collected, so the original
    // loop would request zero rows indefinitely.
    const query = alwaysReturns(0);

    await expect(
      fetchAllRows(query, { ...BASE, rowLimit: 0 }, 5000),
    ).rejects.toThrow(/rowLimit must be a positive integer/);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a non-positive ceiling", async () => {
    await expect(fetchAllRows(alwaysReturns(10), BASE, 0)).rejects.toThrow(
      /ceiling must be a positive integer/,
    );
  });

  it("clips a provider that returns more rows than requested", async () => {
    // The ceiling is a CPU budget, so overshooting it is not a harmless surplus.
    const query = alwaysReturns(6000);

    const result = await fetchAllRows(query, BASE, 5000);

    expect(result.rows).toHaveLength(5000);
    expect(result.truncated).toBe(true);
  });
});
