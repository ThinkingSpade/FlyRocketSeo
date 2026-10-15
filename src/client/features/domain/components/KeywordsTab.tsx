import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Download,
  FileXls,
  FloppyDisk,
  Table,
} from "@phosphor-icons/react";
import {
  TableBulkActionBar,
  TableBulkActionButton,
  TableBulkExportMenu,
} from "@/client/components/table/TableBulkActionBar";
import { DomainKeywordsPagination } from "@/client/features/domain/components/DomainKeywordsPagination";
import { DomainKeywordsTable } from "@/client/features/domain/components/DomainKeywordsTable";
import { DomainFilterPanel } from "@/client/features/domain/components/DomainFilterPanel";
import { DomainTableTabSurface } from "@/client/features/domain/components/DomainTableTabSurface";
import { useKeywordsTabExports } from "@/client/features/domain/components/useKeywordsTabExports";
import { saveSelectedKeywords } from "@/client/features/domain/domainActions";
import {
  KEYWORD_FILTER_FIELDS,
  buildKeywordsSearchUpdate,
  countKeywordFilterConditions,
} from "@/client/features/domain/domainFilterUtils";
import {
  debugDomain,
  useDomainRenderDebug,
} from "@/client/features/domain/domainDebug";
import { useDomainKeywordsQuery } from "@/client/features/domain/hooks/useDomainKeywordsQuery";
import { useSaveKeywordsMutation } from "@/client/features/domain/mutations";
import { useDomainKeywordFilterPreferences } from "@/client/features/domain/useDomainFilterPreferences";
import {
  type DomainSortMode,
  type KeywordRow,
  type KeywordsFilterValues,
} from "@/client/features/domain/types";
import type { DomainOverviewRouteState } from "@/client/features/domain/domainRouteState";
import {
  MAX_DATAFORSEO_FILTER_CONDITIONS,
  type DomainSearchParams,
} from "@/types/schemas/domain";
import {
  createMeteredRunKey,
  useAuthorizedRun,
} from "@/client/lib/useMeteredQuery";
import { Button } from "@cloudflare/kumo/components/button";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

type SearchUpdate = Partial<DomainSearchParams>;

const EMPTY_KEYWORDS: KeywordRow[] = [];
const KEYWORD_TEXT_FILTERS = [
  {
    key: "include",
    label: "Include Terms",
    placeholder: "audit, checker, template",
  },
  {
    key: "exclude",
    label: "Exclude Terms",
    placeholder: "jobs, salary, course",
  },
] as const;
const KEYWORD_RANGE_FILTERS = [
  { title: "Traffic", minKey: "minTraffic", maxKey: "maxTraffic" },
  { title: "Volume", minKey: "minVol", maxKey: "maxVol" },
  { title: "CPC (USD)", minKey: "minCpc", maxKey: "maxCpc", step: "0.01" },
  { title: "Score (KD)", minKey: "minKd", maxKey: "maxKd" },
  { title: "Rank", minKey: "minRank", maxKey: "maxRank" },
] as const;

type Props = {
  projectId: string;
  domain: string;
  languageCode: string;
  routeState: DomainOverviewRouteState;
  canSaveKeywords: boolean;
  setSearchParams: (updates: SearchUpdate) => void;
  onSortClick: (sort: DomainSortMode) => void;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextSize: number) => void;
};

