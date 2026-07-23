import { describe, expect, it } from "vitest";
import { keywordResearchResultSchema } from "./keywords";

/**
 * This schema validates payloads read back from storage, not just freshly
 * written ones, and `useAutoRestoredRun` drops the WHOLE payload when a parse
 * fails — rows included — leaving the tab blank with nothing logged. So every
 * field added here has to be optional for as long as runs stored without it
 * still exist, which for `analysis_runs` is forever.
 */

const legacyRun = {
  rows: [],
  source: "related",
  usedFallback: false,
  diagnostics: {
    requestedMode: "auto",
    threshold: 5,
    // Stored before relevantCount existed.
    sourceAttempts: [{ source: "related", rowCount: 46, nonSeedCount: 45 }],
  },
};

describe("keywordResearchResultSchema", () => {
  it("still parses a run stored before relevantCount existed", () => {
    const parsed = keywordResearchResultSchema.safeParse(legacyRun);
    expect(parsed.success).toBe(true);
  });

  it("parses a current run that records relevantCount", () => {
    const parsed = keywordResearchResultSchema.safeParse({
      ...legacyRun,
      diagnostics: {
        ...legacyRun.diagnostics,
        sourceAttempts: [
          {
            source: "related",
            rowCount: 46,
            nonSeedCount: 45,
            relevantCount: 0,
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.diagnostics.sourceAttempts[0].relevantCount).toBe(0);
  });

  it("still rejects a payload missing a field that was never optional", () => {
    const parsed = keywordResearchResultSchema.safeParse({
      ...legacyRun,
      diagnostics: {
        ...legacyRun.diagnostics,
        sourceAttempts: [{ source: "related", rowCount: 46 }],
      },
    });
    expect(parsed.success).toBe(false);
  });
});
