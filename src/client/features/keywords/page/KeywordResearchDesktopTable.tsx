import { useMemo } from "react";
import {
  createColumnHelper,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  AppDataTable,
  makeSelectionColumn,
  useAppTable,
  useSelectionAnchor,
} from "@/client/components/table/AppDataTable";
import {
  IntentBadge,
  SortHeader,
  type SortDir,
  type SortField,
} from "@/client/features/keywords/components";
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { TrendSparkline } from "@/client/components/TrendSparkline";
import { formatNumber } from "@/client/features/keywords/utils";
import { keywordRowNote } from "@/client/features/insights/verdicts/keywords";
import { formatGeoMetricLabel } from "@/client/features/geo/geoMetricLabel";
import { UserX } from "lucide-react";
import type { FitMap } from "@/client/features/keywords/hooks/useKeywordFiltering";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";
import type { ResolvedGeo } from "@/shared/geo/types";
import type { KeywordResearchRow } from "@/types/keywords";

/**
 * The one visual mark a fit verdict earns in the table.
 *
 * Only `wrong-customer` renders anything. "on-offer" and "adjacent" are the
 * expected cases and marking them would put an icon on nearly every row,
 * which is noise rather than signal -- and the row's position already carries
 * that information, since fit is the leading sort key.
 *
 * A bare muted glyph with a title, not a coloured badge: this table already
 * carries difficulty and intent badges, and a third competing colour would
 * make the row harder to read rather than more informative.
 */
function FitMarker({ fit }: { fit: FitResult | undefined }) {
  if (fit?.verdict !== "wrong-customer") return null;
  return (
    <UserX
      className="size-3.5 shrink-0 text-base-content/40"
      aria-label={fit.reason}
    >
      <title>{fit.reason}</title>
    </UserX>
  );
}
import { EmptyFilterResults } from "./keywordResearchDesktopFilters";

type Props = {
  activeFilterCount: number;
  filteredRows: KeywordResearchRow[];
  overviewKeyword: KeywordResearchRow | null;
  /** This project's own Ahrefs domain rating, for the "needs DR X+" note
   *  under each row's difficulty score. */
  ownDomainRating: number | null;
  /**
   * The geo CAPTURED for the run whose rows are on screen right now (see
   * useKeywordResearchController.ts's own `researchGeo`) -- never the live
   * scope control. Null before any search, and for a restored run recorded
   * before the geo bundle existed: both cases must render bare headers
   * (no suffix) rather than an assumed national one.
   *
   * Volume and CPC share `volume`'s geography -- both come back on the same
   * Google-Ads/Labs request, exactly like SerpOverviewPage.tsx's own
   * `formatGeoMetricLabel("CPC", geo.volume)`. Score (keyword difficulty)
   * and Intent share `difficulty`'s -- both are Labs-only, country-level
   * needs (resolveGeo.ts's own NATIONAL_ONLY set), so a separately-resolved
   * "search-intent" geo would always equal this one; reusing it avoids a
   * redundant resolve for an identical result.
   */
  researchGeo: { volume: ResolvedGeo; difficulty: ResolvedGeo } | null;
  /** Per-keyword business-fit verdicts. Empty when the project has no usable
   *  profile, in which case no row shows a marker at all. */
  fit: FitMap;
  selectedRows: Set<string>;
  setSelectedRows: (rows: Set<string>) => void;
  sortDir: SortDir;
  sortField: SortField;
  toggleSort: (field: SortField) => void;
  resetFilters: () => void;
  handleRowClick: (row: KeywordResearchRow) => void;
};

const keywordColumnHelper = createColumnHelper<KeywordResearchRow>();

