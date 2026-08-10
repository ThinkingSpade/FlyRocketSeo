import { describe, expect, it } from "vitest";
import { applyProjectCompetitors } from "./applyProjectCompetitors";
import type { CompetitorRow } from "@/types/schemas/competitors";

const row = (domain: string, beatsYouCount: number): CompetitorRow => ({
  domain,
  avgPosition: null,
  intersections: null,
  organicKeywords: null,
  organicTraffic: null,
  coverage: null,
  beatsYouCount,
  positionDelta: null,
  source: "serp",
  pinned: false,
});

const override = (domain: string, status: "pinned" | "excluded") => ({
  id: `id-${domain}`,
  projectId: "p1",
  domain,
  status,
  note: "",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
});

describe("applyProjectCompetitors", () => {
  it("removes excluded domains and counts them", () => {
    const result = applyProjectCompetitors(
      [row("avfusa.com", 30), row("webstaurantstore.com", 0)],
      [override("webstaurantstore.com", "excluded")],
    );

    expect(result.rows.map((r) => r.domain)).toEqual(["avfusa.com"]);
    expect(result.hiddenCount).toBe(1);
  });

  it("marks a discovered domain as pinned and moves it to the top", () => {
    const result = applyProjectCompetitors(
      [row("bigrival.com", 30), row("avfusa.com", 5)],
      [override("avfusa.com", "pinned")],
    );

    expect(result.rows[0].domain).toBe("avfusa.com");
    expect(result.rows[0].pinned).toBe(true);
  });

  it("adds a pinned domain discovery missed, without inventing metrics", () => {
    const result = applyProjectCompetitors(
      [row("bigrival.com", 30)],
      [override("vendingexchange.com", "pinned")],
    );

    const added = result.rows.find((r) => r.domain === "vendingexchange.com");
    expect(added).toBeDefined();
    expect(added?.pinned).toBe(true);
    // Never fabricate numbers for a domain the vendor did not return.
    expect(added?.beatsYouCount).toBeNull();
    expect(added?.coverage).toBeNull();
  });

  it("lets exclusion win when a domain is somehow both", () => {
    const result = applyProjectCompetitors(
      [row("x.com", 5)],
      [override("x.com", "pinned"), override("x.com", "excluded")],
    );

    expect(result.rows).toHaveLength(0);
    expect(result.hiddenCount).toBe(1);
  });
});
