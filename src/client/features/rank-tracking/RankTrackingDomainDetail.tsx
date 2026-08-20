import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBillingCustomer } from "@/client/features/billing/useBillingCustomer";
import {
  getLatestRankResults,
  getRankPositionMatrix,
  estimateRankCheckCost,
} from "@/serverFunctions/rank-tracking";
import { Warning, ArrowLeft } from "@phosphor-icons/react";
import { useSession } from "@/lib/auth-client";
import { getCustomerPlanStatus } from "@/client/features/billing/plan-detection";
import { captureClientEvent } from "@/client/lib/posthog";
import { FreePlanAlert } from "./FreePlanAlert";
import { RankTrackingDetailHeader } from "./RankTrackingDetailHeader";
import { RankTrackingOverview } from "./RankTrackingOverview";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { RankTrackingTable } from "./RankTrackingTable";
import {
  countMatrixRuns,
  RankTrackingHistoryMatrix,
} from "./RankTrackingHistoryMatrix";
import { RankTrackingScoreboard } from "./RankTrackingScoreboard";
import { RankFluctuationCard } from "./RankFluctuationCard";
import { VisibilityTrendChart } from "./VisibilityTrendChart";
import { RankTrackingTableToolbar } from "./RankTrackingTableToolbar";
import {
  exportRankTrackingCsv,
  exportRankTrackingToSheets,
} from "./RankTrackingTableParts";
import type {
  RankTrackingConfig,
  ComparePeriod,
} from "@/types/schemas/rank-tracking";
import { AddKeywordsPanel } from "./AddKeywordsPanel";
import {
  FilterPanel,
  applyFilters,
  countActiveFilters,
  EMPTY_FILTERS,
  type Filters,
} from "./RankTrackingFilters";
import { CheckConfirmModal } from "./CheckConfirmModal";
import { resolveRankCheckAvailability } from "./rankCheckAvailability";
import { useMetricsRefresh } from "./useMetricsRefresh";
import { useRankCheckTrigger } from "./useRankCheckTrigger";
import { useRankRunPolling } from "./useRankRunPolling";
import { Button } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";

/** Null while the billing read is in flight, or before a session exists --
 *  the gate treats that as "unknown", never as "paid". Module scope purely so
 *  the branch does not count against the component's complexity budget. */
function resolvePlanStatus(
  customer: Parameters<typeof getCustomerPlanStatus>[0],
) {
  return customer ? getCustomerPlanStatus(customer) : null;
}

/** The keyword count a check would actually bill for. */
function checkableKeywordCount(
  costEstimate: { keywordCount: number } | undefined,
  rows: unknown[] | undefined,
): number {
  return costEstimate?.keywordCount ?? rows?.length ?? 0;
}

function deviceVisibility(
  devices: RankTrackingConfig["devices"],
  activeDevice: "desktop" | "mobile",
): { showDesktop: boolean; showMobile: boolean } {
  if (devices === "both") {
    return {
      showDesktop: activeDevice === "desktop",
      showMobile: activeDevice === "mobile",
    };
  }
  return {
    showDesktop: devices !== "mobile",
    showMobile: devices !== "desktop",
  };
}

