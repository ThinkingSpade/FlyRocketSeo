import { useState } from "react";
import { getKeywordDifficultyOverview } from "@/serverFunctions/keywords";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import type { KeywordDifficultyOverviewRow } from "@/types/schemas/keywords";

// Not exported: every current caller reads this off the hook's own return
// value (`ReturnType<typeof useKeywordDifficultyOverview>["byKeyword"]`)
// rather than importing the type directly -- knip flags an unused export.
type DifficultyOverviewByKeyword = ReadonlyMap<
  string,
  KeywordDifficultyOverviewRow
>;

type CapturedRequest = {
  keywords: string[];
  locationCode: number;
  languageCode: string;
};

/**
 * Task 6's on-demand "Load difficulty for these N" affordance (Keyword
 * Research, SERP Overview). Follows the same authorize()-time capture
 * `useCompetitorsRun` (competitors/useCompetitorsQueries.ts) uses for its
 * market: `load()` snapshots the keyword list AND the resolved
 * country-level geo into `captured` React state at the exact moment the
 * user clicks, and the query reads only that snapshot, never the caller's
 * live props. Without this, scrolling to a new page or changing the scope
 * control between the click and the response landing would change the
 * query's key while it stays enabled -- TanStack Query would treat that as
 * a brand-new, never-fetched entry and fire an uncommanded second paid
 * call, the exact failure mode `useCompetitorsRun`'s own header documents.
 */
export function useKeywordDifficultyOverview(projectId: string) {
  const [captured, setCaptured] = useState<CapturedRequest | null>(null);
  const run = useAuthorizedRun(
    createMeteredRunKey(
      projectId,
      captured?.keywords ?? [],
      captured?.locationCode ?? 0,
      captured?.languageCode ?? "",
    ),
  );

  const query = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: captured != null,
    queryKey: ["keyword-difficulty-overview", projectId, captured],
    queryFn: () =>
      getKeywordDifficultyOverview({
        data: {
          projectId,
          keywords: captured?.keywords ?? [],
          locationCode: captured?.locationCode ?? 0,
          languageCode: captured?.languageCode ?? "en",
        },
      }),
  });

  const load = (request: CapturedRequest) => {
    setCaptured(request);
    run.authorize(
      createMeteredRunKey(
        projectId,
        request.keywords,
        request.locationCode,
        request.languageCode,
      ),
    );
  };

  const byKeyword: DifficultyOverviewByKeyword = new Map(
    (query.data ?? []).map((row) => [row.keyword.toLowerCase(), row]),
  );

  return {
    load,
    isLoading: query.isFetching,
    isError: query.isError,
    // Deliberately no bare "loaded" flag: a fresh run's keywords are not the
    // ones this hook last fetched difficulty for, so "has data" can only be
    // answered per-keyword. Callers check `byKeyword.has(keyword)` for the
    // specific keyword(s) they're about to render, not a hook-wide flag that
    // would otherwise read "loaded" for a brand-new keyword that was never
    // actually fetched.
    byKeyword,
  };
}
