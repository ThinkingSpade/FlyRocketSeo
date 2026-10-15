import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowsClockwise,
  CircleNotch,
  Globe,
  MagnifyingGlass,
  Trash,
} from "@phosphor-icons/react";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Loader } from "@cloudflare/kumo/components/loader";
import { TablePagination } from "@/client/components/table/TablePagination";
import { ProjectSubdomainsTable } from "@/client/features/projects/ProjectSubdomainsTable";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { SUBDOMAIN_DISCOVERY_RAW_COST_USD } from "@/shared/analysis-costs";
import { applyBillingMarkupUsd } from "@/shared/billing";
import {
  projectSubdomainsQueryKey,
  useProjectSubdomainsQuery,
} from "@/client/features/projects/useProjectSubdomains";
import {
  addProjectSubdomain,
  discoverProjectSubdomains,
  removeProjectSubdomains,
  setProjectSubdomainsActive,
} from "@/serverFunctions/projectSubdomains";
import {
  SUBDOMAIN_GSC_RANGE_LABEL,
  type SubdomainDiscoverySource,
} from "@/shared/project-subdomains";

/** Row count past which the list gets a filter box. Below it, scanning the
 *  rows directly is faster than typing. */
const FILTER_THRESHOLD = 8;

// Hosted customers are billed the marked-up USD; self-hosted users pay
// DataForSEO directly at the raw rate. Measured floor; see analysis-costs.ts.
const ORGANIC_DISCOVERY_FROM_USD = isHostedClientAuthMode()
  ? applyBillingMarkupUsd(SUBDOMAIN_DISCOVERY_RAW_COST_USD)
  : SUBDOMAIN_DISCOVERY_RAW_COST_USD;

/** A city-site estate holds up to 2,000 hosts; render a page of them at once. */
const PAGE_SIZES = [50, 100, 250] as const;

