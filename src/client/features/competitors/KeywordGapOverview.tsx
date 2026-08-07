import { BadgeCheck, SearchX, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { InsightIcon, type InsightTone } from "@/client/components/InsightTile";
import type { KeywordGapMode } from "@/types/schemas/competitors";
import { useKeywordGapQuery } from "./useCompetitorsQueries";
import { Loader } from "@cloudflare/kumo/components/loader";

const MODE_META: Record<
  KeywordGapMode,
  { label: string; hint: string; icon: LucideIcon; tone: InsightTone }
> = {
  missing: {
    label: "Missing",
    hint: "They rank, you don't — your content roadmap",
    icon: SearchX,
    tone: "warning",
  },
  shared: {
    label: "Shared",
    hint: "You both rank — head-to-head battles",
    icon: Users,
    tone: "info",
  },
  advantage: {
    label: "Your advantage",
    hint: "You rank, they don't — defend these",
    icon: BadgeCheck,
    tone: "success",
  },
};

const MODES: KeywordGapMode[] = ["missing", "shared", "advantage"];

/**
 * Semrush-style gap overview: total keywords per gap category, clickable to
 * switch the table below. The active mode's page is already fetched for the
 * table, so this adds at most two (server-cached) calls per pair.
 */
export function KeywordGapOverview({
  projectId,
  target,
  competitor,
  pageSize,
  activeMode,
  locationCode,
  languageCode,
  authorized,
  runNonce,
  onModeChange,
}: {
  projectId: string;
  target: string;
  competitor: string;
  pageSize: number;
  activeMode: KeywordGapMode;
  locationCode: number;
  languageCode: string;
  authorized: boolean;
  runNonce: number;
  onModeChange: (mode: KeywordGapMode) => void;
}) {
  const queries = {
    missing: useKeywordGapQuery({
      projectId,
      target,
      competitor,
      mode: "missing",
      page: 1,
      pageSize,
      locationCode,
      languageCode,
      enabled: activeMode === "missing",
      authorized,
      runNonce,
    }),
    shared: useKeywordGapQuery({
      projectId,
      target,
      competitor,
      mode: "shared",
      page: 1,
      pageSize,
      locationCode,
      languageCode,
      enabled: activeMode === "shared",
      authorized,
      runNonce,
    }),
    advantage: useKeywordGapQuery({
      projectId,
      target,
      competitor,
      mode: "advantage",
      page: 1,
      pageSize,
      locationCode,
      languageCode,
      enabled: activeMode === "advantage",
      authorized,
      runNonce,
    }),
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {MODES.map((mode) => {
        const meta = MODE_META[mode];
        const query = queries[mode];
        const count = query.data?.totalCount ?? null;
        const isActive = activeMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onModeChange(mode)}
            className={`rounded-xl border bg-base-100 p-3 text-left transition-colors hover:border-primary/50 ${
              isActive
                ? "border-primary ring-1 ring-primary/30"
                : "border-base-300"
            }`}
            title={meta.hint}
          >
            <div className="flex items-center gap-2">
              <InsightIcon icon={meta.icon} tone={meta.tone} />
              <span className="truncate text-xs font-medium uppercase tracking-wide text-base-content/50">
                {meta.label}
              </span>
            </div>
            {/* Only the ACTIVE mode is ever fetched — the other two are
                separately metered and must not auto-run. But a disabled query
                stays `isPending` forever, so they used to sit on loading dots
                indefinitely, which reads as "still working" rather than "not
                run". Distinguish the two: dots only while genuinely fetching,
                otherwise say it needs a run. */}
            <div className="mt-1.5 text-xl font-semibold tabular-nums">
              {query.isFetching ? (
                <Loader size="sm" />
              ) : query.isError ? (
                <span className="text-sm font-normal text-base-content/60">
                  Couldn&rsquo;t load
                </span>
              ) : count != null ? (
                count.toLocaleString()
              ) : (
                <span className="text-sm font-normal text-base-content/50">
                  Select to run
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-base-content/50">
              {meta.hint}
            </div>
          </button>
        );
      })}
    </div>
  );
}
