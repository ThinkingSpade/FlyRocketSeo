import { describe, expect, it } from "vitest";
import {
  applyProjectCompetitors,
  reapplyProjectCompetitors,
} from "./applyProjectCompetitors";
import type {
  CompetitorRow,
  CompetitorsPage,
} from "@/types/schemas/competitors";

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
  category: null,
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

  it("still classifies a synthesized pinned row -- the domain is known even though its metrics are not", () => {
    const result = applyProjectCompetitors(
      [row("bigrival.com", 30)],
      [override("youtube.com", "pinned")],
    );

    const added = result.rows.find((r) => r.domain === "youtube.com");
    // Classification is a pure function of the domain string, so it does not
    // require a vendor measurement the way beatsYouCount/coverage do.
    expect(added?.category).toBe("video");
    // A pin still wins at the presentation layer (isCompetitorRow) despite
    // this -- applyProjectCompetitors itself just records the honest fact.
    expect(added?.pinned).toBe(true);
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

const page = (
  rows: CompetitorRow[],
  overrides: Partial<CompetitorsPage> = {},
): CompetitorsPage => ({
  rows,
  totalCount: rows.length,
  fetchedAt: "2026-08-01T00:00:00.000Z",
  seedSize: 20,
  hiddenCount: 0,
  discoveryMode: "serp",
  seedTruncated: false,
  ...overrides,
});

describe("reapplyProjectCompetitors", () => {
  it("replaces rows/hiddenCount but preserves every other field untouched", () => {
    const input = page(
      [row("avfusa.com", 30), row("webstaurantstore.com", 0)],
      {
        totalCount: 99,
        fetchedAt: "2026-08-01T12:00:00.000Z",
        seedSize: 37,
        discoveryMode: "serp",
        seedTruncated: true,
      },
    );

    const result = reapplyProjectCompetitors(input, [
      override("webstaurantstore.com", "excluded"),
    ]);

    expect(result.rows.map((r) => r.domain)).toEqual(["avfusa.com"]);
    expect(result.hiddenCount).toBe(1);
    expect(result.totalCount).toBe(99);
    expect(result.fetchedAt).toBe("2026-08-01T12:00:00.000Z");
    expect(result.seedSize).toBe(37);
    expect(result.discoveryMode).toBe("serp");
    expect(result.seedTruncated).toBe(true);
  });

  it("is a pure view: calling it twice with the SAME pristine page and the SAME overrides gives the same answer", () => {
    // This is the property CompetitorsService relies on: every read (a fresh
    // vendor call, a cache hit, a restore) reapplies against a page that was
    // never itself the output of a prior application, so calling it again
    // must not compound or drift.
    const input = page([row("avfusa.com", 30), row("webstaurantstore.com", 0)]);
    const overrides = [override("webstaurantstore.com", "excluded")];

    const first = reapplyProjectCompetitors(input, overrides);
    const second = reapplyProjectCompetitors(input, overrides);

    expect(second).toEqual(first);
  });

  it("returns an unhidden domain and a corrected hiddenCount once an exclusion is lifted", () => {
    const input = page([row("avfusa.com", 30), row("webstaurantstore.com", 0)]);

    const stillExcluded = reapplyProjectCompetitors(input, [
      override("webstaurantstore.com", "excluded"),
    ]);
    // The exclusion was lifted (override removed) -- reapplying against the
    // SAME pristine input with the new override list must bring the domain
    // back and drop hiddenCount, not leave it stuck at the old answer.
    const unhidden = reapplyProjectCompetitors(input, []);

    expect(stillExcluded.rows.map((r) => r.domain)).toEqual(["avfusa.com"]);
    expect(stillExcluded.hiddenCount).toBe(1);
    expect(unhidden.rows.map((r) => r.domain)).toEqual([
      "avfusa.com",
      "webstaurantstore.com",
    ]);
    expect(unhidden.hiddenCount).toBe(0);
  });
});
