import { describe, expect, it } from "vitest";
import { reapplyRestoredOverrides } from "./reapplyRestoredOverrides";
import type {
  CompetitorRow,
  CompetitorsPage,
} from "@/types/schemas/competitors";

// Deliberately does NOT mock "cloudflare:workers" or any server module: this
// test is itself the proof that reapplyRestoredOverrides (and the
// applyProjectCompetitors it wraps) has no runtime dependency that would make
// it unsafe to import into client code -- see this file's own doc comment
// for why that matters (CompetitorsTableColumns.tsx / competitorsCacheUpdaters.ts
// were split out for exactly this reason). If this import ever grew a real
// server dependency, this test would fail to even collect, not just fail an
// assertion.

const row = (domain: string, pinned = false): CompetitorRow => ({
  domain,
  avgPosition: 5,
  intersections: null,
  organicKeywords: 40,
  organicTraffic: 300,
  coverage: 0.6,
  beatsYouCount: 12,
  positionDelta: -3.1,
  source: "serp",
  pinned,
});

const page = (rows: CompetitorRow[]): CompetitorsPage => ({
  rows,
  totalCount: rows.length,
  fetchedAt: "2026-08-01T00:00:00.000Z",
  seedSize: 20,
  hiddenCount: 0,
  discoveryMode: "serp",
  seedTruncated: false,
});

const restoredRun = (rows: CompetitorRow[]) => ({
  result: page(rows),
  label: "americavending.com",
  lastRanAt: "2026-08-01T00:00:00.000Z",
  runCount: 2,
  params: null,
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

describe("reapplyRestoredOverrides", () => {
  it("returns null unchanged when there is nothing restored", () => {
    expect(reapplyRestoredOverrides(null, [])).toBeNull();
  });

  it("hides a domain the project excluded AFTER this run was recorded", () => {
    const restored = restoredRun([
      row("webstaurantstore.com"),
      row("kept.com"),
    ]);

    const result = reapplyRestoredOverrides(restored, [
      override("webstaurantstore.com", "excluded"),
    ]);

    const domains = result?.result.rows.map((r) => r.domain);
    expect(domains).not.toContain("webstaurantstore.com");
    expect(domains).toContain("kept.com");
    expect(result?.result.hiddenCount).toBe(1);
  });

  it("preserves the label/lastRanAt/runCount wrapper fields untouched", () => {
    const restored = restoredRun([row("kept.com")]);

    const result = reapplyRestoredOverrides(restored, []);

    expect(result?.label).toBe("americavending.com");
    expect(result?.lastRanAt).toBe("2026-08-01T00:00:00.000Z");
    expect(result?.runCount).toBe(2);
  });

  it("pins a domain the project pinned AFTER this run was recorded", () => {
    const restored = restoredRun([row("kept.com")]);

    const result = reapplyRestoredOverrides(restored, [
      override("newly-pinned.com", "pinned"),
    ]);

    const pinnedRow = result?.result.rows.find(
      (r) => r.domain === "newly-pinned.com",
    );
    expect(pinnedRow?.pinned).toBe(true);
    expect(pinnedRow?.beatsYouCount).toBeNull();
  });

  it("is a true no-op (same row set) when there are no overrides for this project", () => {
    const restored = restoredRun([row("a.com"), row("b.com")]);

    const result = reapplyRestoredOverrides(restored, []);

    expect(result?.result.rows.map((r) => r.domain)).toEqual([
      "a.com",
      "b.com",
    ]);
    expect(result?.result.hiddenCount).toBe(0);
  });
});
