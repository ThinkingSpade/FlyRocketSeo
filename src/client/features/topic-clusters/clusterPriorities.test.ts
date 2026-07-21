import { describe, expect, it } from "vitest";
import {
  clusterPlanToMarkdown,
  computeClusterPlanTotals,
  prioritizeClusters,
} from "./clusterPriorities";

function cluster(
  name: string,
  totalVolume: number,
  kd: number | null,
): Parameters<typeof prioritizeClusters>[0][number] {
  return {
    name,
    totalVolume,
    keywords: [
      {
        keyword: `${name} kw`,
        searchVolume: totalVolume,
        keywordDifficulty: kd,
      },
    ],
  };
}

describe("prioritizeClusters", () => {
  it("ranks high-volume low-difficulty clusters first and tiers them", () => {
    const result = prioritizeClusters([
      cluster("hard", 1000, 90),
      cluster("easy win", 900, 10),
      cluster("mid", 600, 40),
    ]);

    expect(result.map((c) => c.name)).toEqual(["easy win", "mid", "hard"]);
    expect(result.map((c) => c.priority)).toEqual([1, 2, 3]);
  });

  it("treats unknown difficulty as middling, not free", () => {
    const result = prioritizeClusters([
      cluster("unknown kd", 600, null),
      cluster("easy", 600, 10),
    ]);
    expect(result[0].name).toBe("easy");
  });

  it("gives a single cluster P1", () => {
    expect(prioritizeClusters([cluster("only", 10, 50)])[0].priority).toBe(1);
  });
});

describe("computeClusterPlanTotals", () => {
  it("sums keywords and volume and averages KD", () => {
    const totals = computeClusterPlanTotals([
      cluster("a", 100, 30),
      cluster("b", 200, 50),
    ]);
    expect(totals).toEqual({
      clusterCount: 2,
      keywordCount: 2,
      totalVolume: 300,
      averageDifficulty: 40,
    });
  });
});

describe("clusterPlanToMarkdown", () => {
  it("renders hub and prioritized clusters as markdown", () => {
    const markdown = clusterPlanToMarkdown({
      topic: "office vending",
      hub: [
        { keyword: "office vending", searchVolume: 700, keywordDifficulty: 20 },
      ],
      clusters: prioritizeClusters([cluster("micro markets", 300, 25)]),
    });

    expect(markdown).toContain("# Topic cluster plan: office vending");
    expect(markdown).toContain("office vending (700/mo)");
    expect(markdown).toContain("## P1 — micro markets (300 vol/mo, avg KD 25)");
    expect(markdown).toContain("| micro markets kw | 300 | 25 |");
  });
});
