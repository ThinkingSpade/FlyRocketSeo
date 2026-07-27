import { describe, expect, it } from "vitest";
import {
  buildExplainPrompt,
  EXPLAIN_SYSTEM_PROMPT,
  MAX_EXPLAIN_ACTIONS,
} from "./explainPrompt";

describe("buildExplainPrompt", () => {
  it("includes the tab, the read, and every action's label and evidence", () => {
    const prompt = buildExplainPrompt({
      tab: "SERP Overview",
      read: "3 of 10 tracked keywords rank in the top 3.",
      actions: [
        {
          label: "Rewrite the title on /coffee-water",
          evidence: "1,240 impressions at 0.4% CTR",
        },
      ],
    });

    expect(prompt).toContain("Tab: SERP Overview");
    expect(prompt).toContain(
      "Finding: 3 of 10 tracked keywords rank in the top 3.",
    );
    expect(prompt).toContain(
      "- Rewrite the title on /coffee-water (because: 1,240 impressions at 0.4% CTR)",
    );
  });

  it("never includes more than MAX_EXPLAIN_ACTIONS actions, even given more", () => {
    const actions = Array.from({ length: MAX_EXPLAIN_ACTIONS + 3 }, (_, i) => ({
      label: `Action ${i}`,
      evidence: `Evidence ${i}`,
    }));

    const prompt = buildExplainPrompt({
      tab: "Backlinks",
      read: "read",
      actions,
    });
    const actionLines = prompt
      .split("\n")
      .filter((line) => line.startsWith("- Action"));

    expect(actionLines).toHaveLength(MAX_EXPLAIN_ACTIONS);
    expect(prompt).not.toContain(`Action ${MAX_EXPLAIN_ACTIONS}`);
  });

  it("produces no output at all when there are no actions", () => {
    const prompt = buildExplainPrompt({
      tab: "Domain Overview",
      read: "read",
      actions: [],
    });

    expect(prompt).toBe(
      ["Tab: Domain Overview", "Finding: read", "Recommended actions:"].join(
        "\n",
      ),
    );
  });
});

describe("EXPLAIN_SYSTEM_PROMPT", () => {
  it("forbids introducing any figure not present in the input", () => {
    // This is the whole safety property of the feature -- the model has no
    // other numbers to draw on, but only if the instruction is explicit and
    // not softened into a vague "be accurate" plea.
    expect(EXPLAIN_SYSTEM_PROMPT).toMatch(
      /never introduce a figure, percentage, or ranking/i,
    );
    expect(EXPLAIN_SYSTEM_PROMPT).toMatch(/only the numbers given to you/i);
  });
});
