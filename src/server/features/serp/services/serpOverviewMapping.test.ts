import { describe, expect, it } from "vitest";
import type { SerpLiveItem } from "@/server/lib/dataforseo/serp";
import { mapSerpOverview } from "./serpOverviewMapping";

function organicItem(overrides: Partial<SerpLiveItem> = {}): SerpLiveItem {
  return {
    type: "organic",
    rank_absolute: 1,
    domain: "example.com",
    title: "Example",
    url: "https://example.com/",
    description: "desc",
    etv: 123.4,
    backlinks_info: { backlinks: 50, referring_domains: 10 },
    rank_changes: {
      previous_rank_absolute: 3,
      is_new: false,
      is_up: true,
      is_down: false,
    },
    ...overrides,
  };
}

describe("mapSerpOverview", () => {
  it("maps organic results with metrics and movement", () => {
    const overview = mapSerpOverview([
      organicItem(),
      organicItem({
        rank_absolute: 2,
        domain: "other.com",
        backlinks_info: null,
        rank_changes: null,
      }),
      { type: "related_searches" },
    ]);

    expect(overview.totalOrganic).toBe(2);
    expect(overview.results[0]).toMatchObject({
      rank: 1,
      domain: "example.com",
      etv: 123.4,
      backlinks: 50,
      referringDomains: 10,
      previousRank: 3,
      isUp: true,
    });
    // Absent enrichments stay null/false, never fabricated.
    expect(overview.results[1]).toMatchObject({
      backlinks: null,
      referringDomains: null,
      previousRank: null,
      isNew: false,
    });
  });

  it("extracts People-Also-Ask questions and counts SERP features", () => {
    const overview = mapSerpOverview([
      organicItem(),
      {
        type: "people_also_ask",
        items: [
          { title: "What is SEO?" },
          { title: "What is SEO?" },
          { title: "  How long does SEO take? " },
          { title: null },
        ],
      } as SerpLiveItem,
      { type: "video" },
      { type: "video" },
      { type: "featured_snippet" },
    ]);

    expect(overview.paaQuestions).toEqual([
      "What is SEO?",
      "How long does SEO take?",
    ]);
    expect(overview.serpFeatures).toEqual([
      { type: "video", count: 2 },
      { type: "featured_snippet", count: 1 },
      { type: "people_also_ask", count: 1 },
    ]);
  });

  it("caps organic results at 20 and tolerates junk items", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      organicItem({ rank_absolute: index + 1, domain: `d${index}.com` }),
    );
    // The passthrough schema lets arbitrary extra fields ride along, so a
    // junk-shaped `items` is a legal SerpLiveItem — no assertion needed.
    const junkPaa: SerpLiveItem = { type: "people_also_ask", items: "junk" };
    const overview = mapSerpOverview([...many, junkPaa]);
    expect(overview.results).toHaveLength(20);
    expect(overview.totalOrganic).toBe(30);
    expect(overview.paaQuestions).toEqual([]);
  });
});
