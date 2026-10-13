import { describe, expect, it } from "vitest";
import { domainPaginationRange } from "./domainPaginationRange";

describe("pagination describes returned rows, not an assumed full page", () => {
  it("reports a partial page when the provider total is unknown", () => {
    expect(domainPaginationRange(2, 50, null, 7)).toBe(
      "51–57 · total unavailable",
    );
  });
  it("does not invent a range for an empty page", () => {
    expect(domainPaginationRange(2, 50, null, 0)).toBe(
      "0 results on this page · total unavailable",
    );
  });
  it("uses the returned row count even when a larger total is known", () => {
    expect(domainPaginationRange(1, 50, 100, 7)).toBe("1–7 of 100");
  });
  it("keeps an out-of-range page readable", () => {
    expect(domainPaginationRange(3, 50, 60, 0)).toBe(
      "0 results on this page · 60 total",
    );
  });
  it("distinguishes a genuinely empty dataset", () => {
    expect(domainPaginationRange(1, 50, 0, 0)).toBe("0 results");
  });
});
