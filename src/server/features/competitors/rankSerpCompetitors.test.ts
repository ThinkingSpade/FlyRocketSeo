import { describe, expect, it } from "vitest";
import { rankSerpCompetitors } from "./rankSerpCompetitors";
import type { SeedQuery } from "./competitorSeed";

const seed: SeedQuery[] = [
  { keyword: "vending machine service dallas", impressions: 500, selfPosition: 11 },
  { keyword: "office coffee service", impressions: 300, selfPosition: 8 },
  { keyword: "micro market provider", impressions: 100, selfPosition: 15 },
];

describe("rankSerpCompetitors", () => {
  it("counts the seed keywords a domain outranks the client on", () => {
    const [row] = rankSerpCompetitors(
      [
        {
          domain: "avfusa.com",
          keywords_count: 3,
          keywords_positions: {
            "vending machine service dallas": [4],
            "office coffee service": [2],
            "micro market provider": [20],
          },
        },
      ],
      seed,
      "americavending.com",
    );

    // Beats the client at 11 -> 4 and 8 -> 2, loses at 15 -> 20.
    expect(row.beatsYouCount).toBe(2);
  });

  it("measures coverage against the seed, not the competitor's own footprint", () => {
    const [row] = rankSerpCompetitors(
      [
        {
          domain: "webstaurantstore.com",
          keywords_count: 1,
          keywords_positions: { "office coffee service": [30] },
        },
      ],
      seed,
      "americavending.com",
    );

    expect(row.coverage).toBeCloseTo(1 / 3);
    expect(row.beatsYouCount).toBe(0);
  });

  it("ranks the domain that beats you most first", () => {
    const rows = rankSerpCompetitors(
      [
        {
          domain: "marketplace.com",
          keywords_positions: { "office coffee service": [30] },
        },
        {
          domain: "avfusa.com",
          keywords_positions: {
            "vending machine service dallas": [4],
            "office coffee service": [2],
          },
        },
      ],
      seed,
      "americavending.com",
    );

    expect(rows.map((r) => r.domain)).toEqual([
      "avfusa.com",
      "marketplace.com",
    ]);
  });

  it("excludes the client's own domain", () => {
    const rows = rankSerpCompetitors(
      [
        { domain: "americavending.com", keywords_positions: {} },
        { domain: "avfusa.com", keywords_positions: {} },
      ],
      seed,
      "americavending.com",
    );

    expect(rows.map((r) => r.domain)).toEqual(["avfusa.com"]);
  });

  it("keeps a domain with no position data instead of dropping it silently", () => {
    const [row] = rankSerpCompetitors(
      [{ domain: "unknown.com", keywords_count: 2 }],
      seed,
      "americavending.com",
    );

    expect(row.beatsYouCount).toBe(0);
    expect(row.positionDelta).toBeNull();
    expect(row.source).toBe("serp");
  });

  it("reports position delta against the client, negative when ahead", () => {
    const [row] = rankSerpCompetitors(
      [
        {
          domain: "avfusa.com",
          keywords_positions: {
            "vending machine service dallas": [4],
            "office coffee service": [2],
          },
        },
      ],
      seed,
      "americavending.com",
    );

    // median(their 2,4) = 3; median(client 8,11) = 9.5; delta = -6.5
    expect(row.positionDelta).toBeCloseTo(-6.5);
  });
});
