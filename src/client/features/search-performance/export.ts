import { buildCsv, downloadCsv, type CsvValue } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import type {
  Report,
  SearchPerformanceTableRow,
} from "./SearchPerformanceColumns";
import type {
  SearchPerformanceProvenance,
  SearchPerformanceTableDimension,
} from "@/types/schemas/search-performance";
export type ExportTarget = "csv" | "sheets";

type ExportTable = {
  filename: string;
  headers: string[];
  rows: CsvValue[][];
  resultCount?: number;
};

type ExportEvidence = {
  provenance?: SearchPerformanceProvenance;
  rowsExamined: number;
  truncated: boolean;
};

const EVIDENCE_HEADERS = [
  "Source",
  "Property",
  "Country",
  "Device",
  "Start Date",
  "End Date",
  "Search Type",
  "Data State",
  "Captured At",
  "Rows Examined",
  "Rows Exported",
  "Truncated",
  "Coverage",
];

function withExportEvidence(
  table: ExportTable,
  evidence?: ExportEvidence,
): ExportTable {
  const p = evidence?.provenance;
  const values: CsvValue[] = [
    p?.source ?? "unknown",
    p?.property ?? "unknown",
    p?.country ?? "unknown",
    p?.device ?? "unknown",
    p?.startDate ?? "unknown",
    p?.endDate ?? "unknown",
    p?.searchType ?? "unknown",
    p?.dataState ?? "unknown",
    p?.capturedAt ?? "unknown",
    evidence?.rowsExamined ?? "unknown",
    table.rows.length,
    evidence?.truncated ?? "unknown",
    "Search Console top rows; anonymized queries and other omitted detail are not included",
  ];
  // A metadata-only row retains the verified empty pull's scope and coverage.
  // Its observation cells stay empty and Rows Exported explicitly says zero.
  const rows =
    table.rows.length > 0 ? table.rows : [table.headers.map(() => "")];
  return {
    ...table,
    resultCount: table.rows.length,
    headers: [...table.headers, ...EVIDENCE_HEADERS],
    rows: rows.map((row) => [...row, ...values]),
  };
}

function strikingExportTable(report: Report): ExportTable {
  const stamp = `${report.range.startDate}-to-${report.range.endDate}`;
  return {
    filename: `search-performance-striking-distance-${stamp}.csv`,
    headers: ["Query", "Page", "Impressions", "Clicks", "Position"],
    rows: report.strikingDistance.map((row) => [
      row.query,
      row.page,
      row.impressions,
      row.clicks,
      row.position,
    ]),
  };
}

function dimensionExportTable(
  dimension: SearchPerformanceTableDimension,
  rows: SearchPerformanceTableRow[],
  stamp: string,
): ExportTable {
  const isPage = dimension === "page";
  return {
    filename: `search-performance-${isPage ? "pages" : "queries"}-${stamp}.csv`,
    headers: [
      isPage ? "Page" : "Query",
      "Clicks",
      "Impressions",
      "CTR",
      "Position",
    ],
    rows: rows.map((row) => [
      row.key,
      row.clicks,
      row.impressions,
      row.ctr,
      row.position,
    ]),
  };
}

function runExport(table: ExportTable, target: ExportTarget): void {
  if (target === "csv") {
    downloadCsv(
      table.filename,
      buildCsv(table.headers, table.rows, { preservePrecision: true }),
    );
    captureClientEvent("data:export", {
      source_feature: "search_performance",
      result_count: table.resultCount ?? table.rows.length,
    });
    return;
  }
  void exportTableToSheets({
    headers: table.headers,
    rows: table.rows,
    feature: "search_performance",
    preservePrecision: true,
  });
}

export function exportStriking(report: Report, target: ExportTarget): void {
  runExport(
    withExportEvidence(strikingExportTable(report), {
      provenance: report.provenance,
      ...report.sampling.queryPages,
    }),
    target,
  );
}

/** Export the full queries/pages dataset (fetched separately, not the visible
 *  page) so pagination never truncates a download. */
export function exportDimensionRows(
  dimension: SearchPerformanceTableDimension,
  rows: SearchPerformanceTableRow[],
  range: Report["range"],
  target: ExportTarget,
  evidence?: ExportEvidence,
): void {
  const dates = evidence?.provenance ?? range;
  const stamp = `${dates.startDate}-to-${dates.endDate}`;
  runExport(
    withExportEvidence(dimensionExportTable(dimension, rows, stamp), evidence),
    target,
  );
}
