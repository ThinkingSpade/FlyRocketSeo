import { describe, expect, it } from "vitest";
import { pickAdoptedRestore } from "./pickAdoptedRestore";
import type { CompetitorRow } from "@/types/schemas/competitors";

const row = (domain: string): CompetitorRow => ({
  domain,
  avgPosition: 5,
  intersections: null,
  organicKeywords: 100,
  organicTraffic: 200,
  coverage: 0.5,
  beatsYouCount: 3,
  positionDelta: -1.2,
  source: "serp",
  pinned: false,
});

const restored = (label: string, rows: CompetitorRow[]) => ({
  label,
  lastRanAt: "2026-08-10T00:00:00.000Z",
  runCount: 3,
  result: { rows },
});

describe("pickAdoptedRestore", () => {
  it("adopts a restored run on page 1 when there is no live data and the target matches", () => {
    const result = pickAdoptedRestore(
      undefined,
      restored("americavending.com", [row("rival.com")]),
      "americavending.com",
      1,
    );

    expect(result.restoredRun).not.toBeNull();
    expect(result.competitorRows.map((r) => r.domain)).toEqual(["rival.com"]);
  });

  it("refuses to adopt a restored run on page 2 -- only page 1 is ever recorded", () => {
    const result = pickAdoptedRestore(
      undefined,
      restored("americavending.com", [row("rival.com")]),
      "americavending.com",
      2,
    );

    expect(result.restoredRun).toBeNull();
    expect(result.competitorRows).toEqual([]);
  });

  it("prefers live rows over a restored run, even on page 1", () => {
    const result = pickAdoptedRestore(
      [row("live-rival.com")],
      restored("americavending.com", [row("restored-rival.com")]),
      "americavending.com",
      1,
    );

    expect(result.restoredRun).toBeNull();
    expect(result.competitorRows.map((r) => r.domain)).toEqual([
      "live-rival.com",
    ]);
  });

  it("prefers live rows over a restored run on page 2 as well", () => {
    const result = pickAdoptedRestore(
      [row("live-rival.com")],
      restored("americavending.com", [row("restored-rival.com")]),
      "americavending.com",
      2,
    );

    expect(result.restoredRun).toBeNull();
    expect(result.competitorRows.map((r) => r.domain)).toEqual([
      "live-rival.com",
    ]);
  });

  it("refuses a restored run belonging to a different client's domain", () => {
    const result = pickAdoptedRestore(
      undefined,
      restored("americavending.com", [row("rival.com")]),
      "deliotx.com",
      1,
    );

    expect(result.restoredRun).toBeNull();
    expect(result.competitorRows).toEqual([]);
  });

  it("returns an empty row list when there is nothing live and nothing adoptable", () => {
    const result = pickAdoptedRestore(undefined, null, "deliotx.com", 1);

    expect(result.restoredRun).toBeNull();
    expect(result.competitorRows).toEqual([]);
  });

  it("adopts the last run when no target is set yet, still only on page 1", () => {
    const adoptedPage1 = pickAdoptedRestore(
      undefined,
      restored("americavending.com", [row("rival.com")]),
      "",
      1,
    );
    const refusedPage2 = pickAdoptedRestore(
      undefined,
      restored("americavending.com", [row("rival.com")]),
      "",
      2,
    );

    expect(adoptedPage1.restoredRun).not.toBeNull();
    expect(refusedPage2.restoredRun).toBeNull();
  });
});
