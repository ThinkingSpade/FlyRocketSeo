import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ZodType } from "zod";
import { restoreLatestRun, restoreRun } from "@/serverFunctions/analysisRuns";

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
  /**
   * The run's own canonicalized inputs, parsed from JSON best-effort --
   * `null` when the stored value isn't valid JSON (shouldn't happen in
   * practice, but a restore must never throw over a corrupt row). This
   * hook is feature-agnostic and doesn't know each tab's own params shape,
   * so it exposes the parsed value as `unknown` rather than validating it
   * itself -- callers narrow whatever slice they need (e.g. a per-run
   * geography bundle; see resolveRunGeo.ts's `parseStoredGeo`) the same
   * way they already validate `result` against their own schema above.
   */
  params: unknown;
};

export function useAutoRestoredRun<T>({
  projectId,
  feature,
  schema,
  enabled,
  runId,
}: {
  projectId: string;
  feature: string;
  /** The feature's own result schema — stored shapes can drift over time. */
  schema: ZodType<T>;
  /** Typically "the tab has no active query of its own". */
  enabled: boolean;
  /** Restore this specific past run instead of the most recent one. */
  runId?: string | null;
}): {
  restored: AutoRestoredRun<T> | null;
  /**
   * Why `restored` is null. `expired` means the run happened but its stored
   * result is gone; `unreadable` means it no longer matches this tab's schema.
   * Both are worth saying out loud rather than showing a blank form.
   */
  outcome: "none" | "expired" | "unreadable" | "ready" | null;
  /** The expired run's own label/date, so the message can name it. */
  expired: { label: string; lastRanAt: string } | null;
  isRestoring: boolean;
  isError: boolean;
  isRetrying: boolean;
  retry: () => void;
} {
  const query = useQuery({
    queryKey: ["analysisRun", runId ?? "latest", projectId, feature],
    queryFn: () =>
      runId
        ? restoreRun({ data: { projectId, runId } })
        : restoreLatestRun({ data: { projectId, feature } }),
    enabled,
    staleTime: 60_000,
  });

  /**
   * Why there is nothing to show, when there isn't.
   *
   * Every one of these used to collapse to `null`, which callers rendered as
   * the tab's ordinary "you have never run this" empty state — so a run the
   * user definitely performed simply vanished, with no error and nothing to
   * act on. `expired` in particular is common rather than exotic: run payloads
   * lived under a bucket prefix Cloudflare deletes after 7 days.
   */
  const outcome: "none" | "expired" | "unreadable" | "ready" | null =
    useMemo(() => {
      if (!query.data) return null;
      if (query.data.status !== "ready") return query.data.status;
      try {
        const raw: unknown = JSON.parse(query.data.run.resultJson);
        return schema.safeParse(raw).success ? "ready" : "unreadable";
      } catch {
        return "unreadable";
      }
    }, [query.data, schema]);

  const restored = useMemo(() => {
    const row = query.data?.status === "ready" ? query.data.run : null;
    if (!row) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(row.resultJson);
    } catch {
      return null;
    }

    // A stored payload that no longer matches the schema is dropped rather than
    // rendered. Unlike before, this is now REPORTED through `outcome` above —
    // silently swallowing it is what made a schema change look like "this tab
    // has never been used".
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return null;

    // Best-effort like resultJson above, but a parse failure here must not
    // sink the whole restore -- the result itself already parsed fine, so
    // this degrades to null (the same "nothing to validate" shape a caller
    // already handles for an old, pre-bundle run) rather than throwing.
    let params: unknown = null;
    try {
      params = JSON.parse(row.paramsJson);
    } catch {
      params = null;
    }

    return {
      result: parsed.data,
      label: row.label,
      lastRanAt: row.lastRanAt,
      runCount: row.runCount,
      params,
    };
  }, [query.data, schema]);

  return {
    restored,
    outcome,
    expired:
      query.data?.status === "expired"
        ? { label: query.data.label, lastRanAt: query.data.lastRanAt }
        : null,
    isRestoring: enabled && query.isPending,
    isError: enabled && query.isError,
    isRetrying: enabled && query.isFetching,
    retry: () => void query.refetch(),
  };
}
