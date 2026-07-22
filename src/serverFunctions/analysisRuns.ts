import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { requireProjectContext } from "@/serverFunctions/middleware";

/**
 * Read-only history endpoints. Both are free: they read stored rows plus an R2
 * object that was already paid for, and can never trigger a metered fetch — so
 * a tab may call `restoreLatestRun` automatically on open.
 */

const restoreSchema = z.object({
  projectId: z.string().min(1),
  feature: z.string().min(1).max(64),
});

const recentSchema = z.object({
  projectId: z.string().min(1),
  feature: z.string().min(1).max(64),
  limit: z.number().int().min(1).max(25).default(10),
});

const runIdSchema = z.object({
  projectId: z.string().min(1),
  runId: z.string().min(1),
});

/** The last run for this tab plus its stored result, or null. */
export const restoreLatestRun = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(restoreSchema)
  .handler(async ({ data, context }) => {
    return AnalysisRunService.restoreLatest(context.projectId, data.feature);
  });

/** Recent analyses for this tab, newest first (no result payloads). */
export const getRecentRuns = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(recentSchema)
  .handler(async ({ data, context }) => {
    return AnalysisRunService.listRecent(
      context.projectId,
      data.feature,
      data.limit,
    );
  });

/** Re-open one past run's stored result. Free — never triggers a fetch. */
export const restoreRun = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(runIdSchema)
  .handler(async ({ data, context }) => {
    return AnalysisRunService.restoreRun(context.projectId, data.runId);
  });
