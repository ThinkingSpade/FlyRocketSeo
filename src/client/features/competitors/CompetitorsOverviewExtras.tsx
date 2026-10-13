import type {
  CompetitorsPage,
  CompetitorRow,
  DiscoveryMode,
} from "@/types/schemas/competitors";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import { buildCompetitorsVerdict } from "@/client/features/insights/verdicts/competitors";
import { CompetitorsPositioningMap } from "./CompetitorsPositioningMap";

/**
 * The positioning map and the "which rival to chase" verdict, shown together
 * above the raw competitors table -- pulled out of CompetitorsPage itself to
 * keep that file under the line-count cap, not because these two belong to a
 * different feature.
 *
 * Both read the captured competitor rows without spending. The map restores
 * an existing domain overview and only compares it when the captured market
 * and target match; it never starts a paid overview request.
 *
 * `discoveryMode` (and, for the verdict, `seedSize`) come from the PAGE
 * (`pickDiscoveryDisclosure`), not a per-row `source` -- see
 * `buildCompetitorsVerdict`'s own doc comment for why a per-row read would
 * misclassify a synthesized pinned row.
 */
export function CompetitorsOverviewExtras({
  projectId,
  target,
  rows,
  discoveryMode,
  seedSize,
  livePage,
  restoredPage,
}: {
  projectId: string;
  target: string;
  rows: CompetitorRow[];
  discoveryMode: DiscoveryMode;
  seedSize: number;
  livePage: CompetitorsPage | undefined;
  restoredPage: { result: CompetitorsPage } | null;
}) {
  if (rows.length === 0) return null;
  const captured = livePage ?? restoredPage?.result;

  return (
    <>
      <CompetitorsPositioningMap
        projectId={projectId}
        target={target}
        rows={rows}
        discoveryMode={discoveryMode}
        scope={captured?.scope}
        fetchedAt={captured?.fetchedAt}
      />
      <NextStepsCard
        verdict={buildCompetitorsVerdict({
          target,
          competitors: rows,
          discoveryMode,
          seedSize,
        })}
        projectId={projectId}
        tab="Competitors"
      />
    </>
  );
}
