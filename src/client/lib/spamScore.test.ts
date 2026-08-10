import { describe, expect, it } from "vitest";
import { describeSpamScore } from "./spamScore";

describe("describeSpamScore", () => {
  // The tier boundaries are the point of this table: the page used to apply
  // 30, 40 and 60 in different places, so one number could earn two verdicts.
  it.each([
    { value: 0, tier: "low", label: "Low signal" },
    { value: 29, tier: "low", label: "Low signal" },
    { value: 30, tier: "review", label: "Worth reviewing" },
    { value: 59, tier: "review", label: "Worth reviewing" },
    { value: 60, tier: "high", label: "High-risk signal" },
    { value: 100, tier: "high", label: "High-risk signal" },
  ] as const)("describes $value as $label", ({ value, tier, label }) => {
    expect(describeSpamScore(value)).toMatchObject({
      formatted: String(value),
      tier,
      label,
    });
  });

  it("treats a missing score as unavailable", () => {
    expect(describeSpamScore(null)).toMatchObject({
      formatted: "—",
      tier: "unavailable",
      label: "Not available",
      tone: "neutral",
      reviewRecommended: false,
    });
  });

  it("preserves a measured zero as 0", () => {
    const formatted = describeSpamScore(0).formatted;
    expect(formatted).toBe("0");
    expect(formatted).not.toBe("—");
    expect(formatted).not.toBe("");
  });

  it("tiers decimal scores before rounding them for display", () => {
    expect(describeSpamScore(29.5)).toMatchObject({
      formatted: "30",
      tier: "low",
      label: "Low signal",
    });
    expect(describeSpamScore(59.5)).toMatchObject({
      formatted: "60",
      tier: "review",
      label: "Worth reviewing",
    });
  });

  it.each([
    [29, false, null],
    [30, true, "Review referring domains before taking action."],
    [59, true, "Review referring domains before taking action."],
    [60, true, "Review referring domains before taking action."],
  ] as const)(
    "sets review guidance consistently at %i",
    (value, reviewRecommended, guidance) => {
      expect(describeSpamScore(value)).toMatchObject({
        reviewRecommended,
        guidance,
      });
    },
  );
});
