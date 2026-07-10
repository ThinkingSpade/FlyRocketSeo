import { buildCsv, type CsvValue, downloadCsv } from "@/client/lib/csv";
import type {
  CompetitorRow,
  KeywordGapRow,
  LinkGapRow,
} from "@/server/features/competitors/services/CompetitorsService";
import type {
  CompetitorsTab,
  KeywordGapMode,
} from "@/types/schemas/competitors";

// Raw numeric values (not display strings) so Sheets/CSV consumers can sort
// and aggregate; null renders as an empty cell.

export function competitorsTableExport(rows: CompetitorRow[]): {
  headers: string[];
  rows: CsvValue[][];
} {
  return {
    headers: [
      "Competitor",
      "Shared Keywords",
      "Avg Position",
      "Organic Keywords",
      "Organic Traffic",
    ],
    rows: rows.map((row) => [
      row.domain,
      row.intersections,
      row.avgPosition,
      row.organicKeywords,
      row.organicTraffic,
    ]),
  };
}

export function keywordGapTableExport(
  rows: KeywordGapRow[],
  targetLabel: string,
  competitorLabel: string,
): { headers: string[]; rows: CsvValue[][] } {
  return {
    headers: [
      "Keyword",
      "Volume",
      "KD",
      "CPC",
      `${targetLabel} Rank`,
      `${competitorLabel} Rank`,
    ],
    rows: rows.map((row) => [
      row.keyword,
      row.searchVolume,
      row.keywordDifficulty,
      row.cpc,
      row.targetRank,
      row.competitorRank,
    ]),
  };
}

export function linkGapTableExport(rows: LinkGapRow[]): {
  headers: string[];
  rows: CsvValue[][];
} {
  return {
    headers: [
      "Referring Domain",
      "Domain Rank",
      "Links to Competitor",
      "Spam Score",
      "First Seen",
    ],
    rows: rows.map((row) => [
      row.referringDomain,
      row.rank,
      row.backlinksToCompetitor,
      row.spamScore,
      row.firstSeen,
    ]),
  };
}

function slugifyDomain(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildCompetitorsCsvFilename(args: {
  tab: CompetitorsTab;
  target: string;
  competitor: string;
  mode: KeywordGapMode;
}): string {
  const target = slugifyDomain(args.target);
  const competitor = slugifyDomain(args.competitor);
  if (args.tab === "competitors") {
    return `competitors${target ? `-${target}` : ""}.csv`;
  }
  const vs = `${target}-vs-${competitor}`;
  return args.tab === "gap"
    ? `keyword-gap-${vs}-${args.mode}.csv`
    : `link-gap-${vs}.csv`;
}

export function exportCompetitorsCsv(args: {
  tab: CompetitorsTab;
  target: string;
  competitor: string;
  mode: KeywordGapMode;
  headers: string[];
  rows: CsvValue[][];
}) {
  downloadCsv(
    buildCompetitorsCsvFilename(args),
    buildCsv(args.headers, args.rows),
  );
}
