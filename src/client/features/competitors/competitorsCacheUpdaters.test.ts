import { describe, expect, it } from "vitest";
import {
  applyRemoveProjectCompetitorPatch,
  applySetProjectCompetitorPatch,
} from "./competitorsCacheUpdaters";
import type {
  CompetitorRow,
  CompetitorsPage,
} from "@/types/schemas/competitors";

const row = (domain: string, pinned = false): CompetitorRow => ({
  domain,
  avgPosition: 5,
  intersections: null,
  organicKeywords: 100,
  organicTraffic: 200,
  coverage: 0.5,
  beatsYouCount: 3,
  positionDelta: -1.2,
  source: "serp",
  pinned,
});

const page = (
  rows: CompetitorRow[],
  overrides: Partial<CompetitorsPage> = {},
): CompetitorsPage => ({
  rows,
  totalCount: 42,
  fetchedAt: "2026-08-10T00:00:00.000Z",
  seedSize: 20,
  hiddenCount: 2,
  discoveryMode: "serp",
  ...overrides,
});

/** Asserts every field a patch does not own is byte-for-byte unchanged. */
function expectUnrelatedFieldsPreserved(
  result: CompetitorsPage,
  input: CompetitorsPage,
) {
  expect(result.totalCount).toBe(input.totalCount);
  expect(result.fetchedAt).toBe(input.fetchedAt);
  expect(result.seedSize).toBe(input.seedSize);
  expect(result.discoveryMode).toBe(input.discoveryMode);
}

describe("applySetProjectCompetitorPatch", () => {
  describe('status: "pinned"', () => {
    it("marks only the named row pinned, leaving the others untouched", () => {
      const input = page([row("a.com"), row("b.com"), row("c.com")]);

      const result = applySetProjectCompetitorPatch(input, {
        domain: "b.com",
        status: "pinned",
      });

      expect(result.rows.map((r) => [r.domain, r.pinned])).toEqual([
        ["a.com", false],
        ["b.com", true],
        ["c.com", false],
      ]);
    });

    it("preserves totalCount/fetchedAt/seedSize/discoveryMode/hiddenCount unchanged", () => {
      const input = page([row("a.com")], { hiddenCount: 7 });

      const result = applySetProjectCompetitorPatch(input, {
        domain: "a.com",
        status: "pinned",
      });

      expectUnrelatedFieldsPreserved(result, input);
      expect(result.hiddenCount).toBe(7);
    });
  });

  describe('status: "excluded"', () => {
    it("removes the named row AND increments hiddenCount by exactly the number removed", () => {
      // Deliberately asserts both facts in one test: a patch that removes
      // the row but forgets to bump hiddenCount (or vice versa) must fail
      // this test -- that's the exact bug class decision 8 exists to catch.
      const input = page([row("a.com"), row("b.com"), row("c.com")], {
        hiddenCount: 2,
      });

      const result = applySetProjectCompetitorPatch(input, {
        domain: "b.com",
        status: "excluded",
      });

      expect(result.rows.map((r) => r.domain)).toEqual(["a.com", "c.com"]);
      expect(result.hiddenCount).toBe(3);
    });

    it("is a true no-op (same reference) when the domain is not on this cached page", () => {
      const input = page([row("a.com")], { hiddenCount: 2 });

      const result = applySetProjectCompetitorPatch(input, {
        domain: "not-on-this-page.com",
        status: "excluded",
      });

      expect(result).toBe(input);
      expect(result.hiddenCount).toBe(2);
    });

    it("preserves totalCount/fetchedAt/seedSize/discoveryMode unchanged", () => {
      const input = page([row("a.com"), row("b.com")], { hiddenCount: 0 });

      const result = applySetProjectCompetitorPatch(input, {
        domain: "a.com",
        status: "excluded",
      });

      expectUnrelatedFieldsPreserved(result, input);
    });
  });
});

describe("applyRemoveProjectCompetitorPatch", () => {
  describe('reason: "unpin"', () => {
    it("unsets pinned on only the named row, leaving the others untouched", () => {
      const input = page([row("a.com", true), row("b.com", true)]);

      const result = applyRemoveProjectCompetitorPatch(input, {
        domain: "a.com",
        reason: "unpin",
      });

      expect(result.rows.map((r) => [r.domain, r.pinned])).toEqual([
        ["a.com", false],
        ["b.com", true],
      ]);
    });

    it("preserves totalCount/fetchedAt/seedSize/discoveryMode/hiddenCount unchanged", () => {
      const input = page([row("a.com", true)], { hiddenCount: 5 });

      const result = applyRemoveProjectCompetitorPatch(input, {
        domain: "a.com",
        reason: "unpin",
      });

      expectUnrelatedFieldsPreserved(result, input);
      expect(result.hiddenCount).toBe(5);
    });
  });

  describe('reason: "unhide"', () => {
    it("decrements hiddenCount by exactly one and leaves rows untouched", () => {
      // The unhidden domain was never a visible row (excluded rows are
      // filtered server-side before the client ever sees them), so `rows`
      // must be unaffected -- only the count changes.
      const input = page([row("a.com")], { hiddenCount: 3 });

      const result = applyRemoveProjectCompetitorPatch(input, {
        domain: "was-excluded.com",
        reason: "unhide",
      });

      expect(result.hiddenCount).toBe(2);
      expect(result.rows).toEqual(input.rows);
    });

    it("floors at 0 rather than going negative", () => {
      const input = page([row("a.com")], { hiddenCount: 0 });

      const result = applyRemoveProjectCompetitorPatch(input, {
        domain: "was-excluded.com",
        reason: "unhide",
      });

      expect(result.hiddenCount).toBe(0);
    });

    it("preserves totalCount/fetchedAt/seedSize/discoveryMode unchanged", () => {
      const input = page([row("a.com")], { hiddenCount: 3 });

      const result = applyRemoveProjectCompetitorPatch(input, {
        domain: "was-excluded.com",
        reason: "unhide",
      });

      expectUnrelatedFieldsPreserved(result, input);
    });
  });
});
