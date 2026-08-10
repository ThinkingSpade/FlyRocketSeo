import { describe, expect, it } from "vitest";
import {
  buildCompetitorSeed,
  COMPETITOR_SEED_SIZE,
  MIN_COMPETITOR_SEED,
} from "./competitorSeed";

const row = (key: string, impressions: number, position: number) => ({
  key,
  impressions,
  position,
});

describe("buildCompetitorSeed", () => {
  it("drops branded queries, which return the client and nobody else", () => {
    const seed = buildCompetitorSeed(
      [
        row("america vending", 900, 1.2),
        row("americavending reviews", 400, 2.0),
        row("office coffee service dallas", 300, 8.4),
      ],
      { brandTerms: "America Vending\nAmericaVending" },
    );

    expect(seed.keywords.map((k) => k.keyword)).toEqual([
      "office coffee service dallas",
    ]);
    expect(seed.droppedBranded).toBe(2);
  });

  it("prefers queries the client does not already own", () => {
    const seed = buildCompetitorSeed(
      [
        row("already first", 5000, 1.0),
        row("contested term", 100, 9.0),
      ],
      { brandTerms: "" },
    );

    // Impressions alone would put "already first" on top; a query the client
    // already ranks #1 for cannot reveal a rival, so it sorts behind.
    expect(seed.keywords[0].keyword).toBe("contested term");
  });

  it("backfills with position-1 queries rather than returning a short seed", () => {
    const seed = buildCompetitorSeed(
      [row("contested", 100, 4.0), row("owned a", 90, 1.0), row("owned b", 80, 1.0)],
      { brandTerms: "", limit: 3 },
    );

    expect(seed.keywords).toHaveLength(3);
    expect(seed.keywords[0].keyword).toBe("contested");
  });

  it("caps the seed at the configured limit, highest impressions first", () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      row(`kw ${i}`, 1000 - i, 5),
    );

    const seed = buildCompetitorSeed(rows, { brandTerms: "" });

    expect(seed.keywords).toHaveLength(COMPETITOR_SEED_SIZE);
    expect(seed.keywords[0].keyword).toBe("kw 0");
    expect(seed.totalConsidered).toBe(60);
  });

  it("carries the client's own position through for later comparison", () => {
    const seed = buildCompetitorSeed([row("contested", 100, 11.4)], {
      brandTerms: "",
    });

    expect(seed.keywords[0].selfPosition).toBe(11.4);
  });

  it("reports a seed too small to be representative", () => {
    const seed = buildCompetitorSeed([row("only one", 10, 4)], {
      brandTerms: "",
    });

    expect(seed.keywords.length).toBeLessThan(MIN_COMPETITOR_SEED);
  });
});
