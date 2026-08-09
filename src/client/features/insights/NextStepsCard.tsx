import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle,
  Question,
  Warning,
} from "@phosphor-icons/react";
import { InsightIcon } from "@/client/components/InsightTile";
import { useAiExplainAvailable } from "@/client/features/auth/useEmailVerificationBypassed";
import { ExplainButton } from "./ExplainButton";
import type { Verdict, VerdictTone } from "./types";

/**
 * The "what this means and what to do" block, rendered under a tab's results.
 *
 * Deliberately absent from empty states: a tab with no data has nothing
 * defensible to say, and filling the space with generic advice would teach
 * users to ignore this card everywhere.
 */

const TONE_ICON = {
  good: CheckCircle,
  mixed: Warning,
  bad: Warning,
  unknown: Question,
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

export function NextStepsCard({
  verdict,
  projectId,
  tab,
}: {
  verdict: Verdict;
  /** Both required together to opt this card into the "Explain this" button
   *  -- call sites not yet wired for it simply omit them. */
  projectId?: string;
  tab?: string;
}) {
  const Icon = TONE_ICON[verdict.tone];
  const actions = verdict.actions.toSorted((a, b) => b.weight - a.weight);
  // Root-loader-derived flag, not a fresh server call -- see
  // useAiExplainAvailable's own doc comment for why a prerendered `true`
  // still isn't trusted until the live refetch confirms it.
  const aiExplainAvailable = useAiExplainAvailable();

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
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

        {aiExplainAvailable && projectId != null && tab != null ? (
          <ExplainButton projectId={projectId} tab={tab} verdict={verdict} />
        ) : null}
      </div>
    </div>
  );
}
