import { useState } from "react";
import { ChevronDown, Download, Sheet } from "lucide-react";
import type { CsvValue } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import type {
  CompetitorsTab,
  KeywordGapMode,
} from "@/types/schemas/competitors";
import { exportCompetitorsCsv } from "./export";

/** Sheets/CSV export of the visible tab's rows. Each page of competitor data
 * is a paid DataForSEO call, so this exports what's loaded — the current
 * page — rather than silently re-fetching everything. */
export function CompetitorsExportMenu({
  tab,
  target,
  competitor,
  mode,
  headers,
  rows,
}: {
  tab: CompetitorsTab;
  target: string;
  competitor: string;
  mode: KeywordGapMode;
  headers: string[];
  rows: CsvValue[][];
}) {
  const [isExportingSheets, setIsExportingSheets] = useState(false);
  const canExport = rows.length > 0 && !isExportingSheets;

  const handleExportToSheets = async () => {
    if (!canExport) return;
    setIsExportingSheets(true);
    try {
      await exportTableToSheets({
        headers,
        rows,
        feature: `competitors_${tab}`,
      });
    } finally {
      setIsExportingSheets(false);
    }
  };

  return (
    <div className="dropdown dropdown-end">
      <div
        tabIndex={0}
        role="button"
        className={`btn btn-sm btn-ghost gap-1 ${rows.length === 0 ? "btn-disabled" : ""}`}
        aria-label="Export competitors table"
      >
        <Download className="size-4" />
        Export
        <ChevronDown className="size-3 opacity-60" />
      </div>
      <ul
        tabIndex={0}
        role="menu"
        className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-56"
      >
        <li>
          <button
            type="button"
            onClick={() => void handleExportToSheets()}
            disabled={!canExport}
          >
            {isExportingSheets ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Sheet className="size-4" />
            )}
            Export to Sheets
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() =>
              exportCompetitorsCsv({
                tab,
                target,
                competitor,
                mode,
                headers,
                rows,
              })
            }
            disabled={rows.length === 0}
          >
            <Download className="size-4" />
            Export CSV
          </button>
        </li>
      </ul>
    </div>
  );
}
