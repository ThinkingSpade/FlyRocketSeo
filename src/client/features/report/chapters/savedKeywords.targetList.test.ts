import { describe, expect, it, vi } from "vitest";

/**
 * Sibling of savedKeywords.test.ts, split out once that file crossed this
 * repo's `max-lines` cap -- same module under test, split at the one describe
 * block that needs none of that file's row/data/narrative fixtures.
 *
 * The mocks below are the same boundary stubs savedKeywords.test.ts uses: the
 * chapter module pulls in two server-function modules for its own read
 * (`exportSavedKeywords`) and for the profile behind the fit map, and loading
 * them here would drag the server's service layer -- and `cloudflare:workers`
 * with it -- into a plain node test.
 */
vi.mock("@/serverFunctions/keywords", () => ({
  exportSavedKeywords: vi.fn(),
}));
vi.mock("@/serverFunctions/projectProfile", () => ({
  autoDraftProjectProfile: vi.fn(),
  draftProjectProfile: vi.fn(),
  generateSeedKeywords: vi.fn(),
  getProjectProfile: vi.fn(),
  refineKeywordFit: vi.fn(),
  saveProjectProfile: vi.fn(),
}));

import { targetListSubtitle } from "./savedKeywords";

/**
 * Finding 1 (cap half) and the display cap: the table shows the top ten priced
 * rows under a hero that counts everything, so it has to say so.
 */
describe("targetListSubtitle", () => {
  it("says it is showing the top N of the priced rows", () => {
    const subtitle = targetListSubtitle(10, {
      saved: 200,
      priced: 42,
      scored: 42,
    });

    expect(subtitle).toBe(
      "The top 10 of 42 saved keywords with search volume, largest opportunity first.",
    );
  });

  it("says the table covers only the priced rows when nothing is cut", () => {
    expect(targetListSubtitle(3, { saved: 10, priced: 3, scored: 3 })).toBe(
      "All 3 saved keywords with search volume, largest opportunity first.",
    );
  });

  it("stays plain when the table really is the whole list", () => {
    expect(targetListSubtitle(3, { saved: 3, priced: 3, scored: 3 })).toBe(
      "The saved keywords we're working toward, largest opportunity first.",
    );
  });
});
