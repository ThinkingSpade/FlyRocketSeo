import { describe, expect, it } from "vitest";
import { canStartPaidRun } from "./canStartPaidRun";

describe("canStartPaidRun", () => {
  it("allows a run when there's a domain and nothing in flight", () => {
    expect(canStartPaidRun({ hasDomain: true, paidCallInFlight: false })).toBe(
      true,
    );
  });

  it("blocks without a project domain", () => {
    expect(canStartPaidRun({ hasDomain: false, paidCallInFlight: false })).toBe(
      false,
    );
  });

  it("blocks while a paid call is already in flight", () => {
    expect(canStartPaidRun({ hasDomain: true, paidCallInFlight: true })).toBe(
      false,
    );
  });

  it("blocks when both conditions fail", () => {
    expect(canStartPaidRun({ hasDomain: false, paidCallInFlight: true })).toBe(
      false,
    );
  });
});
