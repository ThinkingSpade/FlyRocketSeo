import { useQuery } from "@tanstack/react-query";
import { restoreLatestRun } from "@/serverFunctions/analysisRuns";

/**
 * The input a tab last ran, so returning to it resumes where you left off.
 *
 * Free by construction: `restoreLatestRun` reads a stored D1 row plus the R2
 * object that run already paid for, which is the same guarantee
 * `useAutoRestoredRun` documents. It can never trigger a metered fetch.
 *
 * The caller supplies `extract` because each feature stores a different result
 * shape and only the tab knows which field was its input. Returning null for an
 * unrecognised shape is correct: prefill falls through to the next level.
 */
export function useLastRunInput(
  projectId: string,
  feature: string,
  extract: (result: unknown) => string | null,
): string | null {
  const query = useQuery({
    queryKey: ["analysisRun", "latest", projectId, feature],
    queryFn: () => restoreLatestRun({ data: { projectId, feature } }),
    staleTime: 60_000,
  });

  const row = query.data;
  if (!row) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.resultJson);
  } catch {
    return null;
  }

  try {
    return extract(parsed);
  } catch {
    // A stored shape that has drifted since it was written is not an error —
    // the tab simply has no last-run value to offer.
    return null;
  }
}
