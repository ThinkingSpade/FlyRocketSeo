import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  addProjectSubdomain,
  discoverProjectSubdomains,
  getProjectSubdomains,
  removeProjectSubdomains,
  setProjectSubdomainsActive,
} from "@/serverFunctions/projectSubdomains";
import {
  SUBDOMAIN_GSC_RANGE_LABEL,
  SUBDOMAIN_SOURCE_LABELS,
  type SubdomainDiscoverySource,
} from "@/shared/project-subdomains";

/** Row count past which the list gets a filter box. Below it, scanning the
 *  rows directly is faster than typing. */
const FILTER_THRESHOLD = 8;

type Subdomain = Awaited<
  ReturnType<typeof getProjectSubdomains>
>["subdomains"][number];

function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

export function ProjectSubdomainsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["project-subdomains", projectId];

  const subdomainsQuery = useQuery({
    queryKey,
    queryFn: () => getProjectSubdomains({ data: { projectId } }),
  });

  const [host, setHost] = React.useState("");
  const [filter, setFilter] = React.useState("");
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    new Set<string>(),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

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

  // Selection is keyed by id and survives filtering, so a user can filter,
  // select, re-filter, and act on the union. Bulk actions therefore send the
  // whole selection, not just what is on screen.
  const selectedIds = [...selected];
  const visibleIds = visible.map((s) => s.id);
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
          <span className="loading loading-spinner loading-sm" />
        </div>
      ) : !apex ? (
        <div className="alert alert-info">
          <span>Set the project domain above to add subdomains.</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">
                Find the subdomains of {apex}
              </p>
              <p className="text-sm text-base-content/60">
                Search Console finds every subdomain with impressions in the{" "}
                {SUBDOMAIN_GSC_RANGE_LABEL} (free, needs a connected{" "}
                <code className="text-xs">sc-domain:</code> property). Organic
                search finds subdomains that rank on Google and uses credits.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={isBusy}
                onClick={() => discoverMutation.mutate(["gsc", "dataforseo"])}
              >
                {isDiscovering ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Find subdomains
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={isBusy}
                onClick={() => discoverMutation.mutate(["gsc"])}
              >
                Search Console only (free)
              </button>
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
            <label className="input input-bordered input-sm flex flex-1 items-center gap-2 min-w-56">
              <Globe className="size-4 text-base-content/60" />
              <input
                className="grow min-w-0"
                placeholder={`blog.${apex}`}
                value={host}
                onChange={(event) => setHost(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-outline btn-sm"
              disabled={!host.trim() || addMutation.isPending}
            >
              Add
            </button>
          </form>

          {subdomains.length > FILTER_THRESHOLD ? (
            <label className="input input-bordered input-sm flex items-center gap-2">
              <Search className="size-4 text-base-content/60" />
              <input
                className="grow min-w-0"
                placeholder="Filter subdomains"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
          ) : null}

          {selectedIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-base-200 px-3 py-2">
              <span className="text-sm">{selectedIds.length} selected</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={isBusy}
                  onClick={() =>
                    activeMutation.mutate({
                      subdomainIds: selectedIds,
                      isActive: true,
                    })
                  }
                >
                  Include
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={isBusy}
                  onClick={() =>
                    activeMutation.mutate({
                      subdomainIds: selectedIds,
                      isActive: false,
                    })
                  }
                >
                  Exclude
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-error"
                  disabled={isBusy}
                  onClick={() => removeMutation.mutate(selectedIds)}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </button>
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
            <SubdomainTable
              subdomains={visible}
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
        </div>
      )}
    </section>
  );
}

function SubdomainTable({
  subdomains,
  selected,
  allVisibleSelected,
  disabled,
  onToggleOne,
  onToggleAll,
  onSetActive,
  onRemove,
}: {
  subdomains: Subdomain[];
  selected: ReadonlySet<string>;
  allVisibleSelected: boolean;
  disabled: boolean;
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
  onSetActive: (id: string, isActive: boolean) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-base-300">
      <table className="table table-sm">
        <thead>
          <tr>
            <th className="w-10">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                aria-label="Select all shown subdomains"
                checked={allVisibleSelected}
                onChange={onToggleAll}
              />
            </th>
            <th>Subdomain</th>
            <th className="text-right">Traffic</th>
            <th className="text-right">Keywords</th>
            <th className="text-right">Clicks</th>
            <th className="w-24 text-center">Included</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {subdomains.map((subdomain) => (
            <tr
              key={subdomain.id}
              className={subdomain.isActive ? "" : "opacity-50"}
            >
              <td>
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  aria-label={`Select ${subdomain.host}`}
                  checked={selected.has(subdomain.id)}
                  onChange={() => onToggleOne(subdomain.id)}
                />
              </td>
              <td>
                <div className="font-medium">{subdomain.host}</div>
                <div className="text-xs text-base-content/50">
                  {SUBDOMAIN_SOURCE_LABELS[subdomain.source]}
                </div>
              </td>
              <td className="text-right tabular-nums">
                {formatMetric(subdomain.organicTraffic)}
              </td>
              <td className="text-right tabular-nums">
                {formatMetric(subdomain.organicKeywords)}
              </td>
              <td className="text-right tabular-nums">
                {formatMetric(subdomain.clicks)}
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  className="toggle toggle-sm"
                  aria-label={`Include ${subdomain.host}`}
                  checked={subdomain.isActive}
                  disabled={disabled}
                  onChange={() =>
                    onSetActive(subdomain.id, !subdomain.isActive)
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square"
                  aria-label={`Remove ${subdomain.host}`}
                  disabled={disabled}
                  onClick={() => onRemove(subdomain.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
