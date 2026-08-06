import { AnalysisRunRepository } from "@/server/features/analysis-runs/repositories/AnalysisRunRepository";
import {
  getCachedRawIgnoringTtl,
  getRunPayload,
  putRunPayload,
} from "@/server/lib/r2-cache";

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
    // Take the run's OWN copy of the result before recording the row.
    //
    // The row used to point straight at the shared DataForSEO cache object,
    // which the bucket's `dataforseo-cache-expiry` lifecycle rule hard-deletes
    // after 7 days. D1 rows never expire, so every run older than a week became
    // a dead link and the tab silently rendered its "never run this" empty
    // state (measured in production 2026-07-31). Copying here is what makes the
    // history outlive the cache — see RUN_PAYLOAD_PREFIX in r2-cache.ts.
    //
    // Reading through `getCachedRawIgnoringTtl` is deliberate: the caller has
    // just written this key, and reading the stored text avoids re-serializing
    // a payload whose exact bytes the restore path will parse. A miss here is
    // survivable — the row is still recorded, and restore falls back to the
    // cache object for as long as it lives.
    const raw = await getCachedRawIgnoringTtl(input.cacheKey);
    if (raw != null) {
      await putRunPayload(input.cacheKey, raw);
    }

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
 * Why a restore produced nothing, when it does.
 *
 * A bare `null` conflated two very different situations, and the tab rendered
 * both as "you have never run this": there was no run at all, versus there WAS
 * a run and its payload is gone. Only the second is worth telling the user
 * about, and it is the common one — the payload used to live under the
 * `dataforseo-cache/` prefix, which the bucket deletes after 7 days while the
 * D1 row lives forever (see RUN_PAYLOAD_PREFIX in r2-cache.ts).
 */
type RestoreOutcome =
  | Readonly<{ status: "none" }>
  | Readonly<{ status: "expired"; label: string; lastRanAt: string }>
  | Readonly<{ status: "ready"; run: RestoredRun }>;

/**
 * The most recent run for a tab, with its stored result. Returns null when
 * there is no run yet, or when the payload is no longer in R2 — either way the
 * tab falls back to its normal empty state.
 */
async function hydrate(
  row: {
    label: string;
    paramsJson: string;
    cacheKey: string;
    lastRanAt: string;
    runCount: number;
  } | null,
): Promise<RestoreOutcome> {
  if (!row) return { status: "none" };

  // The run's own durable copy first, then the shared cache object as a
  // fallback. The fallback is what keeps runs recorded BEFORE this fix
  // restorable for as long as their cache object survives; once every run has
  // its own copy it becomes dead code, but removing it early would strand
  // exactly the recent runs a user is most likely to want back.
  const resultJson =
    (await getRunPayload(row.cacheKey)) ??
    (await getCachedRawIgnoringTtl(row.cacheKey));

  // The row is proof the run happened, so this is an expiry, not an absence.
  if (resultJson == null) {
    return { status: "expired", label: row.label, lastRanAt: row.lastRanAt };
  }

  return {
    status: "ready",
    run: {
      label: row.label,
      paramsJson: row.paramsJson,
      resultJson,
      lastRanAt: row.lastRanAt,
      runCount: row.runCount,
    },
  };
}

async function restoreLatest(
  projectId: string,
  feature: string,
): Promise<RestoreOutcome> {
  return hydrate(await AnalysisRunRepository.latest(projectId, feature));
}

/** Re-open one specific past run. Free, same as restoring the latest. */
async function restoreRun(
  projectId: string,
  runId: string,
): Promise<RestoreOutcome> {
  return hydrate(await AnalysisRunRepository.getById(projectId, runId));
}

type RecentRun = {
  id: string;
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
    id: row.id,
    label: row.label,
    paramsJson: row.paramsJson,
    lastRanAt: row.lastRanAt,
    runCount: row.runCount,
  }));
}

export const AnalysisRunService = {
  record,
  restoreLatest,
  restoreRun,
  listRecent,
} as const;
