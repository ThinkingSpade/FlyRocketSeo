import { describe, expect, it } from "vitest";
import { groupCompetitorRows } from "./groupCompetitorRows";
import type { CompetitorRow } from "@/types/schemas/competitors";

function row(
  overrides: Partial<CompetitorRow> & { domain: string },
): CompetitorRow {
  return {
    avgPosition: null,
    intersections: null,
    organicKeywords: null,
    organicTraffic: null,
    coverage: null,
    beatsYouCount: null,
    positionDelta: null,
    source: "serp",
    pinned: false,
    category: null,
    ...overrides,
  };
}

describe("groupCompetitorRows", () => {
  it("puts an unclassified row in competitors and a classified one in notCompetitors", () => {
    const result = groupCompetitorRows([
      row({ domain: "realrival.com", category: null }),
      row({ domain: "youtube.com", category: "video" }),
    ]);

    expect(result.competitors.map((r) => r.domain)).toEqual(["realrival.com"]);
    expect(result.notCompetitors.map((r) => r.domain)).toEqual(["youtube.com"]);
  });

  it("lets a pin override a classification into the competitors group", () => {
    const result = groupCompetitorRows([
      row({ domain: "youtube.com", category: "video", pinned: true }),
    ]);

    expect(result.competitors.map((r) => r.domain)).toEqual(["youtube.com"]);
    expect(result.notCompetitors).toEqual([]);
  });

  it("preserves each group's existing relative order -- a stable partition, not a fresh sort", () => {
    // Deliberately NOT in beatsYouCount order: if this function re-sorted
    // instead of just splitting, this input/output pair would not match.
    const result = groupCompetitorRows([
      row({ domain: "low.com", beatsYouCount: 1, category: null }),
      row({ domain: "platform-a.com", beatsYouCount: 99, category: "social" }),
      row({ domain: "high.com", beatsYouCount: 50, category: null }),
      row({ domain: "platform-b.com", beatsYouCount: 40, category: "video" }),
    ]);

    expect(result.competitors.map((r) => r.domain)).toEqual([
      "low.com",
      "high.com",
    ]);
    expect(result.notCompetitors.map((r) => r.domain)).toEqual([
      "platform-a.com",
      "platform-b.com",
    ]);
  });

  it("returns two empty arrays for no rows", () => {
    const result = groupCompetitorRows([]);
    expect(result.competitors).toEqual([]);
    expect(result.notCompetitors).toEqual([]);
  });

  it("never drops a row -- every input row appears in exactly one output group", () => {
    const rows = [
      row({ domain: "a.com", category: null }),
      row({ domain: "b.com", category: "news" }),
      row({ domain: "c.com", category: "qa_forum", pinned: true }),
      row({ domain: "d.com", category: "search_engine" }),
    ];

    const result = groupCompetitorRows(rows);

    expect(result.competitors.length + result.notCompetitors.length).toBe(
      rows.length,
    );
    const allDomains = [...result.competitors, ...result.notCompetitors].map(
      (r) => r.domain,
    );
    expect(new Set(allDomains)).toEqual(new Set(rows.map((r) => r.domain)));
  });

  /**
   * The acceptance test for this batch: the real AmericaVending.com
   * production run from the bug report, in the exact order it shipped
   * (ranked by beatsYouCount desc, ties by coverage desc -- see
   * rankSerpCompetitors.ts). youtube.com and vending.com beat the client on
   * more seed keywords than any genuine rival, so the raw ranking put them
   * first; the point of this batch is that the user never sees that.
   *
   * `vending.com` is deliberately left unclassified (category: null) here --
   * see classifyCompetitorDomain.ts's own list and the batch report for why
   * it was not added to the static list. That omission does not weaken this
   * test: the acceptance bar is specifically that vendingexchange.com ranks
   * above youtube.com, and it does, regardless of where vending.com lands.
   */
  it("acceptance: vendingexchange.com ranks above youtube.com once platforms are grouped out of the real AmericaVending.com run", () => {
    const productionRun: CompetitorRow[] = [
      row({ domain: "youtube.com", beatsYouCount: 6, category: "video" }),
      row({ domain: "vending.com", beatsYouCount: 6, category: null }),
      row({ domain: "facebook.com", beatsYouCount: 5, category: "social" }),
      row({ domain: "reddit.com", beatsYouCount: 4, category: "social" }),
      row({ domain: "vmfsusa.com", beatsYouCount: 4, category: null }),
      row({
        domain: "vendingexchange.com",
        beatsYouCount: 3,
        category: null,
      }),
      row({ domain: "canteen.com", beatsYouCount: 3, category: null }),
      row({ domain: "dfyvending.com", beatsYouCount: 3, category: null }),
      row({
        domain: "vendingconcepts.com",
        beatsYouCount: 2,
        category: null,
      }),
      row({
        domain: "yellowpages.com",
        beatsYouCount: 2,
        category: "directory",
      }),
      row({ domain: "amazon.com", beatsYouCount: 2, category: "marketplace" }),
      row({ domain: "afvusa.com", beatsYouCount: 2, category: null }),
      row({
        domain: "franchisedirect.com",
        beatsYouCount: 2,
        category: "directory",
      }),
    ];

    const result = groupCompetitorRows(productionRun);

    // Every platform/aggregator the task calls out lands in the demoted
    // group, none of the genuine vending-industry rivals do.
    expect(result.notCompetitors.map((r) => r.domain)).toEqual([
      "youtube.com",
      "facebook.com",
      "reddit.com",
      "yellowpages.com",
      "amazon.com",
      "franchisedirect.com",
    ]);
    expect(result.competitors.map((r) => r.domain)).toEqual([
      "vending.com",
      "vmfsusa.com",
      "vendingexchange.com",
      "canteen.com",
      "dfyvending.com",
      "vendingconcepts.com",
      "afvusa.com",
    ]);

    // The literal acceptance criterion: in the order these two groups would
    // render top-to-bottom (main table, then the collapsed group beneath
    // it), vendingexchange.com comes before youtube.com.
    const renderedOrder = [...result.competitors, ...result.notCompetitors].map(
      (r) => r.domain,
    );
    expect(renderedOrder.indexOf("vendingexchange.com")).toBeLessThan(
      renderedOrder.indexOf("youtube.com"),
    );
  });
});