export function KeywordsTab({
  projectId,
  domain,
  languageCode,
  routeState,
  canSaveKeywords,
  setSearchParams,
  onSortClick,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const queryClient = useQueryClient();
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
    new Set(),
  );
  const [showFilters, setShowFilters] = useState(false);
  const filterPreferences = useDomainKeywordFilterPreferences(
    `${projectId}:${domain}`,
  );
  const {
    filters: preferredFilters,
    save: savePreferredFilters,
    clear: clearPreferredFilters,
  } = filterPreferences;
  const appliedFilters = routeState.hasAppliedKeywordFilters
    ? routeState.appliedFilters
    : preferredFilters;
  const run = useAuthorizedRun(
    createMeteredRunKey(
      projectId,
      domain,
      routeState.subdomains,
      routeState.locationCode,
      languageCode,
      routeState.page,
      routeState.pageSize,
      routeState.sort,
      routeState.order,
      appliedFilters,
    ),
  );

  const query = useDomainKeywordsQuery({
    projectId,
    domain,
    includeSubdomains: routeState.subdomains,
    locationCode: routeState.locationCode,
    languageCode,
    page: routeState.page,
    pageSize: routeState.pageSize,
    sortMode: routeState.sort,
    sortOrder: routeState.order,
    appliedFilters,
    enabled: Boolean(domain),
    authorized: run.authorized,
    runNonce: run.runNonce,
  });

  const rows = query.data?.keywords ?? EMPTY_KEYWORDS;
  const totalCount = query.data?.totalCount ?? null;
  const hasNextPage = query.data?.hasMore ?? false;
  const isLoading = query.isFetching;
  const showTableLoading = isLoading && (showFilters || rows.length === 0);
  useDomainRenderDebug("KeywordsTab", {
    showFilters,
    isLoading,
    isPending: query.isPending,
    rows: rows.length,
    totalCount,
    selectedCount: selectedKeywords.size,
    activeTab: routeState.tab,
    page: routeState.page,
    sort: routeState.sort,
    order: routeState.order,
  });

  const visibleKeywords = useMemo(() => rows.map((r) => r.keyword), [rows]);
  useEffect(() => {
    const visibleSet = new Set(visibleKeywords);
    setSelectedKeywords((prev) => {
      const next = new Set([...prev].filter((k) => visibleSet.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleKeywords]);

  const toggleKeywordSelection = useCallback((keyword: string) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }, []);

  const saveMutation = useSaveKeywordsMutation({ projectId, queryClient });
  const handleSaveKeywords = useCallback(() => {
    if (saveMutation.isPending) return;
    saveSelectedKeywords({
      selectedKeywords,
      filteredKeywords: rows,
      save: saveMutation.mutate,
      projectId,
      locationCode: routeState.locationCode,
      languageCode,
    });
  }, [
    languageCode,
    projectId,
    routeState.locationCode,
    rows,
    saveMutation.mutate,
    saveMutation.isPending,
    selectedKeywords,
  ]);

  const applyFilters = useCallback(
    (values: KeywordsFilterValues) => {
      if (
        countKeywordFilterConditions(values) > MAX_DATAFORSEO_FILTER_CONDITIONS
      )
        return;
      const update = buildKeywordsSearchUpdate(values);
      debugDomain("KeywordsTab:apply-filters", { values, update });
      savePreferredFilters(values);
      setSearchParams(update);
    },
    [savePreferredFilters, setSearchParams],
  );

  const resetFilters = useCallback(() => {
    const update: SearchUpdate = { page: undefined };
    for (const key of KEYWORD_FILTER_FIELDS) update[key] = undefined;
    debugDomain("KeywordsTab:reset-filters", { update });
    clearPreferredFilters();
    setSearchParams(update);
  }, [clearPreferredFilters, setSearchParams]);

  const activeFilterCount = useMemo(
    () =>
      KEYWORD_FILTER_FIELDS.filter((k) => appliedFilters[k].trim() !== "")
        .length,
    [appliedFilters],
  );

  const capture = query.data;
  const {
    handleCopy,
    handleExportToSheets,
    handleDownload,
    handleExportSelectionToSheets,
    handleDownloadSelectionCsv,
  } = useKeywordsTabExports({ domain, rows, capture, selectedKeywords });

  return (
    <>
      {capture ? (
        <p className="px-4 py-2 text-xs text-base-content/60">
          DataForSEO Labs estimates for {capture.domain} · Captured{" "}
          {capture.fetchedAt.slice(0, 10)} (UTC). Provider target scope may
          include subdomains; the requested toggle does not exclude them. This
          is one loaded result page.
        </p>
      ) : null}
      {!run.authorized ? (
        <div className="border-b border-base-300 p-4 text-center">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => run.authorize()}
          >
            Load keywords
          </Button>
          <p className="mt-2 text-xs text-base-content/70">
            Uses research data from your provider. This may incur a charge.
          </p>
        </div>
      ) : null}
      <TableBulkActionBar
        selectedCount={selectedKeywords.size}
        onClear={() => setSelectedKeywords(new Set())}
        actions={
          <div className="flex items-center px-1.5">
            <TableBulkActionButton
              icon={<FloppyDisk className="size-3.5" />}
              onClick={handleSaveKeywords}
              disabled={!canSaveKeywords || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save keywords"}
            </TableBulkActionButton>
            <TableBulkExportMenu
              actions={[
                {
                  label: "Export to Sheets",
                  icon: <Table className="size-4" />,
                  onClick: handleExportSelectionToSheets,
                },
                {
                  label: "Download CSV",
                  icon: <Download className="size-4" />,
                  onClick: handleDownloadSelectionCsv,
                },
              ]}
            />
          </div>
        }
      />

      <DomainTableTabSurface
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((prev) => !prev)}
        activeFilterCount={activeFilterCount}
        countLabel="keywords"
        totalCount={totalCount}
        fallbackCount={rows.length}
        isLoading={isLoading}
        showTableLoading={showTableLoading}
        awaitingRun={!run.authorized}
        error={
          query.isError ? (
            <InlineQueryError
              message={getStandardErrorMessage(query.error)}
              onRetry={() => run.authorize()}
              retrying={isLoading}
              retryLabel="Retry · uses paid data"
            />
          ) : undefined
        }
        exportActions={[
          {
            label: "Export to Sheets",
            icon: <Table className="size-4" />,
            onClick: handleExportToSheets,
          },
          {
            label: "Copy data (JSON)",
            icon: <Copy className="size-4" />,
            onClick: handleCopy,
          },
          {
            label: "Download CSV",
            icon: <Download className="size-4" />,
            onClick: () => handleDownload("csv"),
          },
          {
            label: "Download Excel",
            icon: <FileXls className="size-4" />,
            onClick: () => handleDownload("xls"),
          },
        ]}
        filterPanel={
          showFilters ? (
            <DomainFilterPanel
              debugName="KeywordsFilterPanel"
              activeFilterCount={activeFilterCount}
              appliedFilters={appliedFilters}
              fields={KEYWORD_FILTER_FIELDS}
              textFields={KEYWORD_TEXT_FILTERS}
              rangeFields={KEYWORD_RANGE_FILTERS}
              countConditions={countKeywordFilterConditions}
              onApply={applyFilters}
              onClear={resetFilters}
            />
          ) : null
        }
        pagination={
          <DomainKeywordsPagination
            rowCount={rows.length}
            page={routeState.page}
            pageSize={routeState.pageSize}
            totalCount={totalCount}
            hasNextPage={hasNextPage}
            isLoading={isLoading}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        }
      >
        <DomainKeywordsTable
          domain={domain}
          rows={rows}
          selectedKeywords={selectedKeywords}
          visibleKeywords={visibleKeywords}
          sortMode={routeState.sort}
          currentSortOrder={routeState.order}
          onSortClick={onSortClick}
          onToggleKeyword={toggleKeywordSelection}
        />
      </DomainTableTabSurface>
    </>
  );
}
