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
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { Input } from "@cloudflare/kumo/components/input";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Switch } from "@cloudflare/kumo/components/switch";
import { Table } from "@cloudflare/kumo/components/table";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  projectSubdomainsQueryKey,
  useProjectSubdomainsQuery,
  type ProjectSubdomain,
} from "@/client/features/projects/useProjectSubdomains";
import {
  addProjectSubdomain,
  discoverProjectSubdomains,
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

function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

export function ProjectSubdomainsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  // Same key the Site Audit and Rank Tracking pickers read from, so every edit
  // here refreshes what they offer instead of leaving them on a stale list.
  const queryKey = projectSubdomainsQueryKey(projectId);

  const subdomainsQuery = useProjectSubdomainsQuery(projectId);

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
                {SUBDOMAIN_GSC_RANGE_LABEL} (free, needs a connected{" "}
                <code className="text-xs">sc-domain:</code> property). Organic
                search finds subdomains that rank on Google and uses credits.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isBusy}
                onClick={() => discoverMutation.mutate(["gsc", "dataforseo"])}
              >
                {isDiscovering ? (
                  <CircleNotch className="size-4 animate-spin" />
                ) : (
                  <ArrowsClockwise className="size-4" />
                )}
                Find subdomains
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => discoverMutation.mutate(["gsc"])}
              >
                Search Console only (free)
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
                onChange={(event) => setFilter(event.target.value)}
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
  subdomains: ProjectSubdomain[];
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
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head className="w-10">
              <Checkbox
                aria-label="Select all shown subdomains"
                checked={allVisibleSelected}
                onCheckedChange={onToggleAll}
              />
            </Table.Head>
            <Table.Head>Subdomain</Table.Head>
            <Table.Head className="text-right">Traffic</Table.Head>
            <Table.Head className="text-right">Keywords</Table.Head>
            <Table.Head className="text-right">Clicks</Table.Head>
            <Table.Head className="w-24 text-center">Included</Table.Head>
            <Table.Head className="w-10" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {subdomains.map((subdomain) => (
            <Table.Row
              key={subdomain.id}
              className={subdomain.isActive ? "" : "opacity-50"}
            >
              <Table.Cell>
                <Checkbox
                  aria-label={`Select ${subdomain.host}`}
                  checked={selected.has(subdomain.id)}
                  onCheckedChange={() => onToggleOne(subdomain.id)}
                />
              </Table.Cell>
              <Table.Cell>
                <div className="font-medium">{subdomain.host}</div>
                <div className="text-xs text-base-content/50">
                  {SUBDOMAIN_SOURCE_LABELS[subdomain.source]}
                </div>
              </Table.Cell>
              <Table.Cell className="text-right tabular-nums">
                {formatMetric(subdomain.organicTraffic)}
              </Table.Cell>
              <Table.Cell className="text-right tabular-nums">
                {formatMetric(subdomain.organicKeywords)}
              </Table.Cell>
              <Table.Cell className="text-right tabular-nums">
                {formatMetric(subdomain.clicks)}
              </Table.Cell>
              <Table.Cell className="text-center">
                <Switch
                  aria-label={`Include ${subdomain.host}`}
                  checked={subdomain.isActive}
                  disabled={disabled}
                  onCheckedChange={() =>
                    onSetActive(subdomain.id, !subdomain.isActive)
                  }
                />
              </Table.Cell>
              <Table.Cell>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-label={`Remove ${subdomain.host}`}
                  disabled={disabled}
                  onClick={() => onRemove(subdomain.id)}
                >
                  <Trash className="size-3.5" />
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}
