import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  sortKeywordGroups,
  type KeywordGroup,
  type KeywordGroupSort,
} from "@/client/features/keywords/keywordGroups";
import { formatCompactNumber } from "@/client/features/keywords/utils";

const COLLAPSED_GROUP_LIMIT = 30;

type Props = {
  groups: KeywordGroup[];
  totalKeywords: number;
  groupTerm: string | null;
  setGroupTerm: (term: string | null) => void;
};

/**
 * Keyword Magic-style groups rail: the sub-terms inside the result set, each
 * slicing the table to the keywords containing it. Desktop-only refinement —
 * the underlying filter still applies everywhere.
 */
export function KeywordGroupsRail({
  groups,
  totalKeywords,
  groupTerm,
  setGroupTerm,
}: Props) {
  const [sort, setSort] = useState<KeywordGroupSort>("count");
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => sortKeywordGroups(groups, sort), [groups, sort]);
  const visible = showAll ? sorted : sorted.slice(0, COLLAPSED_GROUP_LIMIT);

  if (groups.length === 0) return null;

  return (
    <div className="hidden lg:flex w-44 shrink-0 flex-col overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div className="shrink-0 border-b border-base-300 px-3 py-2">
        <div className="join w-full">
          <button
            className={`btn btn-xs join-item flex-1 ${sort === "count" ? "btn-active" : "btn-ghost"}`}
            onClick={() => setSort("count")}
          >
            By number
          </button>
          <button
            className={`btn btn-xs join-item flex-1 ${sort === "volume" ? "btn-active" : "btn-ghost"}`}
            onClick={() => setSort("volume")}
          >
            By volume
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <button
          className={`flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-base-200/60 ${
            groupTerm == null ? "font-semibold" : ""
          }`}
          onClick={() => setGroupTerm(null)}
        >
          <span>All keywords</span>
          <span className="text-xs text-base-content/50 tabular-nums">
            {totalKeywords.toLocaleString()}
          </span>
        </button>
        {visible.map((group) => {
          const isActive = groupTerm === group.term;
          return (
            <button
              key={group.term}
              className={`flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-base-200/60 ${
                isActive ? "bg-primary/10 font-medium text-primary" : ""
              }`}
              onClick={() => setGroupTerm(isActive ? null : group.term)}
              title={
                isActive
                  ? "Clear this group"
                  : `Show keywords containing “${group.term}”`
              }
            >
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate">{group.term}</span>
                {isActive ? <X className="size-3 shrink-0" /> : null}
              </span>
              <span className="shrink-0 text-xs text-base-content/50 tabular-nums">
                {sort === "volume"
                  ? formatCompactNumber(group.totalVolume)
                  : group.keywordCount.toLocaleString()}
              </span>
            </button>
          );
        })}
        {sorted.length > COLLAPSED_GROUP_LIMIT ? (
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-primary hover:bg-base-200/60"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? "Show fewer" : `Show all ${sorted.length}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
