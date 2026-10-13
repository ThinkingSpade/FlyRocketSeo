import type {
  DomainSortMode,
  KeywordRow,
  PageRow,
  SortOrder,
} from "@/client/features/domain/types";
import { isValidDomainHost } from "@/types/schemas/domain";

export function toSortMode(value: string | null): DomainSortMode | undefined {
  if (
    value === "rank" ||
    value === "traffic" ||
    value === "volume" ||
    value === "score" ||
    value === "cpc"
  ) {
    return value;
  }
  return undefined;
}

export function toSortOrder(value: string | null): SortOrder | undefined {
  if (value === "asc" || value === "desc") return value;
  return undefined;
}

export function getDefaultSortOrder(sortMode: DomainSortMode): SortOrder {
  return sortMode === "rank" ? "asc" : "desc";
}

export function resolveSortOrder(
  sortMode: DomainSortMode,
  sortOrder: SortOrder | undefined,
): SortOrder {
  return sortOrder ?? getDefaultSortOrder(sortMode);
}

export function toSortSearchParam(
  sortMode: DomainSortMode,
): DomainSortMode | undefined {
  return sortMode === "traffic" ? undefined : sortMode;
}

export function toSortOrderSearchParam(
  sortMode: DomainSortMode,
  sortOrder: SortOrder,
): SortOrder | undefined {
  return sortOrder === getDefaultSortOrder(sortMode) ? undefined : sortOrder;
}

export function toPageSortMode(
  sortMode: DomainSortMode,
): "traffic" | "keywords" {
  if (sortMode === "volume") return "keywords";
  return "traffic";
}

export function normalizeDomainTarget(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)
    ? value
    : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || !hostname.includes(".")) return null;
    if (!/^[a-z\d.-]+$/.test(hostname)) return null;
    if (!isValidDomainHost(hostname)) return null;

    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${hostname}${path}`;
  } catch {
    return null;
  }
}

export function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(value);
}

export function formatRounded(value: number | null | undefined) {
  if (value == null) return "-";
  if (value > 0 && value < 1) return "<1";
  return new Intl.NumberFormat().format(Math.round(value));
}

export function formatMetric(
  value: number | null | undefined,
  hasData: boolean | undefined,
) {
  if (!hasData) return "Not enough data";
  return formatRounded(value);
}

type ExportTable = {
  headers: string[];
  rows: (string | number | boolean | null)[][];
};
type DomainCapture = {
  source: string;
  domain: string;
  fetchedAt: string;
  scope?: {
    locationCode: number;
    languageCode: string;
    includeSubdomains: boolean;
    providerScope: string;
  };
};
const CAPTURE_HEADERS = [
  "Source",
  "Target",
  "Location Code",
  "Language",
  "Provider Scope",
  "Requested Subdomains",
  "Fetched At",
];
function captureCells(
  capture?: DomainCapture,
): (string | number | boolean | null)[] {
  return [
    capture?.source ?? "Unknown",
    capture?.domain ?? null,
    capture?.scope?.locationCode ?? null,
    capture?.scope?.languageCode ?? null,
    capture?.scope?.providerScope ?? "Unknown",
    capture?.scope?.includeSubdomains ?? null,
    capture?.fetchedAt ?? null,
  ];
}

export function keywordsToTable(
  rows: KeywordRow[],
  capture?: DomainCapture,
): ExportTable {
  return {
    headers: [
      "Keyword",
      "Rank",
      "Volume",
      "Traffic",
      "CPC",
      "URL",
      "Score",
      ...CAPTURE_HEADERS,
    ],
    rows: rows.map((row) => [
      row.keyword,
      row.position,
      row.searchVolume,
      row.traffic,
      row.cpc,
      row.url ?? row.relativeUrl,
      row.keywordDifficulty,
      ...captureCells(capture),
    ]),
  };
}

export function pagesToTable(
  rows: PageRow[],
  capture?: DomainCapture,
): ExportTable {
  return {
    headers: ["Page", "Organic Traffic", "Keywords", ...CAPTURE_HEADERS],
    rows: rows.map((row) => [
      row.page,
      row.organicTraffic,
      row.keywords,
      ...captureCells(capture),
    ]),
  };
}
