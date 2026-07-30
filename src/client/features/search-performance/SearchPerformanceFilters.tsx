import { Download, Loader2, Sheet } from "lucide-react";
import { TableExportMenu } from "@/client/components/table/TableBulkActionBar";
import {
  GSC_DEVICES,
  SEARCH_PERFORMANCE_RANGES,
  type SearchPerformanceDateRange,
  type SearchPerformanceDevice,
} from "@/types/schemas/search-performance";
import type { ExportTarget } from "@/client/features/search-performance/SearchPerformanceParts";

/** Sentinel for "no filter" in the selects; never sent to the server. */
export const ALL = "ALL";

export type DeviceFilter = SearchPerformanceDevice | typeof ALL;

const RANGE_LABELS: Record<SearchPerformanceDateRange, string> = {
  last_7_days: "Last 7 days",
  last_28_days: "Last 28 days",
  last_3_months: "Last 3 months",
};
const RANGE_OPTIONS = SEARCH_PERFORMANCE_RANGES.map((value) => ({
  value,
  label: RANGE_LABELS[value],
}));

const DEVICE_LABELS: Record<SearchPerformanceDevice, string> = {
  DESKTOP: "Desktop",
  MOBILE: "Mobile",
  TABLET: "Tablet",
};
const DEVICE_OPTIONS = GSC_DEVICES.map((value) => ({
  value,
  label: DEVICE_LABELS[value],
}));

function isDateRange(value: string): value is SearchPerformanceDateRange {
  return SEARCH_PERFORMANCE_RANGES.some((option) => option === value);
}

function isDevice(value: string): value is SearchPerformanceDevice {
  return GSC_DEVICES.some((option) => option === value);
}

/**
 * The device / country / range selects and the export menu.
 *
 * Split out of `SearchPerformancePage` so the page reads as the lifecycle it
 * owns rather than as markup. The country list is a prop because only the report
 * knows which countries the property actually has traffic from.
 */
export function SearchPerformanceFilters({
  device,
  onDeviceChange,
  country,
  onCountryChange,
  countryKeys,
  range,
  onRangeChange,
  refreshing,
  onExport,
}: {
  device: DeviceFilter;
  onDeviceChange: (next: DeviceFilter) => void;
  country: string;
  onCountryChange: (next: string) => void;
  countryKeys: readonly string[];
  range: SearchPerformanceDateRange;
  onRangeChange: (next: SearchPerformanceDateRange) => void;
  /** A background refresh over data already on screen. Deliberately a spinner
   *  beside the controls rather than a loading state: blanking a populated panel
   *  to re-render the same numbers is worse than a moment of staleness. */
  refreshing: boolean;
  onExport: (target: ExportTarget) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {refreshing ? (
        <Loader2 className="size-4 animate-spin text-base-content/40" />
      ) : null}
      <select
        className="select select-bordered select-sm w-36"
        value={device}
        onChange={(event) => {
          onDeviceChange(
            isDevice(event.target.value) ? event.target.value : ALL,
          );
        }}
        aria-label="Device filter"
      >
        <option value={ALL}>All devices</option>
        {DEVICE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        className="select select-bordered select-sm w-36"
        value={country}
        onChange={(event) => onCountryChange(event.target.value)}
        aria-label="Country filter"
      >
        <option value={ALL}>All countries</option>
        {countryKeys.map((key) => (
          <option key={key} value={key}>
            {key.toUpperCase()}
          </option>
        ))}
      </select>
      <select
        className="select select-bordered select-sm w-36"
        value={range}
        onChange={(event) => {
          if (isDateRange(event.target.value)) {
            onRangeChange(event.target.value);
          }
        }}
        aria-label="Date range"
      >
        {RANGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <TableExportMenu
        buttonClassName="btn btn-ghost btn-sm gap-1"
        actions={[
          {
            label: "Export to Sheets",
            icon: <Sheet className="size-4" />,
            onClick: () => onExport("sheets"),
          },
          {
            label: "Download CSV",
            icon: <Download className="size-4" />,
            onClick: () => onExport("csv"),
          },
        ]}
      />
    </div>
  );
}