export function ProjectSubdomainsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  // Same key the Site Audit and Rank Tracking pickers read from, so every edit
  // here refreshes what they offer instead of leaving them on a stale list.
  const queryKey = projectSubdomainsQueryKey(projectId);

  const subdomainsQuery = useProjectSubdomainsQuery(projectId);

  const [host, setHost] = React.useState("");
  const [filter, setFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(100);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    new Set<string>(),
  );

  // City Sites reads the same rows, so it refreshes with this list.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["citySites", projectId] }),
    ]);

  const addMutation = useMutation({
    mutationFn: () =>
      addProjectSubdomain({ data: { projectId, host: host.trim() } }),
    onSuccess: async (created) => {
      setHost("");
      await invalidate();
      toast.success(`Added ${created.host}`);
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to add subdomain")),
  });

  const discoverMutation = useMutation({
    mutationFn: (sources: SubdomainDiscoverySource[]) =>
      discoverProjectSubdomains({ data: { projectId, sources } }),
    onSuccess: async (result) => {
      await invalidate();
      // Every warning is a limit on what the run could see, so each one is
      // shown rather than collapsed -- a user reading "found 12" deserves to
      // know when 12 was a ceiling, not a total.
      for (const warning of result.warnings) toast.warning(warning);
      toast.success(
        result.added > 0
          ? `Added ${result.added} new subdomain${result.added === 1 ? "" : "s"} (${result.found} found)`
          : result.found > 0
            ? `No new subdomains — refreshed the ${result.refreshed} already on this project`
            : "No subdomains found",
      );
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "Failed to discover subdomains"),
      ),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { subdomainIds: string[]; isActive: boolean }) =>
      setProjectSubdomainsActive({ data: { projectId, ...input } }),
    onSuccess: async (_result, input) => {
      setSelected(new Set<string>());
      await invalidate();
      toast.success(input.isActive ? "Subdomains included" : "Excluded");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to update")),
  });

  const removeMutation = useMutation({
    mutationFn: (subdomainIds: string[]) =>
      removeProjectSubdomains({ data: { projectId, subdomainIds } }),
    onSuccess: async (result) => {
      setSelected(new Set<string>());
      await invalidate();
      toast.success(
        `Removed ${result.removed} subdomain${result.removed === 1 ? "" : "s"}`,
      );
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to remove")),
  });

  const data = subdomainsQuery.data;
  const subdomains = data?.subdomains ?? [];
  const apex = data?.apex ?? null;

  // Filtered on every render rather than memoized: `subdomains` comes from a
  // `?? []` fallback, so its identity changes each render and a memo keyed on
  // it would re-run anyway. A substring test across at most
  // MAX_SUBDOMAINS_PER_PROJECT rows costs less than the memo bookkeeping.
  const term = filter.trim().toLowerCase();
  const visible = term
    ? subdomains.filter((subdomain) => subdomain.host.includes(term))
    : subdomains;
  // Clamped rather than reset in an effect, so a filter or a removal that
  // shrinks the list lands on its last real page instead of an empty one.
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visible.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Selection is keyed by id and survives filtering and paging, so a user can
  // filter, select, re-filter, and act on the union. Bulk actions therefore
  // send the whole selection, not just what is on screen.
  const selectedIds = [...selected];
  const visibleIds = pageRows.map((s) => s.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const id of visibleIds) next.delete(id);
      else for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const isDiscovering = discoverMutation.isPending;
  const isBusy =
    isDiscovering || activeMutation.isPending || removeMutation.isPending;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-base-content/50">Subdomains</h2>
        {data ? (
          <span className="text-xs text-base-content/50">
            {subdomains.length} of {data.limit}
          </span>
        ) : null}
      </div>

      {subdomainsQuery.isPending ? (
        <div className="flex justify-center py-6">
          <Loader size="sm" />
        </div>
      ) : !apex ? (
        <Banner variant="default">
          Set the project domain above to add subdomains.
        </Banner>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">
                Find the subdomains of {apex}
              </p>
              <p className="text-sm text-base-content/60">
                Search Console finds every subdomain with impressions in the{" "}
                {SUBDOMAIN_GSC_RANGE_LABEL}. It is free and needs a connected{" "}
                <code className="text-xs">sc-domain:</code> property. Organic
                search also finds subdomains that rank on Google without Search
                Console, and is a paid DataForSEO request that costs more for
                sites with many ranking subdomains.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isBusy}
                onClick={() => discoverMutation.mutate(["gsc"])}
              >
                {isDiscovering &&
                discoverMutation.variables?.includes("gsc") ? (
                  <CircleNotch className="size-4 animate-spin" />
                ) : (
                  <ArrowsClockwise className="size-4" />
                )}
                Find subdomains (free)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => discoverMutation.mutate(["dataforseo"])}
              >
                {isDiscovering &&
                discoverMutation.variables?.includes("dataforseo") ? (
                  <CircleNotch className="size-4 animate-spin" />
                ) : null}
                Search organic results · from $
                {ORGANIC_DISCOVERY_FROM_USD.toFixed(2)}
              </Button>
            </div>
          </div>

          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!host.trim() || addMutation.isPending) return;
              addMutation.mutate();
            }}
          >
            <div className="relative flex min-w-56 flex-1 items-center">
              <Globe className="pointer-events-none absolute left-3 size-4 text-base-content/60" />
              <Input
                size="sm"
                aria-label="Subdomain host"
                className="w-full min-w-0 pl-9"
                placeholder={`blog.${apex}`}
                value={host}
                onChange={(event) => setHost(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!host.trim() || addMutation.isPending}
            >
              Add
            </Button>
          </form>

          {subdomains.length > FILTER_THRESHOLD ? (
            <div className="relative flex items-center">
              <MagnifyingGlass className="pointer-events-none absolute left-3 size-4 text-base-content/60" />
              <Input
                size="sm"
                aria-label="Filter subdomains"
                className="w-full pl-9"
                placeholder="Filter subdomains"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          ) : null}

          {selectedIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-base-200 px-3 py-2">
              <span className="text-sm">{selectedIds.length} selected</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={isBusy}
                  onClick={() =>
                    activeMutation.mutate({
                      subdomainIds: selectedIds,
                      isActive: true,
                    })
                  }
                >
                  Include
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={isBusy}
                  onClick={() =>
                    activeMutation.mutate({
                      subdomainIds: selectedIds,
                      isActive: false,
                    })
                  }
                >
                  Exclude
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-error"
                  disabled={isBusy}
                  onClick={() => removeMutation.mutate(selectedIds)}
                >
                  <Trash className="size-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          ) : null}

          {subdomains.length === 0 ? (
            <p className="text-sm text-base-content/60">
              No subdomains yet. Run discovery above, or add one by hand.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-base-content/60">
              No subdomains match “{filter}”.
            </p>
          ) : (
            <ProjectSubdomainsTable
              subdomains={pageRows}
              selected={selected}
              allVisibleSelected={allVisibleSelected}
              disabled={isBusy}
              onToggleOne={toggleOne}
              onToggleAll={toggleAllVisible}
              onSetActive={(id, isActive) =>
                activeMutation.mutate({ subdomainIds: [id], isActive })
              }
              onRemove={(id) => removeMutation.mutate([id])}
            />
          )}
          {visible.length > PAGE_SIZES[0] ? (
            <TablePagination
              page={currentPage}
              pageSize={pageSize}
              pageSizes={PAGE_SIZES}
              totalCount={visible.length}
              hasNextPage={currentPage < pageCount}
              isLoading={false}
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
