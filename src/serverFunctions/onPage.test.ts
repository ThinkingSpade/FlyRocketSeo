import { describe, expect, it, vi } from "vitest";
import { aiRewriteSelection } from "@/client/features/onpage/aiRewrite";
import type { FixRow } from "@/client/features/onpage/onPageModel";
import { MAX_AI_REWRITE_PER_CLICK } from "@/shared/onpage-limits";

// The module graph behind these server functions reaches for the Workers
// runtime on import; only the input schema is under test here.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { rewriteSchema } from "@/serverFunctions/onPage";

/** `count` arbitrary suggestion ids, to probe the schema's own bound. */
function ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `fix_${index}`);
}

/** A backlog of pending title/meta rows — the rows the AI rewrite button
 *  offers to rewrite. */
function backlog(count: number): FixRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `fix_${index}`,
    url: `https://example.com/p${index}`,
    element: index % 2 === 0 ? "title" : "meta",
    target: "",
    currentValue: null,
    suggestedValue: "A rule-based draft",
    reason: "because",
    source: "rules",
    status: "pending",
  }));
}

describe("rewriteOnPageFixes input bound", () => {
  it("accepts exactly what the button sends on a backlog it cannot cover", () => {
    // The regression: the button sent every pending id, the validator rejected
    // anything past the limit, and so the metered action failed on every click
    // for any project with more pending rows than one call can take.
    const selection = aiRewriteSelection(backlog(92));

    expect(
      rewriteSchema.safeParse({ projectId: "proj_1", ids: selection.ids })
        .success,
    ).toBe(true);
  });

  it("still refuses an uncapped selection", () => {
    const everyId = backlog(92).map((row) => row.id);

    expect(
      rewriteSchema.safeParse({ projectId: "proj_1", ids: everyId }).success,
    ).toBe(false);
  });

  it("draws the line at the shared limit, on both sides", () => {
    expect(
      rewriteSchema.safeParse({
        projectId: "proj_1",
        ids: ids(MAX_AI_REWRITE_PER_CLICK),
      }).success,
    ).toBe(true);
    expect(
      rewriteSchema.safeParse({
        projectId: "proj_1",
        ids: ids(MAX_AI_REWRITE_PER_CLICK + 1),
      }).success,
    ).toBe(false);
  });

  it("still requires at least one id", () => {
    expect(
      rewriteSchema.safeParse({ projectId: "proj_1", ids: [] }).success,
    ).toBe(false);
  });
});
