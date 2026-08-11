import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { writeHandoff } from "@/client/features/insights/handoffStore";
import { buildCompetitorsAuthorizationKey } from "./competitorsAuthorization";

/**
 * Wraps the generic `RestoredRunBanner` with this page's own "run it again"
 * action (fills the target box, records the handoff, and authorizes a fresh
 * run for the restored label). Pulled out of `CompetitorsPage` -- alongside
 * `CompetitorsOverviewExtras` and `CompetitorsRestoreNotice` -- to keep that
 * component under this repo's line-count lint cap; the props below are
 * exactly the ingredients that closure needs, threaded through rather than
 * built in the parent, so the closure's own lines count against this small
 * component's budget instead of the page's.
 */
export function CompetitorsRestoredRunBanner({
  restoredRun,
  projectId,
  searchState,
  authorize,
  updateSearch,
  setTargetInput,
}: {
  restoredRun: { label: string; lastRanAt: string; runCount: number } | null;
  projectId: string;
  searchState: Parameters<typeof buildCompetitorsAuthorizationKey>[1];
  authorize: (key: string) => void;
  updateSearch: (update: { target: string; page: number }) => void;
  setTargetInput: (value: string) => void;
}) {
  if (!restoredRun) return null;

  return (
    <RestoredRunBanner
      label={restoredRun.label}
      lastRanAt={restoredRun.lastRanAt}
      runCount={restoredRun.runCount}
      onRunAgain={() => {
        setTargetInput(restoredRun.label);
        writeHandoff(projectId, {
          kind: "domain",
          value: restoredRun.label,
          source: "Competitors",
          at: Date.now(),
        });
        authorize(
          buildCompetitorsAuthorizationKey(projectId, {
            ...searchState,
            target: restoredRun.label,
            page: 1,
          }),
        );
        updateSearch({ target: restoredRun.label, page: 1 });
      }}
    />
  );
}
