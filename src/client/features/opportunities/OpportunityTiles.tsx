import {
  ArrowUpRight,
  ClipboardText,
  Lightbulb,
  Wrench,
} from "@phosphor-icons/react";
import { InsightTile } from "@/client/components/InsightTile";
import { quickWinHint, type Opportunity } from "./opportunityModel";
import type { TechnicalAuditState } from "./technicalAuditState";

const AUDIT_HINT: Record<TechnicalAuditState, string> = {
  loading: "Loading audit evidence",
  "not-run": "No completed site audit",
  unavailable: "Audit evidence unavailable — retry below",
  empty: "No page evidence in the completed audit",
  ready: "Unique URLs in the last completed audit",
};

/**
 * The four headline tiles above the ranked action list.
 *
 * Split out of OpportunitiesPage when that file reached this repo's 400-line
 * ceiling. It renders purely from props and holds no state, which made it the
 * natural seam.
 *
 * The two "unavailable" flags stay separate on purpose: the GSC sources and
 * the audit fail independently, and a run that could read one but not the
 * other must show a figure for the half it knows and an em dash for the half
 * it does not, rather than blanking or guessing both.
 */
export function OpportunityTiles({
  opportunities,
  sourcesUnavailable,
  sampled,
  technicalState,
  technicalIssueCount,
  affectedPages,
  largestClickScenario,
}: {
  opportunities: Opportunity[];
  sourcesUnavailable: boolean;
  sampled: boolean;
  technicalState: TechnicalAuditState;
  technicalIssueCount: number;
  affectedPages: number;
  largestClickScenario: number;
}) {
  const technicalSourcesUnavailable = technicalState !== "ready";
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <InsightTile
        icon={Lightbulb}
        label="Opportunities"
        value={sourcesUnavailable ? "—" : opportunities.length}
        // Hint goes too: "3 quick wins" beside a "—" would state a figure the
        // run never established.
        hint={sourcesUnavailable ? undefined : quickWinHint(opportunities)}
        tone="primary"
      />
      <InsightTile
        icon={ArrowUpRight}
        label="Largest click scenario"
        value={sourcesUnavailable ? "—" : largestClickScenario.toLocaleString()}
        hint={
          sourcesUnavailable
            ? "Search Console evidence unavailable"
            : sampled
              ? "Partial rows; hypothetical 28-day gain, not a forecast"
              : "Hypothetical 28-day gain, not a forecast"
        }
        tone="success"
      />
      <InsightTile
        icon={Wrench}
        label="Technical checks"
        value={technicalSourcesUnavailable ? "—" : technicalIssueCount}
        hint={
          technicalSourcesUnavailable
            ? AUDIT_HINT[technicalState]
            : "Categories needing review"
        }
        tone={
          !technicalSourcesUnavailable && technicalIssueCount > 0
            ? "warning"
            : "neutral"
        }
      />
      <InsightTile
        icon={ClipboardText}
        label="Pages affected"
        value={
          technicalSourcesUnavailable ? "—" : affectedPages.toLocaleString()
        }
        hint={AUDIT_HINT[technicalState]}
      />
    </div>
  );
}
