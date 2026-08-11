import { describe, expect, it } from "vitest";
import { buildClustersVerdict } from "./content";

/* Split out of content.test.ts, which covers `buildContentVerdict` in the
   same module: together they passed this repo's 400-line ceiling. */

describe("buildClustersVerdict", () => {
  it("says so when no clusters were found", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [],
    });

    expect(verdict.tone).toBe("unknown");
    expect(verdict.actions).toEqual([]);
    expect(verdict.read).toBe('No clusters were found for "office coffee".');
  });

  it("calls it bad when even the strongest cluster has too little demand", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Vending machine costs",
          keywordCount: 3,
          totalVolume: 40,
          averageDifficulty: 20,
        },
        {
          name: "Office coffee delivery",
          keywordCount: 2,
          totalVolume: 10,
          averageDifficulty: 15,
        },
      ],
    });

    expect(verdict.tone).toBe("bad");
    expect(verdict.read).toBe(
      'None of the 2 clusters found for "office coffee" have much search demand -- the strongest, "Vending machine costs", totals only 40 searches/mo across 3 keywords.',
    );
    expect(verdict.actions).toEqual([
      {
        label: 'Try a broader seed topic than "office coffee"',
        evidence:
          'Best cluster found ("Vending machine costs") totals only 40 searches/mo',
        weight: 50,
      },
    ]);
  });

  it("calls the volume boundary worth trying right at 100 searches/mo", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Office coffee subscription",
          keywordCount: 6,
          totalVolume: 100,
          averageDifficulty: null,
        },
      ],
    });

    expect(verdict.tone).not.toBe("bad");
  });

  it("calls it mixed when the strongest cluster is hard to rank for", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Enterprise coffee contracts",
          keywordCount: 8,
          totalVolume: 500,
          averageDifficulty: 75,
        },
      ],
    });

    expect(verdict.tone).toBe("mixed");
    expect(verdict.read).toBe(
      '"Enterprise coffee contracts" is the strongest gap found for "office coffee" -- 8 keywords totaling 500 searches/mo, but at an average difficulty of 75, it won\'t be an easy hub to rank.',
    );
    expect(verdict.actions).toEqual([
      {
        label:
          'Build a hub page around "Enterprise coffee contracts", starting with its easier keywords',
        evidence: "Average difficulty 75 across 8 keywords",
        weight: 70,
        to: {
          to: "/p/$projectId/content",
          search: { q: "Enterprise coffee contracts" },
        },
      },
    ]);
  });

  it("calls the difficulty boundary mixed right at KD 70", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Enterprise coffee contracts",
          keywordCount: 8,
          totalVolume: 500,
          averageDifficulty: 70,
        },
      ],
    });

    expect(verdict.tone).toBe("mixed");
  });

  it("calls it good just below the difficulty boundary (KD 69)", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Enterprise coffee contracts",
          keywordCount: 8,
          totalVolume: 500,
          averageDifficulty: 69,
        },
      ],
    });

    expect(verdict.tone).toBe("good");
  });

  it("calls it good and names the hub target when demand and difficulty both check out", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Office coffee subscription",
          keywordCount: 6,
          totalVolume: 500,
          averageDifficulty: 30,
        },
      ],
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toBe(
      '"Office coffee subscription" is the strongest gap worth a hub page -- 6 keywords totaling 500 searches/mo at an average difficulty of 30.',
    );
    expect(verdict.actions).toEqual([
      {
        label: 'Build a hub page around "Office coffee subscription"',
        evidence: "6 keywords, 500 searches/mo, average difficulty 30",
        weight: 100,
        to: {
          to: "/p/$projectId/content",
          search: { q: "Office coffee subscription" },
        },
      },
    ]);
  });

  it("still calls it good without inventing a difficulty figure when none is known", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [
        {
          name: "Office coffee subscription",
          keywordCount: 6,
          totalVolume: 200,
          averageDifficulty: null,
        },
      ],
    });

    expect(verdict.tone).toBe("good");
    expect(verdict.read).toBe(
      '"Office coffee subscription" is the strongest gap worth a hub page -- 6 keywords totaling 200 searches/mo.',
    );
    expect(verdict.actions).toEqual([
      {
        label: 'Build a hub page around "Office coffee subscription"',
        evidence: "6 keywords, 200 searches/mo",
        weight: 100,
        to: {
          to: "/p/$projectId/content",
          search: { q: "Office coffee subscription" },
        },
      },
    ]);
  });
});

describe("buildClustersVerdict area labeling (Task 6)", () => {
  const cluster = {
    name: "Office coffee subscription",
    keywordCount: 6,
    totalVolume: 200,
    averageDifficulty: null,
  };

  it("flags a confirmed-but-unused target area rather than staying silent", () => {
    const verdict = buildClustersVerdict({
      topic: "office coffee",
      clusters: [cluster],
      confirmedAreaLabel: "Dallas-Ft. Worth, TX",
    });

    expect(verdict.read).toContain("nationwide");
    expect(verdict.read).toContain("Dallas-Ft. Worth, TX");
  });

  it("says nothing extra with no confirmed area -- identical to omitting the field", () => {
    const withNull = buildClustersVerdict({
      topic: "office coffee",
      clusters: [cluster],
      confirmedAreaLabel: null,
    });
    const omitted = buildClustersVerdict({
      topic: "office coffee",
      clusters: [cluster],
    });

    expect(withNull.read).toBe(omitted.read);
    expect(withNull.read).not.toContain("nationwide");
  });
});
