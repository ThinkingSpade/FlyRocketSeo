import { describe, expect, it } from "vitest";
import { isErrorCode, shouldCaptureAppErrorCode } from "@/shared/error-codes";

describe("shouldCaptureAppErrorCode", () => {
  it.each([
    "UNAUTHENTICATED",
    "NOT_FOUND",
    "PAYMENT_REQUIRED",
    "VALIDATION_ERROR",
    "AUDIT_CAPACITY_REACHED",
    "AUDIT_PAGE_LIMIT_EXCEEDED",
    "AUDIT_ALREADY_RUNNING",
  ] as const)("skips expected %s errors", (code) => {
    expect(shouldCaptureAppErrorCode(code)).toBe(false);
  });

  it("captures unexpected errors and unknown failures", () => {
    expect(shouldCaptureAppErrorCode("INTERNAL_ERROR")).toBe(true);
    expect(shouldCaptureAppErrorCode(undefined)).toBe(true);
    // A depleted DataForSEO balance is a real platform problem on cloud — keep
    // the billing codes reportable, don't suppress them.
    expect(shouldCaptureAppErrorCode("BACKLINKS_BILLING_ISSUE")).toBe(true);
    expect(shouldCaptureAppErrorCode("AI_SEARCH_BILLING_ISSUE")).toBe(true);
    // Staged geo-seed data going missing mid-run is a genuine anomaly worth
    // knowing about operationally (e.g. a TTL that's too short in practice),
    // not an expected per-user state — keep it reportable too.
    expect(shouldCaptureAppErrorCode("GEO_SEED_DATA_LOST")).toBe(true);
  });
});

describe("APIVerve error codes", () => {
  it("registers all three codes", () => {
    expect(isErrorCode("APIVERVE_NOT_CONFIGURED")).toBe(true);
    expect(isErrorCode("APIVERVE_AUTH_FAILED")).toBe(true);
    expect(isErrorCode("APIVERVE_CREDITS_EXHAUSTED")).toBe(true);
  });

  it("does not page for operator configuration or a spent third-party quota", () => {
    expect(shouldCaptureAppErrorCode("APIVERVE_NOT_CONFIGURED")).toBe(false);
    expect(shouldCaptureAppErrorCode("APIVERVE_CREDITS_EXHAUSTED")).toBe(false);
  });

  // Same call as DATAFORSEO_AUTH_FAILED: a key that IS set and still gets
  // rejected is a real defect signal, not an expected per-user state.
  it("does page for a key that is set but rejected", () => {
    expect(shouldCaptureAppErrorCode("APIVERVE_AUTH_FAILED")).toBe(true);
  });
});
