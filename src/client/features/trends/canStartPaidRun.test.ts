import { describe, expect, it } from "vitest";
import { canStartPaidRun } from "./canStartPaidRun";

const ready = { hasCredits: true, scopeReady: true, restoreFailed: false };

describe("canStartPaidRun", () => {
  it("allows a run when there's a domain and nothing in flight", () => {
    expect(
      canStartPaidRun({ ...ready, hasDomain: true, paidCallInFlight: false }),
    ).toBe(true);
  });

  it("blocks without a project domain", () => {
    expect(
      canStartPaidRun({ ...ready, hasDomain: false, paidCallInFlight: false }),
    ).toBe(false);
  });

  it("blocks while a paid call is already in flight", () => {
    expect(
      canStartPaidRun({ ...ready, hasDomain: true, paidCallInFlight: true }),
    ).toBe(false);
  });

  it("blocks when both conditions fail", () => {
    expect(
      canStartPaidRun({ ...ready, hasDomain: false, paidCallInFlight: true }),
    ).toBe(false);
  });
  it.each([
    { hasCredits: false },
    { scopeReady: false },
    { restoreFailed: true },
  ])(
    "refuses a manual request while a prerequisite is unavailable: %s",
    (unavailable) => {
      expect(
        canStartPaidRun({
          ...ready,
          hasDomain: true,
          paidCallInFlight: false,
          ...unavailable,
        }),
      ).toBe(false);
    },
  );
});
