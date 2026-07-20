import { describe, expect, it } from "vitest";
import { buildTopicClusters } from "./topicClusterMapping";

function item(keyword: string, volume: number | null = 100) {
  return { keyword, keyword_info: { search_volume: volume } };
}

describe("buildTopicClusters", () => {
  it("groups keywords by their first non-seed modifier", () => {
    const plan = buildTopicClusters("vending machines", [
      item("vending machines", 5000),
      item("vending machine", 3000),
      item("healthy vending machines", 400),
      item("healthy vending machine snacks", 300),
      item("vending machines for sale", 900),
      item("used vending machines for sale", 500),
      item("commercial vending machines", 80),
    ]);

    expect(plan.hub.map((k) => k.keyword)).toEqual([
      "vending machines",
      "vending machine",
    ]);

    const names = plan.clusters.map((c) => c.name);
    expect(names).toContain("Healthy");
    expect(names).toContain("Sale");
    const healthy = plan.clusters.find((c) => c.name === "Healthy")!;
    expect(healthy.keywords.map((k) => k.keyword)).toEqual([
      "healthy vending machines",
      "healthy vending machine snacks",
    ]);
    expect(healthy.totalVolume).toBe(700);
    // Lone modifier ("commercial") lands in the More ideas bucket.
    expect(plan.clusters.at(-1)?.name).toBe("More ideas");
  });

  it("sorts clusters by total volume and tolerates junk items", () => {
    const plan = buildTopicClusters("coffee", [
      item("office coffee", 100),
      item("office coffee service", 50),
      item("cold coffee", 9000),
      item("cold brew coffee", 8000),
      "junk",
      { keyword: null },
    ]);
    expect(plan.clusters[0].name).toBe("Cold");
    expect(plan.clusters[1].name).toBe("Office");
  });
});