export function RankTrackingDomainDetail({
  config,
  projectId,
  onBack,
  onEdit,
}: {
  config: RankTrackingConfig;
  projectId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const { data: session } = useSession();
  const customerQuery = useBillingCustomer({
    enabled: Boolean(session?.user?.id),
  });
  const planStatus = resolvePlanStatus(customerQuery.data);

  const queryClient = useQueryClient();
  const [showAddKeywords, setShowAddKeywords] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [comparePeriod, setComparePeriod] = useState<ComparePeriod>(
    config.scheduleInterval === "daily"
      ? "1d"
      : config.scheduleInterval === "monthly"
        ? "30d"
        : "7d",
  );
  const [activeDevice, setActiveDevice] = useState<"desktop" | "mobile">(
    config.devices === "mobile" ? "mobile" : "desktop",
  );
  const [viewMode, setViewMode] = useState<"table" | "history">("table");

  const {
    data: resultsData,
    isLoading: resultsLoading,
    isError: resultsError,
    error: resultsErrorValue,
    refetch: refetchResults,
    isFetching: resultsFetching,
  } = useQuery({
    queryKey: ["rankTrackingResults", projectId, config.id, comparePeriod],
    queryFn: () =>
      getLatestRankResults({
        data: { projectId, configId: config.id, comparePeriod },
      }),
  });

  const latestRun = useRankRunPolling(projectId, config.id);

  // Also feeds the History toggle: the matrix view only earns its tab once
  // there are two checks to compare.
  const {
    data: matrixCells,
    isLoading: matrixLoading,
    isError: matrixError,
  } = useQuery({
    queryKey: ["rankPositionMatrix", projectId, config.id, activeDevice],
    queryFn: () =>
      getRankPositionMatrix({
        data: { projectId, configId: config.id, device: activeDevice },
      }),
  });
  // A failed matrix read used to make this false, which silently removed the
  // History tab -- the evidence for hiding it was "the request did not come
  // back", not "there is only one run". Keep the tab and let the view report
  // its own failure rather than disappearing.
  const historyAvailable =
    matrixError || countMatrixRuns(matrixCells ?? []) >= 2;

  const { data: costEstimate } = useQuery({
    queryKey: ["rankTrackingCostEstimate", projectId, config.id],
    queryFn: () =>
      estimateRankCheckCost({ data: { projectId, configId: config.id } }),
  });

  const [pendingCheck, setPendingCheck] = useState<{
    count: number;
    keywordIds?: string[];
  } | null>(null);

  const handleKeywordsAdded = (result: {
    added: number;
    checkTriggered: boolean;
  }) => {
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingCostEstimate", projectId, config.id],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingResults", projectId, config.id],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingLatestRun", projectId, config.id],
    });
    setShowAddKeywords(false);
    captureClientEvent("rank_tracking:keywords_add");
    toast.success(
      `${result.added} keyword${result.added !== 1 ? "s" : ""} added`,
    );
    if (!result.checkTriggered && result.added > 0) {
      toast.info("Use 'Check Now' to check these keywords");
    }
  };

  const isRunning =
    (latestRun?.status === "pending" || latestRun?.status === "running") &&
    !latestRun?.maybeStale;
  const { startCheck, isBusy, isPending } = useRankCheckTrigger({
    configId: config.id,
    isRunning,
    projectId,
    onSuccess: () => setPendingCheck(null),
  });

  const { refresh: refreshMetrics, isRefreshing: metricsRefreshing } =
    useMetricsRefresh(projectId, config.id);

  const requestCheck = (count: number, keywordIds?: string[]) => {
    if (count < 50) {
      startCheck({ keywordIds });
      return;
    }

    if (isBusy) return;
    setPendingCheck({ count, keywordIds });
  };

  const rows = resultsData?.rows;
  const run = resultsData?.run;
  // The same count the click acts on, so the menu item can never be offered
  // for a check that would then be swallowed. See rankCheckAvailability.ts
  // for why the plan half of this must fail closed.
  const keywordCount = checkableKeywordCount(costEstimate, rows);
  const checkAvailability = resolveRankCheckAvailability({
    billingDisabled: customerQuery.billingDisabled,
    planReadFailed: customerQuery.isError,
    planStatus,
    keywordCount,
  });
  const hasBothDevices = config.devices === "both";
  const { showDesktop, showMobile } = deviceVisibility(
    config.devices,
    activeDevice,
  );
  const filtered = useMemo(
    () => applyFilters(rows ?? [], filters),
    [rows, filters],
  );
  const activeFilterCount = countActiveFilters(filters);
  const defaultSortId = showDesktop ? "desktopPosition" : "mobilePosition";
  // Fall back to the table if history disappears (e.g. device switch).
  const effectiveViewMode = historyAvailable ? viewMode : "table";

  return (
    <div className="space-y-3">
      <Button
        variant="ghost"
        size="xs"
        className="-ml-2 text-base-content/60"
        onClick={onBack}
      >
        <ArrowLeft className="size-3" />
        Back to domains
      </Button>

      {config.lastSkipReason === "insufficient_credits" && (
        <Banner variant="alert" className="text-sm py-2">
          <Warning className="size-4" />
          <span>
            Last scheduled check was skipped due to insufficient credits. Top up
            your balance to resume automatic tracking.
          </span>
        </Banner>
      )}

      {latestRun?.maybeStale && (
        <Banner variant="alert" className="text-sm py-2">
          <Warning className="size-4" />
          <span>
            This run may be unresponsive and will be cleaned up automatically.
          </span>
        </Banner>
      )}

      <FreePlanAlert visible={checkAvailability.showFreePlanAlert} />

      {/* Results card */}
      <div className="flex-1 flex flex-col min-w-0 border border-base-300 rounded-xl bg-base-100 overflow-hidden">
        {/* Domain header */}
        <RankTrackingDetailHeader
          config={config}
          run={run}
          costEstimate={costEstimate}
          hasBothDevices={hasBothDevices}
          activeDevice={activeDevice}
          onActiveDeviceChange={setActiveDevice}
          comparePeriod={comparePeriod}
          onComparePeriodChange={setComparePeriod}
          onEdit={onEdit}
          onToggleAddKeywords={() => setShowAddKeywords((c) => !c)}
        />

        {showAddKeywords && (
          <div className="px-4 pb-3">
            <AddKeywordsPanel
              configId={config.id}
              projectId={projectId}
              onSuccess={handleKeywordsAdded}
              onCancel={() => setShowAddKeywords(false)}
            />
          </div>
        )}

        {/* Portfolio overview */}
        {(rows?.length ?? 0) > 0 && (
          <>
            <RankTrackingScoreboard
              rows={rows ?? []}
              device={activeDevice}
              cells={matrixCells ?? []}
            />
            <RankTrackingOverview
              device={activeDevice}
              projectId={projectId}
              configId={config.id}
            />
            <RankFluctuationCard
              cells={matrixCells ?? []}
              rows={rows ?? []}
              serpDepth={config.serpDepth}
              projectId={projectId}
              isLoading={matrixLoading}
            />
          </>
        )}

        {/* Table toolbar */}
        <RankTrackingTableToolbar
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((c) => !c)}
          activeFilterCount={activeFilterCount}
          isRunning={isRunning}
          latestRun={latestRun}
          keywordCount={filtered.length}
          viewMode={effectiveViewMode}
          onViewModeChange={setViewMode}
          historyAvailable={historyAvailable}
          onExport={() =>
            exportRankTrackingCsv(
              filtered,
              showDesktop,
              showMobile,
              config.domain,
            )
          }
          onExportToSheets={() =>
            exportRankTrackingToSheets(filtered, showDesktop, showMobile)
          }
          onCopyKeywords={() => {
            void navigator.clipboard.writeText(
              filtered.map((r) => r.keyword).join("\n"),
            );
            toast.success("Keywords copied to clipboard");
          }}
          onCheckNow={() => requestCheck(keywordCount)}
          onRefreshMetrics={refreshMetrics}
          metricsRefreshing={metricsRefreshing}
          checkBusy={isBusy}
          checkBlockedReason={checkAvailability.blockedReason}
          hasData={filtered.length > 0}
        />

        {/* Filters panel */}
        {showFilters && (
          <FilterPanel
            filters={filters}
            setFilters={setFilters}
            activeFilterCount={activeFilterCount}
            onReset={() => setFilters(EMPTY_FILTERS)}
          />
        )}

        {/* Table */}
        <div className="p-4">
          {effectiveViewMode === "history" ? (
            <>
              <VisibilityTrendChart
                cells={matrixCells ?? []}
                volumeByKeywordId={
                  new Map(
                    (rows ?? []).map((r) => [
                      r.trackingKeywordId,
                      r.searchVolume,
                    ]),
                  )
                }
              />
              <RankTrackingHistoryMatrix
                cells={matrixCells ?? []}
                isLoading={matrixLoading}
                loadFailed={matrixError}
                keywords={filtered.map((r) => ({
                  trackingKeywordId: r.trackingKeywordId,
                  keyword: r.keyword,
                }))}
              />
            </>
          ) : resultsError ? (
            // Without this the failed read fell through to `rows = []`, and the
            // table announced 'No rank data yet. Click "Check Now" to run your
            // first check.' -- a first-run message shown to someone whose
            // rankings simply failed to load, and an invitation to spend on a
            // check they do not need.
            <InlineQueryError
              message={getStandardErrorMessage(resultsErrorValue)}
              onRetry={() => void refetchResults()}
              retrying={resultsFetching}
            />
          ) : (
            <RankTrackingTable
              key={defaultSortId}
              totalCount={rows?.length ?? 0}
              rows={filtered}
              resultsLoading={resultsLoading}
              showDesktop={showDesktop}
              showMobile={showMobile}
              defaultSortId={defaultSortId}
              domain={config.domain}
              configId={config.id}
              projectId={projectId}
              locationCode={config.locationCode}
              serpDepth={config.serpDepth}
            />
          )}
        </div>
      </div>

      {pendingCheck && (
        <CheckConfirmModal
          keywordCount={pendingCheck.count}
          devices={config.devices}
          serpDepth={config.serpDepth}
          isPending={isPending}
          onRunNow={() =>
            startCheck({
              keywordIds: pendingCheck.keywordIds,
            })
          }
          onCancel={() => setPendingCheck(null)}
        />
      )}
    </div>
  );
}
