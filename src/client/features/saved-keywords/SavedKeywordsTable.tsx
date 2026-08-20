import { FitMarker } from "@/client/features/profiles/FitMarker";
import {
  createColumnHelper,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AppDataTable,
  makeSelectionColumn,
  useAppTable,
  useSelectionAnchor,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { IntentBadge } from "@/client/features/keywords/components";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";
import type { KeywordIntent, SavedKeywordRow } from "@/types/keywords";
import { TagChip } from "./TagChip";
import {
  formatSavedKeywordDate,
  formatSavedKeywordNumber,
} from "./savedKeywordsUtils";

const columnHelper = createColumnHelper<SavedKeywordRow>();

/**
 * The one visual mark a fit verdict earns, deliberately identical in shape to
 * Keyword Research's own (`KeywordResearchDesktopTable`): only
 * `wrong-customer` renders anything, because marking the expected cases would
 * put an icon on nearly every row. A bare muted glyph rather than a coloured
 * badge -- this table already carries difficulty, intent and tag colours.
 */

export function SavedKeywordsTable({
  rows,
  rowSelection,
  sorting,
  isLoading,
  hasActiveFilters,
  projectId,
  fit,
  onRowSelectionChange,
  onSortingChange,
}: {
  rows: SavedKeywordRow[];
  rowSelection: RowSelectionState;
  sorting: SortingState;
  isLoading: boolean;
  hasActiveFilters: boolean;
  projectId: string;
  /** Verdicts for the rows on this page. Empty when the project has no
   *  usable profile, in which case no row is marked at all. Computed by the
   *  page rather than here so the marker, the hide-wrong-fit filter and its
   *  count can never disagree about the same row. */
  fit: ReadonlyMap<string, FitResult>;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onSortingChange: OnChangeFn<SortingState>;
}) {
  const selectAnchorRef = useSelectionAnchor();
  const columns = useMemo<ColumnDef<SavedKeywordRow>[]>(
    () => [
      makeSelectionColumn<SavedKeywordRow>(selectAnchorRef),
      columnHelper.accessor("keyword", {
        header: ({ column }) => (
          <SortableHeader column={column} label="Keyword" />
        ),
        cell: ({ getValue }) => (
          <span className="flex items-center gap-1.5">
            <span className="font-medium">{getValue()}</span>
            <FitMarker fit={fit.get(getValue())} />
          </span>
        ),
      }),
      columnHelper.accessor("searchVolume", {
        header: ({ column }) => (
          <SortableHeader column={column} label="Volume" />
        ),
        cell: ({ getValue }) => formatSavedKeywordNumber(getValue()),
      }),
      columnHelper.accessor("cpc", {
        header: ({ column }) => <SortableHeader column={column} label="CPC" />,
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? "-" : `$${value.toFixed(2)}`;
        },
      }),
      columnHelper.accessor("competition", {
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="Competition"
            helpText="Paid-search competition from Google Ads (0-1): higher means more advertisers bidding."
          />
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? "-" : value.toFixed(2);
        },
      }),
      columnHelper.accessor("keywordDifficulty", {
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="Difficulty"
            helpText="Organic ranking difficulty (0-100): higher means harder to reach Google's top 10."
          />
        ),
        cell: ({ getValue }) => <DifficultyBadge value={getValue()} />,
      }),
      columnHelper.accessor("intent", {
        header: () => "Intent",
        cell: ({ getValue }) => (
          <IntentBadge intent={normalizeIntent(getValue())} />
        ),
        enableSorting: false,
      }),
      columnHelper.display({
        id: "tags",
        header: () => "Tags",
        cell: ({ row }) => <TagList tags={row.original.tags} />,
        enableSorting: false,
        meta: { cellClassName: "min-w-40 max-w-64" },
      }),
      columnHelper.accessor("fetchedAt", {
        header: ({ column }) => (
          <SortableHeader column={column} label="Last Fetched" />
        ),
        cell: ({ getValue }) => (
          <span className="text-xs text-base-content/55">
            {formatSavedKeywordDate(getValue())}
          </span>
        ),
      }),
    ],
    [fit, selectAnchorRef],
  );
  const table = useAppTable({
    data: rows,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange,
    onSortingChange,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    manualSorting: true,
  });

  return (
    <AppDataTable
      table={table}
      isLoading={isLoading}
      loading={<SavedKeywordsSkeleton />}
      empty={
        <SavedKeywordsEmptyState
          hasActiveFilters={hasActiveFilters}
          projectId={projectId}
        />
      }
    />
  );
}

function normalizeIntent(value: string | null): KeywordIntent {
  switch (value) {
    case "informational":
    case "commercial":
    case "transactional":
    case "navigational":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function TagList({ tags }: { tags: SavedKeywordRow["tags"] }) {
  if (tags.length === 0) {
    return <span className="text-base-content/35">-</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} size="xs" />
      ))}
    </div>
  );
}

function SavedKeywordsSkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="skeleton h-4 w-48" />
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="grid grid-cols-9 items-center gap-3">
          <div className="skeleton h-4" />
          <div className="skeleton col-span-2 h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
        </div>
      ))}
    </div>
  );
}

function SavedKeywordsEmptyState({
  hasActiveFilters,
  projectId,
}: {
  hasActiveFilters: boolean;
  projectId: string;
}) {
  return (
    <div className="py-12 text-center text-sm text-base-content/55">
      <MagnifyingGlass className="mx-auto mb-2 size-8 opacity-40" />
      {hasActiveFilters ? (
        <p>No saved keywords match the current filters.</p>
      ) : (
        // This is the tab's entire first-run experience, and it named the
        // destination without offering a way to get there.
        <p>
          No saved keywords yet. Find and save some in{" "}
          <Link
            to="/p/$projectId/keywords"
            params={{ projectId }}
            className="app-link"
          >
            Keyword Research
          </Link>
          .
        </p>
      )}
    </div>
  );
}
