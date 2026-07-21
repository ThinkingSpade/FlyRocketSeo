import { Clock, HelpCircle, KeyRound, ListTree, Ruler, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";
import type { ContentBriefHistoryItem } from "./useContentBriefHistory";

const BRIEF_PARTS: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: Ruler,
    title: "Target length",
    description: "Median word count of the pages that actually rank",
  },
  {
    icon: ListTree,
    title: "Structure & outline",
    description:
      "H2 counts, each competitor's outline, and the consensus sections",
  },
  {
    icon: KeyRound,
    title: "Terms to include",
    description: "The keywords the top pages rank for, with volumes",
  },
  {
    icon: HelpCircle,
    title: "Questions & grading",
    description: "People-Also-Ask questions plus a paste-in draft grader",
  },
];

function locationLabel(code: number): string {
  return (
    LOCATION_OPTIONS.find((option) => option.code === code)?.label ??
    `Location ${code}`
  );
}

/**
 * The tab's landing view: recent briefs one click away, and a preview of
 * what a brief contains — instead of a bare dashed box.
 */
export function ContentEmptyState({
  history,
  historyLoaded,
  onOpenBrief,
  onRemoveBrief,
}: {
  history: ContentBriefHistoryItem[];
  historyLoaded: boolean;
  onOpenBrief: (item: ContentBriefHistoryItem) => void;
  onRemoveBrief: (timestamp: number) => void;
}) {
  return (
    <div className="space-y-3">
      {historyLoaded && history.length > 0 ? (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body gap-2 p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <InsightIcon icon={Clock} />
              Recent briefs
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {history.map((item) => (
                <span
                  key={item.timestamp}
                  className="group inline-flex items-center gap-1 rounded-full border border-base-300 bg-base-100 py-1 pl-3 pr-1.5 text-sm hover:border-primary/50"
                >
                  <button
                    type="button"
                    className="hover:text-primary"
                    onClick={() => onOpenBrief(item)}
                  >
                    {item.keyword}
                    <span className="ml-1 text-xs text-base-content/45">
                      {locationLabel(item.locationCode)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-base-content/35 hover:bg-base-200 hover:text-base-content/70"
                    title="Remove from history"
                    onClick={() => onRemoveBrief(item.timestamp)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card border border-dashed border-base-300">
        <div className="card-body gap-3 p-6">
          <div className="text-center">
            <p className="font-medium">Enter a keyword to build a brief</p>
            <p className="mx-auto max-w-md text-sm text-base-content/60">
              The optimizer reads the current top-ranking pages and turns them
              into a concrete writing target.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {BRIEF_PARTS.map((part) => (
              <div
                key={part.title}
                className="rounded-lg border border-base-300 bg-base-100 p-3"
              >
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <InsightIcon icon={part.icon} />
                  {part.title}
                </div>
                <p className="mt-1 text-xs text-base-content/55">
                  {part.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
