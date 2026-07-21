import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Bookmark, Gauge, Target } from "lucide-react";
import { InsightTile, type InsightTone } from "@/client/components/InsightTile";
import { exportSavedKeywords } from "@/serverFunctions/keywords";
import type { ExportSavedKeywordsInput } from "@/types/schemas/keywords";
import type { AppliedSavedKeywordsFilters } from "./savedKeywordsFilterTypes";
import { computeSavedPortfolio } from "./savedPortfolio";

// Intent colors mirroring the IntentBadge palette.
const INTENT_BAR: Record<string, { label: string; className: string }> = {
  informational: { label: "Informational", className: "bg-info/70" },
  commercial: { label: "Commercial", className: "bg-warning/70" },
  transactional: { label: "Transactional", className: "bg-success/70" },
  navigational: { label: "Navigational", className: "bg-primary/70" },
};

function difficultyTone(value: number | null): InsightTone {
  if (value == null) return "neutral";
  if (value < 30) return "success";
  if (value < 60) return "warning";
  return "error";
}

/**
 * Portfolio stats over the FULL filtered saved set (the table is paginated,
 * so its rows alone can't feed honest totals). Reuses the export endpoint;
 * the shared ["savedKeywords", projectId] key prefix keeps it invalidated by
 * saves, removals, and metric refreshes.
 */
export function SavedKeywordsPortfolio({
  projectId,
  appliedFilters,
  selectedTagIds,
  sort,
  order,
  totalCount,
}: {
  projectId: string;
  appliedFilters: AppliedSavedKeywordsFilters;
  selectedTagIds: string[];
  sort: ExportSavedKeywordsInput["sort"];
  order: ExportSavedKeywordsInput["order"];
  totalCount: number;
}) {
  const exportInput = useMemo<ExportSavedKeywordsInput>(
    () => ({
      projectId,
      ...appliedFilters,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      sort,
      order,
    }),
    [appliedFilters, order, projectId, selectedTagIds, sort],
  );

  const portfolioQuery = useQuery({
    enabled: totalCount > 0,
    queryKey: ["savedKeywords", projectId, "portfolio", exportInput],
    queryFn: () => exportSavedKeywords({ data: exportInput }),
    staleTime: 60_000,
  });

  const rows = portfolioQuery.data?.rows;
  if (!rows || rows.length === 0) return null;
  const portfolio = computeSavedPortfolio(rows);
  const mixTotal = portfolio.intentMix.reduce((sum, m) => sum + m.count, 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InsightTile
          icon={Bookmark}
          label="Saved keywords"
          value={portfolio.keywordCount.toLocaleString()}
          tone="primary"
        />
        <InsightTile
          icon={BarChart3}
          label="Total volume"
          value={portfolio.totalVolume.toLocaleString()}
          hint="Monthly searches combined"
        />
        <InsightTile
          icon={Gauge}
          label="Avg difficulty"
          value={portfolio.averageDifficulty ?? "—"}
          tone={difficultyTone(portfolio.averageDifficulty)}
        />
        <InsightTile
          icon={Target}
          label="Quick wins"
          value={portfolio.quickWins}
          hint="KD under 30 with volume"
          tone={portfolio.quickWins > 0 ? "success" : "neutral"}
        />
      </div>

      {mixTotal > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex h-2 min-w-48 flex-1 overflow-hidden rounded-full bg-base-200">
            {portfolio.intentMix.map(({ intent, count }) => (
              <div
                key={intent}
                className={INTENT_BAR[intent]?.className ?? "bg-base-300"}
                style={{ width: `${(count / mixTotal) * 100}%` }}
                title={`${INTENT_BAR[intent]?.label ?? intent}: ${count}`}
              />
            ))}
          </div>
          {portfolio.intentMix.map(({ intent, count }) => (
            <span
              key={intent}
              className="flex items-center gap-1.5 text-xs text-base-content/70"
            >
              <span
                className={`inline-block size-2 rounded-full ${INTENT_BAR[intent]?.className ?? "bg-base-300"}`}
              />
              {INTENT_BAR[intent]?.label ?? intent}
              <span className="font-medium tabular-nums">{count}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
