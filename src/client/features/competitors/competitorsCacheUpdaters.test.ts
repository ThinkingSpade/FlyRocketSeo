import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  applyProjectCompetitorMutationSuccess,
  applyRemoveProjectCompetitorPatch,
  applySetProjectCompetitorPatch,
} from "./competitorsCacheUpdaters";
import { reapplyRestoredOverrides } from "./reapplyRestoredOverrides";
import {
  competitorsPageSchema,
  type CompetitorRow,
  type CompetitorsPage,
} from "@/types/schemas/competitors";
import type { ProjectCompetitorRow } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";

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
  seedTruncated: false,
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

const override = (
  domain: string,
  status: "pinned" | "excluded",
): ProjectCompetitorRow => ({
  id: `id-${domain}`,
  projectId: "project_1",
  domain,
  status,
  note: "",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
});

/** The query key `useAutoRestoredRun` builds for this project's restored
 *  competitors run when no specific past run is selected -- reproduced here
 *  (not imported; that hook exports no key-builder) so the test seeds the
 *  EXACT entry `useRestoredCompetitorsRun` reads. */
function restoredRunKey(projectId: string) {
  return ["analysisRun", "latest", projectId, "competitors"] as const;
}

/** Shape of that entry, matching `RestoreOutcome`'s "ready" case
 *  (`analysisRuns.ts`). */
function restoredRunEntry(competitorsPage: CompetitorsPage) {
  return {
    status: "ready" as const,
    run: {
      label: "example.com",
      paramsJson: "{}",
      resultJson: JSON.stringify(competitorsPage),
      lastRanAt: "2026-08-10T00:00:00.000Z",
      runCount: 1,
    },
  };
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

describe("applyProjectCompetitorMutationSuccess", () => {
  it("does not touch the restored-run cache entry -- only the overrides list and the live competitors-list pages", () => {
    // Regression test for the collision a whole-branch review caught:
    // reapplyRestoredOverrides requires restored.result to stay PRISTINE
    // (see that function's own doc comment), so nothing here may write to
    // the entry useRestoredCompetitorsRun reads it from.
    const queryClient = new QueryClient();
    const projectId = "project_1";
    const restoredEntry = restoredRunEntry(
      page([row("webstaurantstore.com"), row("kept.com")], { hiddenCount: 0 }),
    );
    queryClient.setQueryData(restoredRunKey(projectId), restoredEntry);

    applyProjectCompetitorMutationSuccess(
      queryClient,
      projectId,
      [override("webstaurantstore.com", "excluded")],
      (p) =>
        applySetProjectCompetitorPatch(p, {
          domain: "webstaurantstore.com",
          status: "excluded",
        }),
    );

    // Same reference, not just an equal value: proves nothing wrote to this
    // key at all, not merely that it wrote back the same content.
    expect(queryClient.getQueryData(restoredRunKey(projectId))).toBe(
      restoredEntry,
    );
  });

  it("restore -> exclude -> re-render: the domain is gone from rows AND hiddenCount reads 1, not 0", () => {
    const queryClient = new QueryClient();
    const projectId = "project_1";
    const pristinePage = page([row("webstaurantstore.com"), row("kept.com")], {
      hiddenCount: 0,
    });
    queryClient.setQueryData(
      restoredRunKey(projectId),
      restoredRunEntry(pristinePage),
    );
    queryClient.setQueryData(["project-competitors", projectId], []);

    // The mutation succeeds -- exactly what useSetProjectCompetitorMutation's
    // onSuccess does.
    applyProjectCompetitorMutationSuccess(
      queryClient,
      projectId,
      [override("webstaurantstore.com", "excluded")],
      (p) =>
        applySetProjectCompetitorPatch(p, {
          domain: "webstaurantstore.com",
          status: "excluded",
        }),
    );

    // What useRestoredCompetitorsRun computes on the very next render:
    // `restored` read straight off the restored-run entry, `overrides` read
    // off the project-competitors entry -- the exact two reads that hook
    // makes, composed the same way reapplyRestoredOverrides is. Parsed
    // through the schema, not a raw cast, matching what useAutoRestoredRun
    // itself does to a stored payload.
    const entry = queryClient.getQueryData<ReturnType<typeof restoredRunEntry>>(
      restoredRunKey(projectId),
    );
    const restoredResult = competitorsPageSchema.parse(
      JSON.parse(entry?.run.resultJson ?? "null"),
    );
    const currentOverrides =
      queryClient.getQueryData<ProjectCompetitorRow[]>([
        "project-competitors",
        projectId,
      ]) ?? [];
    const result = reapplyRestoredOverrides(
      {
        result: restoredResult,
        label: entry?.run.label ?? "",
        lastRanAt: entry?.run.lastRanAt ?? "",
        runCount: entry?.run.runCount ?? 0,
        params: null,
      },
      currentOverrides,
    );

    const domains = result?.result.rows.map((r) => r.domain);
    expect(domains).not.toContain("webstaurantstore.com");
    expect(domains).toContain("kept.com");
    expect(result?.result.hiddenCount).toBe(1);
  });
});
