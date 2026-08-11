import { ArrowUpRight, ClipboardCheck, Lightbulb, Wrench } from "lucide-react";
import { InsightTile } from "@/client/components/InsightTile";
import { quickWinHint, type Opportunity } from "./opportunityModel";

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
  technicalSourcesFailed,
  technicalIssueCount,
  affectedPages,
  totalClicksAtStake,
}: {
  opportunities: Opportunity[];
  sourcesUnavailable: boolean;
  sampled: boolean;
  technicalSourcesFailed: boolean;
  technicalIssueCount: number;
  affectedPages: number;
  totalClicksAtStake: number;
}) {
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
        label="Clicks at stake"
        value={sourcesUnavailable ? "—" : totalClicksAtStake.toLocaleString()}
        hint={
          sampled
            ? "Estimated monthly, if everything listed here is fixed"
            : "Estimated monthly, if all are fixed"
        }
        tone="success"
      />
      <InsightTile
        icon={Wrench}
        label="Technical issues"
        value={technicalSourcesFailed ? "—" : technicalIssueCount}
        tone={technicalIssueCount > 0 ? "warning" : "neutral"}
      />
      <InsightTile
        icon={ClipboardCheck}
        label="Pages affected"
        value={technicalSourcesFailed ? "—" : affectedPages.toLocaleString()}
        hint="Across the last audit"
      />
    </div>
  );
}
