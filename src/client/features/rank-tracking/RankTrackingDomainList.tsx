import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  Globe,
  Plus,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  getRankTrackingConfigSummaries,
  updateRankTrackingConfig,
} from "@/serverFunctions/rank-tracking";
import { devicesLabel, scheduleLabel } from "@/shared/rank-tracking";
import { Modal } from "@/client/components/Modal";
import {
  applyDomainListFilters,
  countActiveDomainListFilters,
  DomainListFilterBar,
  EMPTY_DOMAIN_LIST_FILTERS,
  getDomainListFilterOptions,
  type DomainListFilters,
} from "./RankTrackingFilters";
import { getGeoLocationsByCodes } from "@/serverFunctions/geo";
import {
  locationCodesNeedingLookup,
  resolveRankTrackingLocationLabels,
} from "./rankTrackingLocationLabel";
import { Button } from "@cloudflare/kumo/components/button";

type ConfigSummary = Awaited<
  ReturnType<typeof getRankTrackingConfigSummaries>
>[number];

// Below this many domains the list is short enough to scan by eye, so the
// filter controls are more chrome than help. Still shown if filters are active
// (e.g. archiving dropped the count) so they never get orphaned.
const FILTER_BAR_MIN_DOMAINS = 6;

export function RankTrackingDomainList({
  projectId,
  onAddDomain,
}: {
  projectId: string;
  onAddDomain: () => void;
}) {
  const queryClient = useQueryClient();
  const [archiveTarget, setArchiveTarget] = useState<ConfigSummary | null>(
    null,
  );
  const [filters, setFilters] = useState<DomainListFilters>(
    EMPTY_DOMAIN_LIST_FILTERS,
  );
  const { data: summaries } = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });
  const allSummaries = useMemo(() => summaries ?? [], [summaries]);
  const filteredSummaries = useMemo(
    () => applyDomainListFilters(allSummaries, filters),
    [allSummaries, filters],
  );
  const filterOptions = useMemo(
    () => getDomainListFilterOptions(allSummaries),
    [allSummaries],
  );
  const activeFilterCount = countActiveDomainListFilters(filters);

  // One batched read for the whole list rather than one per row: this list is
  // unpaginated and a project may hold up to MAX_CONFIGS_PER_PROJECT configs,
  // so per-row resolution would fan out to that many POSTs on a single render.
  // Keyed off ALL summaries, not the filtered subset, so changing a filter
  // re-labels from cache instead of issuing a new query. Free D1 read, and
  // skipped entirely for an all-country project (the common case).
  const codesNeedingLookup = useMemo(
    () => locationCodesNeedingLookup(allSummaries.map((s) => s.locationCode)),
    [allSummaries],
  );
  const { data: geoRows, isError: geoFailed } = useQuery({
    queryKey: ["geo-locations-by-codes", codesNeedingLookup],
    queryFn: () =>
      getGeoLocationsByCodes({ data: { codes: codesNeedingLookup } }),
    enabled: codesNeedingLookup.length > 0,
  });
  // An empty array means "resolved, and these are all the rows there are".
  // That is the right input both when nothing needed looking up (every code is
  // a country) and when the read FAILED with nothing cached: a failure then
  // degrades to "unrecognised" exactly as a confirmed-absent row does, rather
  // than leaving the bare-code placeholder standing as the final answer
  // forever -- see UNRECOGNISED_GEO_CODE_LABEL in rankTrackingConfigArea.
  //
  // Rows already retained from an earlier success WIN over that fallback,
  // though. TanStack Query keeps `data` and sets isError when a background
  // refetch of stale data fails, and discarding it there would flip a list of
  // real metro names to "Unrecognised location" while the detail header (whose
  // useConfigAreaLookup checks data before isError) still showed them. Built
  // inside the memo so the empty-array literal isn't a fresh dep every render.
  const locationLabels = useMemo(() => {
    let rows = geoRows;
    if (codesNeedingLookup.length === 0) rows = [];
    else if (rows === undefined && geoFailed) rows = [];
    return resolveRankTrackingLocationLabels(
      allSummaries.map((s) => s.locationCode),
      rows,
    );
  }, [allSummaries, codesNeedingLookup, geoFailed, geoRows]);

  const archiveMutation = useMutation({
    mutationFn: (configId: string) =>
      updateRankTrackingConfig({
        data: { projectId, configId, isActive: false },
      }),
    onSuccess: () => {
      setArchiveTarget(null);
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingConfigSummaries", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingConfigs", projectId],
      });
      toast.success("Domain archived");
    },
  });

  return (
    <div className="relative flex flex-col rounded-xl bg-base-100 border border-base-300">
      <div className="flex flex-auto flex-col gap-0 p-0 text-sm">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">Tracked Domains</h2>
          <Button variant="primary" size="sm" onClick={onAddDomain}>
            <Plus className="size-3.5" />
            Add Domain
          </Button>
        </div>
        {(allSummaries.length >= FILTER_BAR_MIN_DOMAINS ||
          activeFilterCount > 0) && (
          <DomainListFilterBar
            filters={filters}
            options={filterOptions}
            activeFilterCount={activeFilterCount}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_DOMAIN_LIST_FILTERS)}
          />
        )}
        <div className="divide-y divide-base-300 border-t border-base-300">
          {allSummaries.length === 0 ? (
            <div className="px-5 py-10 text-center space-y-2">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-base-200">
                <Globe className="size-5 text-base-content/40" />
              </div>
              <p className="text-sm font-medium text-base-content/70">
                No tracked domains yet
              </p>
              <p className="text-xs text-base-content/40">
                Add a domain to start monitoring keyword rankings over time.
              </p>
            </div>
          ) : filteredSummaries.length === 0 ? (
            <div className="px-5 py-10 text-center space-y-3">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-base-200">
                <Search className="size-5 text-base-content/40" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-base-content/70">
                  No matching tracked domains
                </p>
                <p className="text-xs text-base-content/40">
                  Try clearing search or adjusting filters.
                </p>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setFilters(EMPTY_DOMAIN_LIST_FILTERS)}
                disabled={activeFilterCount === 0}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            filteredSummaries.map((summary) => (
              <DomainRow
                key={summary.id}
                projectId={projectId}
                summary={summary}
                locationLabel={
                  locationLabels.get(summary.locationCode) ??
                  String(summary.locationCode)
                }
                onArchive={() => setArchiveTarget(summary)}
              />
            ))
          )}
        </div>
      </div>

      {archiveTarget && (
        <Modal
          onClose={() => setArchiveTarget(null)}
          labelledBy="archive-domain-title"
        >
          <h3 id="archive-domain-title" className="text-lg font-semibold">
            Archive {archiveTarget.domain}?
          </h3>
          <p className="text-sm text-base-content/70">
            Scheduled checks will stop and this domain will be hidden from the
            list. Ranking history is preserved.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setArchiveTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => archiveMutation.mutate(archiveTarget.id)}
              disabled={archiveMutation.isPending}
            >
              <Archive className="size-3.5" />
              Archive
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DomainRow({
  projectId,
  summary,
  locationLabel,
  onArchive,
}: {
  projectId: string;
  summary: ConfigSummary;
  locationLabel: string;
  onArchive: () => void;
}) {
  return (
    <div className="relative flex w-full items-center gap-4 px-5 py-3.5 transition-colors hover:bg-base-200/50">
      <Link
        to="/p/$projectId/rank-tracking/$configId"
        params={{ projectId, configId: summary.id }}
        className="absolute inset-0 z-0"
        aria-label={`Open ${summary.domain}`}
      />
      <div className="min-w-0 flex-1 pointer-events-none">
        <p className="font-medium truncate">{summary.domain}</p>
        <p className="text-xs text-base-content/60">
          {locationLabel} &middot; {devicesLabel(summary.devices)} &middot;{" "}
          {scheduleLabel(summary.scheduleInterval)}
          {summary.lastRunCompletedAt && (
            <>
              {" "}
              &middot; Last:{" "}
              {new Date(summary.lastRunCompletedAt).toLocaleDateString()}
            </>
          )}
        </p>
        {summary.lastSkipReason === "insufficient_credits" && (
          <p className="flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="size-3" />
            Scheduled check skipped — insufficient credits
          </p>
        )}
      </div>
      <div className="hidden sm:flex items-center gap-6 text-sm pointer-events-none">
        {summary.keywordCount > 0 && (
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-base-content/60">
              Keywords
            </p>
            <p className="font-mono font-medium">{summary.keywordCount}</p>
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="text-base-content/40 hover:text-error relative z-10"
        title="Archive domain"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onArchive();
        }}
      >
        <Archive className="size-4" />
      </Button>
      <ChevronRight className="size-4 shrink-0 text-base-content/40 pointer-events-none" />
    </div>
  );
}
