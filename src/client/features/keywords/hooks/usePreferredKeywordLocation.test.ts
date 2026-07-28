import { describe, expect, it } from "vitest";
import { resolvePreferredLocationCode } from "./usePreferredKeywordLocation";

describe("resolvePreferredLocationCode", () => {
  it("keeps the saved preference even when the project market differs", () => {
    // A saved preference is an explicit user choice -- it must win over the
    // project's own configured market, not just over the bare US constant.
    expect(resolvePreferredLocationCode(2826, 2840)).toBe(2826);
  });

  it("falls back to the project's market when nothing is saved", () => {
    expect(resolvePreferredLocationCode(null, 2276)).toBe(2276);
  });

  it("falls back to the US constant when neither a preference nor a project market is known", () => {
    expect(resolvePreferredLocationCode(null, 2840)).toBe(2840);
  });
});
