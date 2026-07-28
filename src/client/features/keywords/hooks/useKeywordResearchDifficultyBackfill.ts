import { useMemo } from "react";
import { KEYWORD_DIFFICULTY_OVERVIEW_MAX_KEYWORDS } from "@/types/schemas/keywords";
import type { KeywordResearchRow } from "@/types/keywords";
import type { ResolvedGeo } from "@/shared/geo/types";
import { describeGeoUnavailable } from "@/client/features/geo/geoUnavailableMessage";
import {
  mergeDifficultyOverview,
  selectDifficultyBackfillKeywords,
} from "@/client/features/keywords/keywordDifficultyMerge";
import { useKeywordDifficultyOverview } from "./useKeywordDifficultyOverview";

/** Just the two geo needs this hook cares about -- the same bundle shape
 *  `useKeywordResearchController.ts` captures as `researchGeo` at
 *  authorize()-time (that type is deliberately not exported there; knip
 *  flags an unused export, so this is spelled out structurally instead). */
type ResearchGeoForDifficulty = {
  volume: ResolvedGeo;
  difficulty: ResolvedGeo;
};

// Not exported: both call sites (KeywordResearchDesktopResults.tsx,
// KeywordResearchMobileResults.tsx) read this off the hook's own return
// value (`ReturnType<typeof useKeywordResearchDifficultyBackfill>["affordance"]`)
// rather than importing the type directly -- knip flags an unused export,
// same reasoning as useKeywordDifficultyOverview.ts's own private alias.
type DifficultyBackfillAffordance = {
  /** Exactly how many keywords this click will request -- always equal to
   *  what `onLoad` actually sends, so the button never promises more than
   *  it delivers. */
  count: number;
  unavailableMessage: string | null;
  isLoading: boolean;
  isError: boolean;
  onLoad: () => void;
};

/**
 * Task 6 Step 2's "Load difficulty for these N" affordance, wired into
 * Keyword Research's own table. Reuses the exact shared backend SERP
 * Overview already ships -- `useKeywordDifficultyOverview`'s hook/query/cache
 * and `describeGeoUnavailable`'s copy -- rather than a second mechanism; the
 * only things specific to this tab are (a) bounding the request to the
 * CURRENT PAGE's rows (`pageRows`, already computed by
 * `useKeywordResearchPagination`) instead of SERP Overview's single keyword,
 * and (b) merging the loaded values back into however many rows are on
 * screen (`mergedRows`) rather than one KPI tile.
 *
 * `researchGeo` is the bundle CAPTURED at authorize()-time
 * (`useKeywordResearchController.ts`'s own `researchGeo`) -- never the live
 * scope control -- so eligibility and the request's own locationCode/
 * languageCode always describe the run whose rows are actually on screen.
 */
export function useKeywordResearchDifficultyBackfill(
  projectId: string,
  pageRows: readonly KeywordResearchRow[],
  researchGeo: ResearchGeoForDifficulty | null,
) {
  const difficultyOverview = useKeywordDifficultyOverview(projectId);

  const mergedRows = useMemo(
    () =>
      pageRows.map((row) =>
        mergeDifficultyOverview(row, difficultyOverview.byKeyword),
      ),
    [pageRows, difficultyOverview.byKeyword],
  );

  const backfillKeywords = useMemo(
    () =>
      selectDifficultyBackfillKeywords(
        pageRows,
        difficultyOverview.byKeyword,
        KEYWORD_DIFFICULTY_OVERVIEW_MAX_KEYWORDS,
      ),
    [pageRows, difficultyOverview.byKeyword],
  );

  const difficultyNeed = researchGeo?.difficulty ?? null;
  // Mirrors SerpOverviewPage.tsx's own `canBackfillDifficulty`: only when the
  // run's VOLUME actually went to Google Ads (a metro applied, so the main
  // response never carried difficulty at all) AND the resolved country's
  // difficulty need itself resolves to Labs (not "none") is there anything a
  // separate call could plausibly answer that the main run didn't already.
  const canBackfill =
    researchGeo != null &&
    researchGeo.volume.provider === "google_ads" &&
    researchGeo.difficulty.provider === "labs";
  const unavailableMessage = difficultyNeed
    ? describeGeoUnavailable("Keyword difficulty", difficultyNeed)
    : null;
  const showAffordance =
    backfillKeywords.length > 0 && (canBackfill || unavailableMessage != null);

  const affordance: DifficultyBackfillAffordance | null =
    showAffordance && difficultyNeed
      ? {
          count: backfillKeywords.length,
          unavailableMessage,
          isLoading: difficultyOverview.isLoading,
          isError: difficultyOverview.isError,
          onLoad: () =>
            difficultyOverview.load({
              keywords: backfillKeywords,
              locationCode: difficultyNeed.locationCode,
              languageCode: difficultyNeed.languageCode,
            }),
        }
      : null;

  return { mergedRows, affordance };
}
