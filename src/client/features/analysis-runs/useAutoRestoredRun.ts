import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ZodType } from "zod";
import { restoreLatestRun } from "@/serverFunctions/analysisRuns";

/**
 * Restores a tab's last analysis so it opens showing real data instead of a
 * blank form.
 *
 * Safe to run automatically: the endpoint only reads a stored row plus the R2
 * object that run already paid for, so it can never trigger a metered fetch.
 * Callers feed the result in alongside their live query and leave that query
 * disabled, which keeps the "no automatic spend" guarantee intact.
 */
type AutoRestoredRun<T> = {
  result: T;
  label: string;
  lastRanAt: string;
  runCount: number;
};

export function useAutoRestoredRun<T>({
  projectId,
  feature,
  schema,
  enabled,
}: {
  projectId: string;
  feature: string;
  /** The feature's own result schema — stored shapes can drift over time. */
  schema: ZodType<T>;
  /** Typically "the tab has no active query of its own". */
  enabled: boolean;
}): { restored: AutoRestoredRun<T> | null; isRestoring: boolean } {
  const query = useQuery({
    queryKey: ["analysisRun", "latest", projectId, feature],
    queryFn: () => restoreLatestRun({ data: { projectId, feature } }),
    enabled,
    staleTime: 60_000,
  });

  const restored = useMemo(() => {
    const row = query.data;
    if (!row) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(row.resultJson);
    } catch {
      return null;
    }

    // A stored payload that no longer matches the schema is dropped rather than
    // rendered — the tab just falls back to its empty state.
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return null;

    return {
      result: parsed.data,
      label: row.label,
      lastRanAt: row.lastRanAt,
      runCount: row.runCount,
    };
  }, [query.data, schema]);

  return { restored, isRestoring: enabled && query.isPending };
}
