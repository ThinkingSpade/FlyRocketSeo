import { getRouteApi } from "@tanstack/react-router";
import { Globe } from "lucide-react";
import {
  AreaTrendChart,
  SerpAnalysisCard,
} from "@/client/features/keywords/components";
import type { KeywordResearchRow } from "@/types/keywords";
import type { KeywordResearchControllerState } from "./types";
import { SerpPanelActions } from "./keywordResearchDesktopFilters";
import { KeywordActionPlanCard } from "@/client/features/keywords/actionPlan/KeywordActionPlanCard";

// Split out of KeywordResearchDesktopResults.tsx to keep that file under the
// line-count cap -- this panel is otherwise unrelated to the table/filters it
// used to share a file with (its only dependency is `controller`, same as
// before the split).

const MONTH_SHORT_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatTrendRangeLabel(trend: KeywordResearchRow["trend"]): string {
  if (trend.length === 0) return "Last 12 available months";

  const sorted = trend.toSorted(
    (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month),
  );
  const last12 = sorted.slice(-12);
  const start = last12[0];
  const end = last12[last12.length - 1];

  const toLabel = (month: number, year: number) => {
    const monthLabel = MONTH_SHORT_LABELS[month - 1] ?? `M${month}`;
    return `${monthLabel} ${year}`;
  };

  const startLabel = toLabel(start.month, start.year);
  const endLabel = toLabel(end.month, end.year);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

const keywordsRoute = getRouteApi("/_project/p/$projectId/keywords");

export function KeywordResearchDesktopSerpPanel({
  controller,
  ownDomainRating,
}: {
  controller: KeywordResearchControllerState;
  /** This project's own DR, already loaded free by the page -- the figure the
   *  action plan below measures the SERP against. */
  ownDomainRating: number | null;
}) {
  const { projectId } = keywordsRoute.useParams();
  const { overviewKeyword } = controller;
  const trendRangeLabel = overviewKeyword
    ? formatTrendRangeLabel(overviewKeyword.trend)
    : "Last 12 available months";

  return (
    <div className="order-1 xl:order-2 flex flex-col min-w-0 gap-2 xl:basis-2/5 xl:overflow-y-auto">
      {overviewKeyword && overviewKeyword.trend.length > 0 ? (
        <div className="shrink-0 overflow-hidden border border-base-300 rounded-xl bg-base-100 px-4 py-3">
          <h4 className="text-sm font-semibold mb-1">
            Search Trends{" "}
            <span className="font-normal text-base-content/50">
              {trendRangeLabel}
            </span>
          </h4>
          <AreaTrendChart trend={overviewKeyword.trend} />
        </div>
      ) : null}

      <div className="flex flex-col overflow-hidden border border-base-300 rounded-xl bg-base-100">
        <div className="shrink-0 px-4 py-3 border-b border-base-300">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Globe className="size-3.5" />
              SERP Analysis
              {controller.activeSerpKeyword ? (
                <span className="font-normal text-base-content/50 truncate">
                  : {controller.activeSerpKeyword}
                </span>
              ) : null}
            </h3>
            {controller.activeSerpKeyword ? (
              <SerpPanelActions
                projectId={projectId}
                keyword={controller.activeSerpKeyword}
              />
            ) : null}
          </div>
        </div>
        <div className="p-4">
          <SerpAnalysisCard
            items={controller.serpResults}
            keyword={controller.activeSerpKeyword}
            loading={controller.serpLoading}
            error={controller.serpError}
            onRetry={() => void controller.serpQuery.refetch()}
            page={controller.serpPage}
            pageSize={controller.SERP_PAGE_SIZE}
            onPageChange={controller.setSerpPage}
            // The row the table already highlights. Selecting a keyword for
            // the OVERVIEW panel is free and automatic; fetching its SERP is
            // neither, which is why the two are separate and this needs its
            // own explicit control rather than following the highlight.
            analyzeKeyword={overviewKeyword?.keyword ?? null}
            onAnalyze={() => {
              if (!overviewKeyword) return;
              controller.setSerpKeyword(overviewKeyword.keyword);
              controller.setSerpPage(0);
            }}
          />
        </div>
      </div>

      {controller.activeSerpKeyword ? (
        <KeywordActionPlanCard
          projectId={projectId}
          keyword={controller.activeSerpKeyword}
          serpResults={controller.serpResults}
          ownDomainRating={ownDomainRating}
        />
      ) : null}
    </div>
  );
}
