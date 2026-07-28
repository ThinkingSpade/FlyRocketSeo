import { describe, expect, it } from "vitest";
import type { GbpCheck, GbpCheckStatus } from "./gbpAudit";
import {
  CHECK_STATUS_TONE,
  orderChecksForDisplay,
  scoreBasisHint,
  scoreTone,
} from "./gbpAuditDisplay";

function check(key: string, status: GbpCheckStatus, weight: number): GbpCheck {
  return { key, label: key, status, detail: "", fix: null, weight };
}

describe("orderChecksForDisplay", () => {
  it("moves an unknown check to the end even when it outweighs every known check", () => {
    const checks = [
      check("claimed", "unknown", 100), // highest weight of any check, but unknown
      check("category", "fail", 90),
      check("phone", "pass", 80),
    ];
    expect(orderChecksForDisplay(checks).map((c) => c.key)).toEqual([
      "category",
      "phone",
      "claimed",
    ]);
  });

  it("preserves each group's existing relative order", () => {
    const checks = [
      check("a", "pass", 90),
      check("b", "unknown", 100),
      check("c", "warn", 80),
      check("d", "unknown", 70),
    ];
    expect(orderChecksForDisplay(checks).map((c) => c.key)).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
  });

  it("returns an empty list unchanged", () => {
    expect(orderChecksForDisplay([])).toEqual([]);
  });

  it("leaves an all-known list in its original order", () => {
    const checks = [check("a", "pass", 90), check("b", "fail", 50)];
    expect(orderChecksForDisplay(checks)).toEqual(checks);
  });

  it("leaves an all-unknown list in its original order", () => {
    const checks = [check("a", "unknown", 90), check("b", "unknown", 50)];
    expect(orderChecksForDisplay(checks)).toEqual(checks);
  });
});

describe("CHECK_STATUS_TONE", () => {
  it("maps every status to the app's existing tone convention", () => {
    expect(CHECK_STATUS_TONE).toEqual({
      pass: "success",
      warn: "warning",
      fail: "error",
      unknown: "neutral",
    });
  });
});

describe("scoreTone", () => {
  it("is neutral when the score is null, matching the em dash it's paired with", () => {
    expect(scoreTone(null)).toBe("neutral");
  });

  it("is success at and above the success threshold", () => {
    expect(scoreTone(80)).toBe("success");
    expect(scoreTone(100)).toBe("success");
  });

  it("is warning between the warning and success thresholds", () => {
    expect(scoreTone(79)).toBe("warning");
    expect(scoreTone(50)).toBe("warning");
  });

  it("is error below the warning threshold", () => {
    expect(scoreTone(49)).toBe("error");
    expect(scoreTone(0)).toBe("error");
  });
});

describe("scoreBasisHint", () => {
  it("names the fraction when some checks are unknown", () => {
    const checks = [
      check("claimed", "pass", 100),
      check("category", "unknown", 90),
      check("phone", "fail", 80),
      check("website", "unknown", 45),
    ];
    expect(scoreBasisHint(checks)).toBe("2 of 4 checks evaluated");
  });

  it("says nothing when every check was evaluable, rather than '10 of 10'", () => {
    const checks = [
      check("claimed", "pass", 100),
      check("category", "fail", 90),
      check("phone", "warn", 80),
    ];
    expect(scoreBasisHint(checks)).toBeUndefined();
  });

  it("says nothing for a single-check, fully-evaluable list", () => {
    expect(scoreBasisHint([check("claimed", "pass", 100)])).toBeUndefined();
  });

  it("still names the fraction when only one check out of many is unknown", () => {
    const checks = [
      check("a", "pass", 90),
      check("b", "pass", 80),
      check("c", "unknown", 70),
    ];
    expect(scoreBasisHint(checks)).toBe("2 of 3 checks evaluated");
  });
});
