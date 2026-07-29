import { describe, expect, it, vi } from "vitest";
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";
import { fetchAllRows } from "@/server/features/gsc/fetchAllRows";

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
 * A stand-in for a property with `total` rows available.
 *
 * Honours `rowLimit` and `startRow` the way the real API does — never returning
 * more rows than were requested. An earlier version of this helper ignored
 * `rowLimit`, which made the final partial page look like an over-fetch bug in
 * the code under test.
 */
function propertyWith(total: number) {
  return vi.fn(async (req: { startRow?: number; rowLimit?: number }) => {
    const start = req.startRow ?? 0;
    const wanted = req.rowLimit ?? total;
    return rows(Math.max(0, Math.min(wanted, total - start)), start);
  });
}

describe("fetchAllRows", () => {
  it("fetches the whole ceiling in one request when the provider allows it", async () => {
    // The point of the ceiling being below the provider's per-request maximum:
    // no pagination round trips in the common case.
    const query = vi.fn(async () => rows(4000));

    const result = await fetchAllRows(query, {}, 5000);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].rowLimit).toBe(5000);
    expect(result.rows).toHaveLength(4000);
    expect(result.truncated).toBe(false);
  });

  it("treats a short page as exhaustion", async () => {
    const query = vi.fn(async () => rows(120));

    const result = await fetchAllRows(query, {}, 5000);

    expect(result.rowsExamined).toBe(120);
    expect(result.truncated).toBe(false);
  });

  it("reports truncation when the ceiling is filled exactly", async () => {
    // A full page is NOT proof of exhaustion, so absence of a row after this
    // pull is not evidence the row does not exist.
    const query = vi.fn(async () => rows(5000));

    const result = await fetchAllRows(query, {}, 5000);

    expect(result.rows).toHaveLength(5000);
    expect(result.truncated).toBe(true);
  });

  it("paginates when the provider caps a request below the ceiling", async () => {
    // Insurance: if the per-request maximum is lower than the ceiling, the same
    // loop just runs more iterations rather than silently under-fetching.
    const query = propertyWith(10_000);

    const result = await fetchAllRows(query, { rowLimit: 1000 }, 2500);
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

    await fetchAllRows(query, { rowLimit: 1000 }, 2500);

    // Final page must ask for 500, not 1000, or we overshoot the CPU ceiling.
    expect(query.mock.calls[2][0].rowLimit).toBe(500);
  });

  it("stops at a partial page mid-pagination", async () => {
    // Exhaustion can land inside a page boundary; the loop must not keep asking.
    const query = propertyWith(1400);

    const result = await fetchAllRows(query, { rowLimit: 1000 }, 5000);

    expect(query).toHaveBeenCalledTimes(2);
    expect(result.rows).toHaveLength(1400);
    expect(result.truncated).toBe(false);
  });

  it("handles an empty result without claiming truncation", async () => {
    const query = vi.fn(async () => []);

    const result = await fetchAllRows(query, {}, 5000);

    expect(result.rows).toEqual([]);
    expect(result.rowsExamined).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("preserves the caller's filters and dimensions on every page", async () => {
    const query = propertyWith(10_000);

    await fetchAllRows(
      query,
      {
        rowLimit: 1000,
        dimensions: ["query", "page"],
        startDate: "2026-01-01",
      },
      2000,
    );

    for (const [request] of query.mock.calls) {
      expect(request.dimensions).toEqual(["query", "page"]);
      expect(request.startDate).toBe("2026-01-01");
    }
  });
});
