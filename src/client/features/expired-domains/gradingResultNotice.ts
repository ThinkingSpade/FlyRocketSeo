import type { VisibleGradingResult } from "@/client/features/expired-domains/gradeVisibleDomains";

type GradingResultNotice = {
  kind: "error" | "info" | "success";
  message: string;
};

export function describeGradingResult(
  result: VisibleGradingResult,
): GradingResultNotice {
  if (result.stopReason === "cancelled") {
    return {
      kind: "info",
      message: `Grading stopped. Graded ${result.graded}; ${result.remaining} still ungraded.`,
    };
  }
  if (result.remaining > 0) {
    const failedSuffix =
      result.failed > 0
        ? ` after ${result.failed} failed attempt${result.failed === 1 ? "" : "s"}`
        : "";
    return {
      kind: "error",
      message: `Graded ${result.graded}; ${result.remaining} remain ungraded${failedSuffix}.`,
    };
  }
  if (result.attempted === 0) {
    return {
      kind: "success",
      message: "No ungraded domains are currently retryable.",
    };
  }
  return {
    kind: "success",
    message: `Graded ${result.graded} domain ratings.`,
  };
}
