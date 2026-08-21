import { describe, expect, it } from "vitest";
import { describeGradingResult } from "@/client/features/expired-domains/gradingResultNotice";

describe("describeGradingResult", () => {
  it("reports claim failures before the attempted-zero success case", () => {
    expect(
      describeGradingResult({
        attempted: 0,
        graded: 0,
        failed: 2,
        remaining: 2,
        requests: 1,
        maxRequests: 3,
        stopReason: "stalled",
      }),
    ).toEqual({
      kind: "error",
      message: "Graded 0; 2 remain ungraded after 2 failed attempts.",
    });
  });

  it("reports an empty retryable queue as a success", () => {
    expect(
      describeGradingResult({
        attempted: 0,
        graded: 0,
        failed: 0,
        remaining: 0,
        requests: 0,
        maxRequests: 0,
        stopReason: "complete",
      }),
    ).toEqual({
      kind: "success",
      message: "No ungraded domains are currently retryable.",
    });
  });

  it("describes cancellation without presenting it as a failure", () => {
    expect(
      describeGradingResult({
        attempted: 8,
        graded: 6,
        failed: 2,
        remaining: 4,
        requests: 1,
        maxRequests: 6,
        stopReason: "cancelled",
      }),
    ).toEqual({
      kind: "info",
      message: "Grading stopped. Graded 6; 4 still ungraded.",
    });
  });
});
