import {
  MAX_DOMAIN_RATING_ATTEMPTS,
  MAX_DOMAIN_RATING_LOOKUPS,
} from "@/shared/workerQueryBudget";

type GradingBatchResult = {
  attempted: number;
  graded: number;
  failed: number;
  /** All ungraded rows remaining inside this request's domain scope. */
  remaining: number;
};

export type VisibleGradingStopReason =
  | "complete"
  | "attempt-cap"
  | "stalled"
  | "cancelled";

export type VisibleGradingResult = {
  attempted: number;
  graded: number;
  failed: number;
  remaining: number;
  requests: number;
  maxRequests: number;
  stopReason: VisibleGradingStopReason;
};

export type VisibleGradingProgress = Omit<VisibleGradingResult, "stopReason">;
type BlockedGradingReason = Extract<
  VisibleGradingStopReason,
  "attempt-cap" | "stalled"
>;

export function maxVisibleGradeRequests(domainCount: number): number {
  return (
    Math.ceil(Math.max(0, domainCount) / MAX_DOMAIN_RATING_LOOKUPS) *
    MAX_DOMAIN_RATING_ATTEMPTS
  );
}

function wasAborted(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

export async function runVisibleDomainGrading(input: {
  domains: string[];
  signal: AbortSignal;
  gradeBatch(input: {
    domains: string[];
    signal: AbortSignal;
  }): Promise<GradingBatchResult>;
  onProgress?(progress: VisibleGradingProgress): void | Promise<void>;
}): Promise<VisibleGradingResult> {
  const scopedDomains = [
    ...new Set(input.domains.map((domain) => domain.trim()).filter(Boolean)),
  ];
  const maxRequests = maxVisibleGradeRequests(scopedDomains.length);
  let attempted = 0;
  let graded = 0;
  let failed = 0;
  let requests = 0;
  let remaining = scopedDomains.length;
  let processedDomains = 0;
  let unresolvedProcessed = 0;
  let blockedReason: BlockedGradingReason | null = null;

  const result = (
    stopReason: VisibleGradingStopReason,
  ): VisibleGradingResult => ({
    attempted,
    graded,
    failed,
    remaining,
    requests,
    maxRequests,
    stopReason,
  });

  if (input.signal.aborted) return result("cancelled");
  if (scopedDomains.length === 0) return result("complete");

  for (
    let start = 0;
    start < scopedDomains.length;
    start += MAX_DOMAIN_RATING_LOOKUPS
  ) {
    const batch = scopedDomains.slice(start, start + MAX_DOMAIN_RATING_LOOKUPS);
    let batchRemaining = batch.length;
    let batchStopReason: BlockedGradingReason | null = null;

    for (
      let round = 0;
      round < MAX_DOMAIN_RATING_ATTEMPTS && batchRemaining > 0;
      round += 1
    ) {
      if (input.signal.aborted) return result("cancelled");

      let batchResult: GradingBatchResult;
      try {
        batchResult = await input.gradeBatch({
          domains: batch,
          signal: input.signal,
        });
      } catch (error) {
        if (wasAborted(error, input.signal)) return result("cancelled");
        throw error;
      }

      requests += 1;
      attempted += batchResult.attempted;
      graded += batchResult.graded;
      failed += batchResult.failed;
      batchRemaining = Math.min(
        batch.length,
        Math.max(0, batchResult.remaining),
      );
      // The server count is authoritative. Another cron/tab can finish a row
      // between our snapshot and request, in which case `graded` is zero here
      // even though that row is no longer ungraded.
      remaining =
        unresolvedProcessed +
        batchRemaining +
        (scopedDomains.length - processedDomains - batch.length);

      await input.onProgress?.({
        attempted,
        graded,
        failed,
        remaining,
        requests,
        maxRequests,
      });

      if (input.signal.aborted) return result("cancelled");
      if (batchRemaining === 0) break;
      if (batchResult.attempted === 0) {
        batchStopReason = "stalled";
        break;
      }
    }

    if (batchRemaining > 0 && batchStopReason === null) {
      batchStopReason = "attempt-cap";
    }
    if (batchStopReason === "attempt-cap" || blockedReason === null) {
      blockedReason = batchStopReason;
    }
    unresolvedProcessed += batchRemaining;
    processedDomains += batch.length;
  }

  return result(
    remaining === 0 ? "complete" : (blockedReason ?? "attempt-cap"),
  );
}
