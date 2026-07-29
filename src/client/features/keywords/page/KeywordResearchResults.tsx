import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import { buildKeywordsVerdict } from "@/client/features/insights/verdicts/keywords";
import { KeywordResearchDesktopResults } from "./KeywordResearchDesktopResults";
import { KeywordResearchMobileResults } from "./KeywordResearchMobileResults";
import { PpcValuePanel } from "./PpcValuePanel";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  projectId: string;
  controller: KeywordResearchControllerState;
  /** This project's own Ahrefs domain rating, for the reachability verdict
   *  and the per-row "needs DR X+" notes below. */
  ownDomainRating: number | null;
};

export function KeywordResearchResults({
  projectId,
  controller,
  ownDomainRating,
}: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden w-full gap-3">
      {/* Pure read of rows already on the page plus the free DR lookup above
          -- no extra metered call, so it costs nothing to show. */}
      <NextStepsCard
        verdict={buildKeywordsVerdict({
          seed: controller.searchedKeyword ?? "",
          rows: controller.rows,
          ownDomainRating,
          // Only when the CAPTURED run (not live scope) actually went local
          // -- see useKeywordResearchController.ts's own `researchGeo`.
          areaLabel:
            controller.researchGeo?.volume.scope === "local"
              ? controller.researchGeo.volume.label
              : null,
        })}
        projectId={projectId}
        tab="Keyword Research"
      />
      <KeywordResearchDesktopResults
        controller={controller}
        ownDomainRating={ownDomainRating}
      />
      <KeywordResearchMobileResults
        controller={controller}
        ownDomainRating={ownDomainRating}
      />
      {/* Derived from the volume/CPC/difficulty already on these rows — no
          extra call, so it costs nothing to show. */}
      <PpcValuePanel rows={controller.rows} />
    </div>
  );
}
