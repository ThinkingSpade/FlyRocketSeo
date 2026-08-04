import { describe, expect, it } from "vitest";
import {
  aggregateByHost,
  hostFromPageUrl,
  sortHostsByPerformance,
  type GscPageRow,
} from "./hostPerformance";

function pageRow(
  page: string,
  clicks: number,
  impressions: number,
  position?: number,
): GscPageRow {
  return { keys: [page], clicks, impressions, position };
}

describe("hostFromPageUrl", () => {
  it("pulls the subdomain out of a full page URL", () => {
    expect(hostFromPageUrl("https://austin.example.com/plumbers")).toBe(
      "austin.example.com",
    );
  });

  it("lowercases, so it matches the stored host", () => {
    expect(hostFromPageUrl("https://AUSTIN.example.com/")).toBe(
      "austin.example.com",
    );
  });

  it("returns null for anything unparseable rather than throwing", () => {
    expect(hostFromPageUrl("not a url")).toBeNull();
    expect(hostFromPageUrl("")).toBeNull();
    expect(hostFromPageUrl(undefined)).toBeNull();
  });
});

describe("aggregateByHost", () => {
  it("sums clicks and impressions across a host's pages", () => {
    const result = aggregateByHost([
      pageRow("https://austin.example.com/a", 10, 100, 4),
      pageRow("https://austin.example.com/b", 5, 50, 8),
    ]);

    expect(result).toEqual([
      {
        host: "austin.example.com",
        clicks: 15,
        impressions: 150,
        ctr: 0.1,
        position: (4 * 100 + 8 * 50) / 150,
        pageCount: 2,
      },
    ]);
  });

  it("keeps separate subdomains apart", () => {
    const result = aggregateByHost([
      pageRow("https://austin.example.com/a", 10, 100, 4),
      pageRow("https://dallas.example.com/a", 3, 30, 9),
    ]);

    expect(result.map((row) => row.host).toSorted()).toEqual([
      "austin.example.com",
      "dallas.example.com",
    ]);
  });

  /**
   * The failure this guards: averaging per-page CTRs. A page seen 4 times with
   * 1 click has a 25% CTR, and a plain mean would let it drag the host's rate
   * up to ~13% when the host's actual rate is barely 1%.
   */
  it("derives CTR from the totals rather than averaging page rates", () => {
    const result = aggregateByHost([
      pageRow("https://austin.example.com/tiny", 1, 4, 3),
      pageRow("https://austin.example.com/main", 9, 996, 12),
    ]);

    expect(result[0]?.ctr).toBeCloseTo(10 / 1000, 10);
    // The naive mean of 25% and ~0.9% would be ~13%.
    expect(result[0]?.ctr).toBeLessThan(0.02);
  });

  /**
   * The same failure for position, which is the one people notice: a page seen
   * three times at rank 2 must not pull a host's headline position level with
   * its main landing page.
   */
  it("weights average position by impressions", () => {
    const result = aggregateByHost([
      pageRow("https://austin.example.com/rare", 0, 3, 2),
      pageRow("https://austin.example.com/main", 50, 9997, 30),
    ]);

    // Plain mean would be 16; the weighted answer is ~29.99.
    expect(result[0]?.position).toBeGreaterThan(29);
  });

  it("excludes zero-impression rows from the position weighting", () => {
    const result = aggregateByHost([
      pageRow("https://austin.example.com/a", 0, 0, 1),
      pageRow("https://austin.example.com/b", 5, 100, 20),
    ]);

    expect(result[0]?.position).toBe(20);
    expect(result[0]?.pageCount).toBe(2);
  });

  it("reports no position for a host with no impressions at all", () => {
    const result = aggregateByHost([
      pageRow("https://austin.example.com/a", 0, 0, 5),
    ]);

    expect(result[0]).toMatchObject({ position: null, ctr: 0 });
  });

  it("skips rows whose page URL cannot be parsed", () => {
    const result = aggregateByHost([
      { keys: ["nonsense"], clicks: 99, impressions: 99 },
      pageRow("https://austin.example.com/a", 1, 10, 3),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.clicks).toBe(1);
  });

  it("tolerates rows with missing metrics", () => {
    const result = aggregateByHost([
      { keys: ["https://austin.example.com/a"] },
    ]);
    expect(result[0]).toMatchObject({
      clicks: 0,
      impressions: 0,
      position: null,
    });
  });

  it("returns nothing for no rows", () => {
    expect(aggregateByHost([])).toEqual([]);
  });
});

describe("sortHostsByPerformance", () => {
  it("orders by clicks, then impressions, then host name", () => {
    const sorted = sortHostsByPerformance([
      {
        host: "b.example.com",
        clicks: 0,
        impressions: 10,
        ctr: 0,
        position: null,
        pageCount: 1,
      },
      {
        host: "a.example.com",
        clicks: 0,
        impressions: 10,
        ctr: 0,
        position: null,
        pageCount: 1,
      },
      {
        host: "c.example.com",
        clicks: 0,
        impressions: 99,
        ctr: 0,
        position: null,
        pageCount: 1,
      },
      {
        host: "d.example.com",
        clicks: 5,
        impressions: 1,
        ctr: 5,
        position: null,
        pageCount: 1,
      },
    ]);

    expect(sorted.map((row) => row.host)).toEqual([
      "d.example.com",
      "c.example.com",
      "a.example.com",
      "b.example.com",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [
      {
        host: "a.example.com",
        clicks: 1,
        impressions: 1,
        ctr: 1,
        position: null,
        pageCount: 1,
      },
      {
        host: "b.example.com",
        clicks: 9,
        impressions: 9,
        ctr: 1,
        position: null,
        pageCount: 1,
      },
    ];
    sortHostsByPerformance(input);
    expect(input[0]?.host).toBe("a.example.com");
  });
});
