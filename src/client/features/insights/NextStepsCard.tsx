import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleCheck,
  CircleHelp,
  TriangleAlert,
} from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import type { Verdict, VerdictTone } from "./types";

/**
 * The "what this means and what to do" block, rendered under a tab's results.
 *
 * Deliberately absent from empty states: a tab with no data has nothing
 * defensible to say, and filling the space with generic advice would teach
 * users to ignore this card everywhere.
 */

const TONE_ICON = {
  good: CircleCheck,
  mixed: TriangleAlert,
  bad: TriangleAlert,
  unknown: CircleHelp,
} as const;

const TONE_STYLE: Record<
  VerdictTone,
  "success" | "warning" | "error" | "neutral"
> = {
  good: "success",
  mixed: "warning",
  bad: "error",
  unknown: "neutral",
};

export function NextStepsCard({ verdict }: { verdict: Verdict }) {
  const Icon = TONE_ICON[verdict.tone];
  const actions = verdict.actions.toSorted((a, b) => b.weight - a.weight);

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <h2 className="flex items-start gap-1.5 text-sm font-semibold">
          <InsightIcon icon={Icon} tone={TONE_STYLE[verdict.tone]} />
          <span className="font-normal text-base-content/80">
            {verdict.read}
          </span>
        </h2>

        {actions.length > 0 ? (
          <ul className="space-y-2">
            {actions.map((action) => (
              <li key={action.label} className="flex items-start gap-2 text-sm">
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-base-content/45" />
                <div className="min-w-0">
                  {action.to ? (
                    <Link
                      {...action.to}
                      className="font-medium hover:underline"
                    >
                      {action.label}
                    </Link>
                  ) : (
                    <span className="font-medium">{action.label}</span>
                  )}
                  <p className="text-xs text-base-content/55">
                    {action.evidence}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