export function KeywordResearchDesktopTable({
  activeFilterCount,
  filteredRows,
  overviewKeyword,
  ownDomainRating,
  researchGeo,
  fit,
  selectedRows,
  setSelectedRows,
  sortDir,
  sortField,
  toggleSort,
  resetFilters,
  handleRowClick,
}: Props) {
  const selectAnchorRef = useSelectionAnchor();
  const rowSelection = useMemo<RowSelectionState>(
    () =>
      Object.fromEntries(
        [...selectedRows].map((keyword) => [keyword, true]),
      ) as RowSelectionState,
    [selectedRows],
  );
  // Bare labels (no suffix) when no run geo is captured -- never an assumed
  // national one. See this file's own Props doc comment for why CPC reuses
  // `volume` and Intent reuses `difficulty`.
  const volumeLabel = researchGeo
    ? formatGeoMetricLabel("Volume", researchGeo.volume)
    : "Volume";
  const cpcLabel = researchGeo
    ? formatGeoMetricLabel("CPC", researchGeo.volume)
    : "CPC";
  const scoreLabel = researchGeo
    ? formatGeoMetricLabel("Score", researchGeo.difficulty)
    : "Score";
  const intentLabel = researchGeo
    ? formatGeoMetricLabel("Intent", researchGeo.difficulty)
    : "Intent";
  const columns = useMemo<ColumnDef<KeywordResearchRow>[]>(
    () => [
      makeSelectionColumn<KeywordResearchRow>(selectAnchorRef),
      keywordColumnHelper.accessor("keyword", {
        header: () => (
          <SortHeader
            label="Keyword"
            field="keyword"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="min-w-48 md:min-w-0"
          />
        ),
        cell: ({ row }) => (
          <span
            className="flex min-w-48 items-center gap-1.5 md:min-w-0"
            title={row.original.keyword}
          >
            <span className="whitespace-normal break-words font-medium capitalize md:truncate">
              {row.original.keyword}
            </span>
            <FitMarker fit={fit.get(row.original.keyword)} />
          </span>
        ),
        meta: {
          headerClassName: "min-w-48 md:min-w-0",
          cellClassName: "min-w-48 md:min-w-0",
        },
      }),
      keywordColumnHelper.accessor("searchVolume", {
        header: () => (
          <SortHeader
            label={volumeLabel}
            field="searchVolume"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="justify-end"
          />
        ),
        cell: ({ getValue }) => formatNumber(getValue()),
        meta: {
          headerClassName: "text-right",
          cellClassName:
            "whitespace-nowrap text-right tabular-nums text-base-content/70",
        },
      }),
      keywordColumnHelper.accessor("trend", {
        id: "trend",
        header: () => (
          <span title="Monthly search volume over the last 12 months">
            Trend
          </span>
        ),
        enableSorting: false,
        cell: ({ getValue }) => <TrendSparkline points={getValue()} />,
        meta: {
          headerClassName: "text-center",
          cellClassName: "whitespace-nowrap text-center",
        },
      }),
      keywordColumnHelper.accessor("cpc", {
        header: () => (
          <SortHeader
            label={cpcLabel}
            helpText="Cost per click in USD."
            field="cpc"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="justify-end"
          />
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? "-" : value.toFixed(2);
        },
        meta: {
          headerClassName: "text-right",
          cellClassName:
            "whitespace-nowrap text-right tabular-nums text-base-content/70",
        },
      }),
      keywordColumnHelper.accessor("competition", {
        header: () => (
          <SortHeader
            label="Comp."
            helpText="Paid-search competition from Google Ads (0-1): higher means more advertisers bidding."
            field="competition"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="justify-end"
          />
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? "-" : value.toFixed(2);
        },
        meta: {
          headerClassName: "text-right",
          cellClassName:
            "whitespace-nowrap text-right tabular-nums text-base-content/70",
        },
      }),
      keywordColumnHelper.accessor("keywordDifficulty", {
        header: () => (
          <SortHeader
            label={scoreLabel}
            helpText="Organic ranking difficulty (0-100): higher means harder to reach Google's top 10."
            field="keywordDifficulty"
            current={sortField}
            dir={sortDir}
            onToggle={toggleSort}
            className="justify-end"
          />
        ),
        cell: ({ getValue }) => {
          const rowNote = keywordRowNote(
            { keywordDifficulty: getValue() },
            { ownDomainRating },
          );
          return (
            <div>
              <DifficultyBadge value={getValue()} />
              {rowNote ? (
                <div className="text-xs text-base-content/45">{rowNote}</div>
              ) : null}
            </div>
          );
        },
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
      }),
      keywordColumnHelper.accessor("intent", {
        header: () => <span>{intentLabel}</span>,
        cell: ({ getValue }) => <IntentBadge intent={getValue()} />,
        meta: {
          headerClassName: "text-center",
          cellClassName: "whitespace-nowrap text-center",
        },
      }),
    ],
    [
      cpcLabel,
      fit,
      intentLabel,
      ownDomainRating,
      scoreLabel,
      selectAnchorRef,
      sortDir,
      sortField,
      toggleSort,
      volumeLabel,
    ],
  );
  const table = useAppTable({
    data: filteredRows,
    columns,
    state: { rowSelection },
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater;
      setSelectedRows(
        new Set(
          Object.entries(next)
            .filter(([, selected]) => selected)
            .map(([keyword]) => keyword),
        ),
      );
    },
    getRowId: (row) => row.keyword,
    enableRowSelection: true,
  });

  return (
    <div className="flex-1 min-h-0">
      {filteredRows.length === 0 ? (
        <EmptyFilterResults
          activeFilterCount={activeFilterCount}
          resetFilters={resetFilters}
        />
      ) : (
        <AppDataTable
          table={table}
          className="table table-xs min-w-max md:w-full"
          wrapperClassName="h-full overflow-auto"
          getRowProps={(row) => ({
            className: `cursor-pointer border-b border-base-200 hover:bg-base-200/50 ${
              overviewKeyword?.keyword === row.original.keyword
                ? "bg-primary/5 border-l-2 border-l-primary"
                : ""
            }`,
            onClick: () => handleRowClick(row.original),
          })}
        />
      )}
    </div>
  );
}
