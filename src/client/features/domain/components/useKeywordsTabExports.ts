import { useMemo } from "react";
import { toast } from "sonner";
import type { KeywordRow } from "@/client/features/domain/types";
import { keywordsToTable } from "@/client/features/domain/utils";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";

type Capture = Parameters<typeof keywordsToTable>[1];

/** Copy, Sheets and file exports for the Domain Overview keywords tab --
 *  the whole table and the current selection, both precision-preserving. */
export function useKeywordsTabExports({
  domain,
  rows,
  capture,
  selectedKeywords,
}: {
  domain: string;
  rows: KeywordRow[];
  capture: Capture;
  selectedKeywords: Set<string>;
}) {
  const exportTable = useMemo(
    () => keywordsToTable(rows, capture),
    [rows, capture],
  );
  const selectedExportTable = useMemo(
    () =>
      keywordsToTable(
        rows.filter((r) => selectedKeywords.has(r.keyword)),
        capture,
      ),
    [rows, selectedKeywords, capture],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
      toast.success("Copied data");
    } catch {
      toast.error(
        "Could not copy. Allow clipboard access or download CSV instead.",
      );
    }
  };
  const handleExportToSheets = () => {
    void exportTableToSheets({
      headers: exportTable.headers,
      rows: exportTable.rows,
      feature: "domain_overview",
      preservePrecision: true,
    });
  };
  const handleDownload = (extension: "csv" | "xls") => {
    downloadCsv(
      `${domain}-keywords.${extension}`,
      buildCsv(exportTable.headers, exportTable.rows, {
        preservePrecision: true,
      }),
    );
    if (extension === "csv") {
      captureClientEvent("data:export", {
        source_feature: "domain_overview",
        result_count: rows.length,
      });
    }
  };
  const handleExportSelectionToSheets = () => {
    void exportTableToSheets({
      headers: selectedExportTable.headers,
      rows: selectedExportTable.rows,
      feature: "domain_overview",
      preservePrecision: true,
    });
  };
  const handleDownloadSelectionCsv = () => {
    downloadCsv(
      `${domain}-selected-keywords.csv`,
      buildCsv(selectedExportTable.headers, selectedExportTable.rows, {
        preservePrecision: true,
      }),
    );
    captureClientEvent("data:export", {
      source_feature: "domain_overview",
      result_count: selectedKeywords.size,
      scope: "selection",
    });
  };

  return {
    handleCopy,
    handleExportToSheets,
    handleDownload,
    handleExportSelectionToSheets,
    handleDownloadSelectionCsv,
  };
}
