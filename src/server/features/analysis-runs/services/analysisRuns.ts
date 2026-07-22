import { AnalysisRunRepository } from "@/server/features/analysis-runs/repositories/AnalysisRunRepository";
import { getCachedRawIgnoringTtl } from "@/server/lib/r2-cache";

/**
 * Cross-tab analysis-run history: what was run, when, and how to get it back.
 *
 * Restoring reads the result straight out of R2 (past its soft TTL), so opening
 * a tab and seeing your last run costs nothing and can never trigger a metered
 * fetch — which is what makes auto-restore safe to do automatically.
 */

type RecordRunInput = {
  projectId: string;
  feature: string;
  /** Canonical inputs, so a restored run can repopulate the tab's form. */
  params: Record<string, unknown>;
  /** R2 key holding this run's result. */
  cacheKey: string;
  /** Short human summary for the history list (domain, keyword, URL…). */
  label: string;
  ranBy?: string | null;
};

/**
 * Record a run. Best effort by design: history is secondary to the analysis
 * itself, so a write failure is logged and swallowed rather than failing a
 * request the user already paid for.
 */
async function record(input: RecordRunInput): Promise<void> {
  try {
    await AnalysisRunRepository.record({
      projectId: input.projectId,
      feature: input.feature,
      paramsJson: JSON.stringify(input.params),
      cacheKey: input.cacheKey,
      label: input.label,
      ranBy: input.ranBy ?? null,
    });
  } catch (error) {
    console.error("analysis-runs.record failed:", error);
  }
}

/**
 * Payloads cross the wire as JSON text, not parsed objects: server functions
 * require a provably serializable return, and the client has to validate
 * against the feature's own schema anyway (shapes drift between a write and a
 * later read). Passing the raw text also avoids a parse-then-restringify hop.
 */
type RestoredRun = {
  label: string;
  paramsJson: string;
  resultJson: string;
  lastRanAt: string;
  runCount: number;
};

/**
 * The most recent run for a tab, with its stored result. Returns null when
 * there is no run yet, or when the payload is no longer in R2 — either way the
 * tab falls back to its normal empty state.
 */
async function restoreLatest(
  projectId: string,
  feature: string,
): Promise<RestoredRun | null> {
  const row = await AnalysisRunRepository.latest(projectId, feature);
  if (!row) return null;

  const resultJson = await getCachedRawIgnoringTtl(row.cacheKey);
  if (resultJson == null) return null;

  return {
    label: row.label,
    paramsJson: row.paramsJson,
    resultJson,
    lastRanAt: row.lastRanAt,
    runCount: row.runCount,
  };
}

type RecentRun = {
  label: string;
  paramsJson: string;
  lastRanAt: string;
  runCount: number;
};

/** Lightweight history list for a tab — no result payloads. */
async function listRecent(
  projectId: string,
  feature: string,
  limit = 10,
): Promise<RecentRun[]> {
  const rows = await AnalysisRunRepository.listRecent(
    projectId,
    feature,
    limit,
  );
  return rows.map((row) => ({
    label: row.label,
    paramsJson: row.paramsJson,
    lastRanAt: row.lastRanAt,
    runCount: row.runCount,
  }));
}

export const AnalysisRunService = {
  record,
  restoreLatest,
  listRecent,
} as const;
