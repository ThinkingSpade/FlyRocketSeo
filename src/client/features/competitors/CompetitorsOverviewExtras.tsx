import type { CompetitorRow } from "@/types/schemas/competitors";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import { buildCompetitorsVerdict } from "@/client/features/insights/verdicts/competitors";
import { CompetitorsPositioningMap } from "./CompetitorsPositioningMap";

/**
 * The positioning map and the "which rival to chase" verdict, shown together
 * above the raw competitors table -- pulled out of CompetitorsPage itself to
 * keep that file under the line-count cap, not because these two belong to a
 * different feature.
 *
 * Both read data the page already fetched (rows), so neither spends. The map
 * additionally fetches its own domain-overview bubble, which IS metered --
 * that's why the call site keys this off the live target rather than a
 * restored run, same as before this extraction.
 */
export function CompetitorsOverviewExtras({
  projectId,
  target,
  rows,
}: {
  projectId: string;
  target: string;
  rows: CompetitorRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <>
      <CompetitorsPositioningMap
        projectId={projectId}
        target={target}
        rows={rows}
      />
      <NextStepsCard
        verdict={buildCompetitorsVerdict({ target, competitors: rows })}
        projectId={projectId}
        tab="Competitors"
      />
    </>
  );
}
