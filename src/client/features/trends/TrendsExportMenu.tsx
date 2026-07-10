import { useState } from "react";
import { ChevronDown, Download, Sheet } from "lucide-react";
import { buildCsv, downloadCsv, type CsvValue } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";

interface TrendPoint {
  timestamp: number;
  date: string;
  values: (number | null)[];
}

/** One row per sampled date: Date, then a 0–100 interest column per keyword. */
function trendsExportPayload(
  keywords: string[],
  points: TrendPoint[],
): { headers: string[]; rows: CsvValue[][] } {
  return {
    headers: ["Date", ...keywords],
    rows: points.map((point) => [point.date, ...point.values]),
  };
}

function trendsCsvFilename(keywords: string[]): string {
  const slug = keywords
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `keyword-trends${slug ? `-${slug}` : ""}.csv`;
}

export function TrendsExportMenu({
  keywords,
  points,
}: {
  keywords: string[];
  points: TrendPoint[];
}) {
  const [isExportingSheets, setIsExportingSheets] = useState(false);
  const canExport = points.length > 0 && !isExportingSheets;

  const handleExportToSheets = async () => {
    if (!canExport) return;
    setIsExportingSheets(true);
    try {
      const { headers, rows } = trendsExportPayload(keywords, points);
      await exportTableToSheets({ headers, rows, feature: "trends" });
    } finally {
      setIsExportingSheets(false);
    }
  };

  return (
    <div className="dropdown dropdown-end">
      <div
        tabIndex={0}
        role="button"
        className={`btn btn-sm btn-ghost gap-1 ${points.length === 0 ? "btn-disabled" : ""}`}
        aria-label="Export trend data"
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
            onClick={() => {
              const { headers, rows } = trendsExportPayload(keywords, points);
              downloadCsv(trendsCsvFilename(keywords), buildCsv(headers, rows));
            }}
            disabled={points.length === 0}
          >
            <Download className="size-4" />
            Export CSV
          </button>
        </li>
      </ul>
    </div>
  );
}
