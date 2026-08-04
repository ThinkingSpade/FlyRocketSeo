import { Loader2, Plus } from "lucide-react";
import type { getCitySitePerformance } from "@/serverFunctions/citySites";
import { toCitySiteDateRange, type CitySiteDateRange } from "./citySiteStatus";

type CitySitePerformanceResult = Awaited<
  ReturnType<typeof getCitySitePerformance>
>;

const DATE_RANGE_LABELS: Record<CitySiteDateRange, string> = {
  last_7_days: "Last 7 days",
  last_28_days: "Last 28 days",
  last_3_months: "Last 3 months",
  last_6_months: "Last 6 months",
};

/**
 * Search Console totals across the city sites, and the caveats that make the
 * numbers below readable.
 *
 * Three states are kept distinct on purpose, because collapsing them is how a
 * dashboard starts lying: not connected (nothing is known), connected but the
 * pull was truncated (the quiet cities are missing, not zero), and a complete
 * pull (an absent city really had no impressions).
 */
export function SearchConsoleSummary({
  performance,
  registryTotal,
  loading,
  dateRange,
  onDateRangeChange,
}: {
  performance: CitySitePerformanceResult | undefined;
  registryTotal: number;
  loading: boolean;
  dateRange: CitySiteDateRange;
  onDateRangeChange: (range: CitySiteDateRange) => void;
}) {
  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-4 py-3 text-sm text-base-content/50">
        <Loader2 className="size-4 animate-spin" />
        Loading Search Console performance
      </div>
    );
  }

  if (!performance) return null;

  if (!performance.connected) {
    return (
      <div className="mt-4 rounded-lg border border-base-300 bg-base-200/40 px-4 py-3 text-sm text-base-content/60">
        <span className="font-medium text-base-content/80">
          No per-city performance yet.
        </span>{" "}
        Connect Search Console in project settings. Use a{" "}
        <span className="font-mono text-xs">sc-domain:</span> domain property —
        it covers every subdomain at once, so all your city sites report through
        one connection and new ones appear on their own.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-base-300 bg-base-100 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-6">
          <Stat label="Clicks" value={performance.totals.clicks} />
          <Stat label="Impressions" value={performance.totals.impressions} />
          <div>
            <div className="text-lg font-semibold tabular-nums">
              {performance.citiesWithData.toLocaleString()}
              <span className="text-sm font-normal text-base-content/45">
                {" / "}
                {registryTotal.toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-base-content/60">Cities with data</div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-base-content/70">
          <span className="whitespace-nowrap">Period</span>
          <select
            className="select select-bordered select-sm"
            value={dateRange}
            onChange={(event) =>
              onDateRangeChange(toCitySiteDateRange(event.target.value))
            }
          >
            {Object.entries(DATE_RANGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {performance.truncated ? (
        <p className="mt-2 border-t border-base-300 pt-2 text-xs text-base-content/55">
          Search Console returned the top{" "}
          {performance.rowsExamined.toLocaleString()} pages by clicks and
          stopped there, so the quietest cities are missing from this period
          rather than showing zero. Totals are a floor, not a full count.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-base-content/60">{label}</div>
    </div>
  );
}

export function CoverageCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
        active
          ? "border-primary bg-primary/5"
          : "border-base-300 bg-base-100 hover:border-base-content/25"
      }`}
    >
      <div className="text-lg font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-base-content/60">{label}</div>
    </button>
  );
}

export function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium">No city sites yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-base-content/55">
        Paste your city subdomains and each one is matched to its location
        automatically. Nothing is charged, and you see the matches before
        anything is saved.
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm mt-4"
        onClick={onImport}
      >
        <Plus className="size-4" />
        Import subdomains
      </button>
    </div>
  );
}
