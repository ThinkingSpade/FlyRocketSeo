import { AlertTriangle, Loader2 } from "lucide-react";
import type { CityRankPlan } from "@/server/features/city-sites/services/CityRankTrackingService";
import type { RankScheduleInterval } from "@/shared/city-subdomains/cityKeywordTemplates";

const SKIP_LABELS: Record<string, string> = {
  "not-matched": "no city set yet — pick one first",
  "already-tracked": "already tracked",
  "config-cap": "over the tracked-domain limit",
  "no-keywords": "no keyword left after filling the template",
};

/**
 * Rounds a cost UP for display.
 *
 * A projection shown to two decimals would print "$0.00" for a real charge of
 * eight tenths of a cent — free, to the reader. Rounding up to the nearest cent
 * keeps a small recurring cost visible as a small recurring cost.
 */
function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  return `$${(Math.ceil(value * 100) / 100).toFixed(2)}`;
}

/**
 * What the setup would create, and what it would cost.
 *
 * The cost line is the reason this component exists, so it is stated in the
 * units the decision is actually made in — per month for a schedule, per run
 * for manual — rather than as a per-request price nobody can act on.
 */
export function CityRankPlanSummary({
  plan,
  loading,
  interval,
}: {
  plan: CityRankPlan | undefined;
  loading: boolean;
  interval: RankScheduleInterval;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2 text-sm text-base-content/50">
        <Loader2 className="size-4 animate-spin" />
        Working out what this covers
      </div>
    );
  }

  if (!plan) return null;

  const skipCounts = new Map<string, number>();
  for (const skip of plan.skipped) {
    skipCounts.set(skip.reason, (skipCounts.get(skip.reason) ?? 0) + 1);
  }

  const scheduled = interval !== "manual";
  const capUsed = plan.existingConfigCount + plan.eligible.length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Figure label="Cities" value={plan.eligible.length.toLocaleString()} />
        <Figure
          label="Keywords each"
          value={plan.cost.keywordsPerCity.toLocaleString()}
        />
        <Figure
          label="Checks per run"
          value={plan.cost.requestsPerCheck.toLocaleString()}
        />
      </div>

      <div
        className={`rounded-lg border px-3 py-2 ${
          scheduled
            ? "border-warning/50 bg-warning/10"
            : "border-base-300 bg-base-200/40"
        }`}
      >
        {scheduled ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums">
                {formatUsd(plan.cost.costPerMonthUsd)}
              </span>
              <span className="text-sm text-base-content/70">per month</span>
            </div>
            <p className="mt-1 text-xs text-base-content/70">
              This runs on its own from now on, at{" "}
              {formatUsd(plan.cost.costPerCheckUsd)} per run. Nothing is charged
              when you press Set up — the first charge is the first scheduled
              run.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums">
                {formatUsd(plan.cost.costPerCheckUsd)}
              </span>
              <span className="text-sm text-base-content/70">
                per run, only when you run it
              </span>
            </div>
            <p className="mt-1 text-xs text-base-content/70">
              Manual tracking never runs by itself, so setting this up costs
              nothing and nothing recurs. Pick a schedule above if you want
              these checked automatically.
            </p>
          </>
        )}
      </div>

      {plan.eligible.length > 0 ? (
        <p className="text-xs text-base-content/55">
          Each city is checked at its own location, so Austin&rsquo;s ranks come
          from Austin. Uses {capUsed.toLocaleString()} of your{" "}
          {plan.configCap.toLocaleString()} tracked domains.
        </p>
      ) : null}

      {skipCounts.size > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-base-content/50" />
          <ul className="min-w-0 space-y-0.5 text-base-content/70">
            {[...skipCounts.entries()].map(([reason, count]) => (
              <li key={reason}>
                {count.toLocaleString()} skipped —{" "}
                {SKIP_LABELS[reason] ?? reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/40 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-base-content/60">{label}</div>
    </div>
  );
}
