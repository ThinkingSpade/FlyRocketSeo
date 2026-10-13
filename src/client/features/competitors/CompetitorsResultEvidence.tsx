import { Button } from "@cloudflare/kumo/components/button";
import { downloadCsv } from "@/client/lib/csv";
import {
  buildCompetitorResultCsv,
  competitorResultContext,
  type CompetitorResult,
} from "./competitorResultExport";

import type {
  CompetitorsPage,
  CompetitorRow,
  CompetitorsTab,
} from "@/types/schemas/competitors";
import type {
  KeywordGapPage,
  LinkGapPage,
} from "@/server/features/competitors/services/CompetitorsService";
export function CompetitorsResultEvidence({
  tab,
  competitors,
  restored,
  rows,
  gap,
  links,
}: {
  tab: CompetitorsTab;
  competitors: CompetitorsPage | undefined;
  restored: CompetitorsPage | undefined;
  rows: CompetitorRow[];
  gap: KeywordGapPage | undefined;
  links: LinkGapPage | undefined;
}) {
  let result: CompetitorResult | undefined;
  if (tab === "competitors")
    result = competitors ? { ...competitors, rows } : restored;
  else result = tab === "gap" ? gap : links;
  if (!result) return null;
  const context = competitorResultContext(result);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-base-content/60">
      <p>
        {context.source} · Captured {context.capturedAt} · Target{" "}
        {context.target ?? "unrecorded"}
        {context.competitor ? ` compared with ${context.competitor}` : ""}
        {context.locationCode
          ? ` · National market ${context.locationCode}/${context.languageCode}`
          : " · Market unrecorded"}
        . This is a provider sample; missing metrics are unknown.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={result.rows.length === 0}
        onClick={() =>
          downloadCsv(
            "competitor-comparison.csv",
            buildCompetitorResultCsv(result),
          )
        }
      >
        Export comparison CSV
      </Button>
    </div>
  );
}
