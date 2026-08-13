import { describe, expect, it } from "vitest";
import {
  aiRewriteHint,
  aiRewriteLabel,
  aiRewriteResultMessage,
  aiRewriteSelection,
} from "./aiRewrite";
import type { FixRow } from "./onPageModel";
import { MAX_AI_REWRITE_PER_CLICK } from "@/shared/onpage-limits";

function fix(overrides: Partial<FixRow> = {}): FixRow {
  return {
    id: "1",
    url: "https://x.com/a",
    element: "title",
    target: "",
    currentValue: "Old",
    suggestedValue: "New",
    reason: "because",
    source: "rules",
    status: "pending",
    ...overrides,
  };
}

/** A backlog of `count` pending title/meta rows, alternating element. */
function pendingRewritable(
  count: number,
  overrides: Partial<FixRow> = {},
): FixRow[] {
  return Array.from({ length: count }, (_, index) =>
    fix({
      id: `r${index}`,
      url: `https://x.com/p${index}`,
      element: index % 2 === 0 ? "title" : "meta",
      status: "pending",
      ...overrides,
    }),
  );
}

describe("aiRewriteSelection", () => {
  it("never sends more ids than the server accepts", () => {
    const selection = aiRewriteSelection(pendingRewritable(92));
    expect(selection.ids).toHaveLength(MAX_AI_REWRITE_PER_CLICK);
    expect(new Set(selection.ids).size).toBe(MAX_AI_REWRITE_PER_CLICK);
    expect(selection.eligible).toBe(92);
    expect(selection.remaining).toBe(92 - MAX_AI_REWRITE_PER_CLICK);
  });

  it("sends the whole backlog when it fits inside one call", () => {
    const selection = aiRewriteSelection(pendingRewritable(10));
    expect(selection.ids).toHaveLength(10);
    expect(selection.eligible).toBe(10);
    expect(selection.remaining).toBe(0);
  });

  it("is exactly full at the limit and batches one row past it", () => {
    const full = aiRewriteSelection(
      pendingRewritable(MAX_AI_REWRITE_PER_CLICK),
    );
    expect(full.ids).toHaveLength(MAX_AI_REWRITE_PER_CLICK);
    expect(full.remaining).toBe(0);

    const over = aiRewriteSelection(
      pendingRewritable(MAX_AI_REWRITE_PER_CLICK + 1),
    );
    expect(over.ids).toHaveLength(MAX_AI_REWRITE_PER_CLICK);
    expect(over.remaining).toBe(1);
  });

  it("selects only pending title/meta rows", () => {
    const selection = aiRewriteSelection([
      fix({ id: "t", element: "title", status: "pending" }),
      fix({ id: "m", element: "meta", status: "pending" }),
      fix({ id: "h", element: "h1", status: "pending" }),
      fix({ id: "a", element: "alt", status: "pending" }),
      fix({ id: "done", element: "title", status: "approved" }),
      fix({ id: "no", element: "meta", status: "excluded" }),
    ]);
    expect(selection.ids.toSorted()).toEqual(["m", "t"]);
    expect(selection.eligible).toBe(2);
  });

  it("works through the backlog rather than re-sending what it just rewrote", () => {
    // A rewrite leaves the row pending and only flips `source` to "ai", so
    // without this ordering the second click would spend credits rewriting the
    // same rows and the rest of the backlog would never be reachable.
    const rows = [
      ...pendingRewritable(MAX_AI_REWRITE_PER_CLICK, { source: "ai" }),
      fix({ id: "fresh-1", element: "title", status: "pending" }),
      fix({ id: "fresh-2", element: "meta", status: "pending" }),
    ];
    const selection = aiRewriteSelection(rows);
    expect(selection.ids.slice(0, 2)).toEqual(["fresh-1", "fresh-2"]);
    expect(selection.eligible).toBe(MAX_AI_REWRITE_PER_CLICK + 2);
    expect(selection.remaining).toBe(2);
  });
});

describe("AI rewrite copy", () => {
  it("labels the batch it will send, not a total it cannot deliver", () => {
    const label = aiRewriteLabel(aiRewriteSelection(pendingRewritable(92)));
    expect(label).toBe(`AI rewrite ${MAX_AI_REWRITE_PER_CLICK} of 92`);
    // The old label promised all 92 for one metered click.
    expect(label).not.toBe("AI rewrite (92)");
  });

  it("keeps the plain count when one click covers everything", () => {
    expect(aiRewriteLabel(aiRewriteSelection(pendingRewritable(12)))).toBe(
      "AI rewrite (12)",
    );
  });

  it("says how much of the spend one click covers before it is pressed", () => {
    const hint = aiRewriteHint(aiRewriteSelection(pendingRewritable(92)));
    expect(hint).toContain(`${MAX_AI_REWRITE_PER_CLICK} of the 92`);
    expect(hint).toMatch(/run it again/i);
  });

  it("reports a partial run as partial, naming what is still waiting", () => {
    const message = aiRewriteResultMessage(
      MAX_AI_REWRITE_PER_CLICK,
      aiRewriteSelection(pendingRewritable(92)),
    );
    expect(message).toContain(
      `Rewrote ${MAX_AI_REWRITE_PER_CLICK} suggestions`,
    );
    expect(message).toContain(`${92 - MAX_AI_REWRITE_PER_CLICK} pending`);
    expect(message).toMatch(/run AI rewrite again/i);
  });

  it("reports a complete run without inventing leftovers", () => {
    expect(
      aiRewriteResultMessage(12, aiRewriteSelection(pendingRewritable(12))),
    ).toBe("Rewrote 12 suggestions with AI.");
  });
});
