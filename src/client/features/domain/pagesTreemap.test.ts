import { describe, expect, it } from "vitest";
import { buildPagesTreemapData } from "./pagesTreemap";

function row(relativePath: string | null, organicTraffic: number | null) {
  return {
    page: `https://x.com${relativePath ?? ""}`,
    relativePath,
    organicTraffic,
  };
}

describe("buildPagesTreemapData", () => {
  it("keeps top pages by traffic and buckets the rest", () => {
    const rows = Array.from({ length: 14 }, (_, index) =>
      row(`/p${index}`, 140 - index * 10),
    );
    const data = buildPagesTreemapData(rows);

    // 11 leaves + the "other" bucket.
    expect(data).toHaveLength(12);
    expect(data[0].name).toBe("/p0");
    const other = data[data.length - 1];
    expect(other.isOther).toBe(true);
    expect(other.name).toBe("3 more pages");
    // 30 + 20 + 10 = the three cut rows.
    expect(other.traffic).toBe(60);
    const shareSum = data.reduce((sum, datum) => sum + datum.share, 0);
    expect(shareSum).toBeCloseTo(1);
  });

  it("labels the homepage and drops zero-traffic rows", () => {
    const data = buildPagesTreemapData([
      row("/", 100),
      row("/a", 50),
      row("/b", 25),
      row("/dead", 0),
      row("/unknown", null),
    ]);
    expect(data.map((d) => d.name)).toEqual(["/ (homepage)", "/a", "/b"]);
  });

  it("returns empty below three traffic-bearing pages", () => {
    expect(buildPagesTreemapData([row("/a", 10), row("/b", 5)])).toEqual([]);
  });
});
