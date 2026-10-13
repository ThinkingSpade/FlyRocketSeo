import { buildCsv, type CsvValue } from "@/client/lib/csv";
import type { CompetitorsPage } from "@/types/schemas/competitors";
import type {
  KeywordGapPage,
  LinkGapPage,
} from "@/server/features/competitors/services/CompetitorsService";
export type CompetitorResult = CompetitorsPage | KeywordGapPage | LinkGapPage;

export function competitorResultContext(result: CompetitorResult) {
  const scope = result.scope;
  const source =
    "source" in result
      ? result.source
      : (result.provider ?? "Saved competitor result (provider unrecorded)");
  const competitor = scope && "competitor" in scope ? scope.competitor : null;
  const locationCode =
    scope && "locationCode" in scope ? scope.locationCode : null;
  const languageCode =
    scope && "languageCode" in scope ? scope.languageCode : null;
  return {
    source,
    capturedAt: result.fetchedAt,
    projectId: scope?.projectId ?? null,
    target: scope?.target ?? null,
    competitor,
    locationCode,
    languageCode,
  };
}

export function buildCompetitorResultCsv(result: CompetitorResult) {
  const context = competitorResultContext(result);
  let headers: string[];
  let rows: CsvValue[][];
  if ("source" in result && result.source === "DataForSEO Labs") {
    headers = [
      "Keyword",
      "Search volume",
      "CPC",
      "Keyword difficulty",
      "Competition",
      "Target rank",
      "Competitor rank",
      "Mode",
    ];
    rows = result.rows.map((row) => [
      row.keyword,
      row.searchVolume,
      row.cpc,
      row.keywordDifficulty,
      row.competition,
      row.targetRank,
      row.competitorRank,
      result.scope.mode,
    ]);
  } else if ("source" in result && result.source === "DataForSEO Backlinks") {
    headers = [
      "Referring domain",
      "DataForSEO domain rank (0-100)",
      "Backlinks to competitor",
      "Spam score",
      "First seen",
    ];
    rows = result.rows.map((row) => [
      row.referringDomain,
      row.rank,
      row.backlinksToCompetitor,
      row.spamScore,
      row.firstSeen,
    ]);
  } else {
    headers = [
      "Competitor",
      "Average position",
      "Shared keywords",
      "Organic keywords",
      "Estimated traffic",
      "Seed coverage",
      "Outranks GSC average (heuristic)",
      "Position delta (heuristic)",
      "Discovery",
      "Pinned",
      "Seed size",
    ];
    rows = result.rows.map((row) => [
      row.domain,
      row.avgPosition,
      row.intersections,
      row.organicKeywords,
      row.organicTraffic,
      row.coverage,
      row.beatsYouCount,
      row.positionDelta,
      result.discoveryMode,
      row.pinned,
      result.seedSize,
    ]);
  }
  const metadata = [
    context.source,
    context.capturedAt,
    context.projectId,
    context.target,
    context.competitor,
    context.locationCode,
    context.languageCode,
    result.totalCount,
    "This provider page; project exclusions/pins applied",
  ];
  return buildCsv(
    [
      ...headers,
      "Source",
      "Captured at",
      "Project ID",
      "Target",
      "Compared domain",
      "Location code",
      "Language",
      "Provider total count",
      "Export scope",
    ],
    rows.map((row) => [...row, ...metadata]),
    { preservePrecision: true },
  );
}
