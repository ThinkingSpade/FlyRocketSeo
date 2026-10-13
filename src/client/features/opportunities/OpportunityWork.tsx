import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AppCard } from "@/client/components/AppCard";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import {
  listOpportunities,
  refreshOpportunities,
} from "@/serverFunctions/opportunities";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Button } from "@cloudflare/kumo/components/button";
import {
  statusLabels,
  opportunityWorkKey,
  investigationSearch,
  resultCopy,
} from "./opportunityWorkShared";
import { WorkItem } from "./OpportunityWorkItem";
import type { OpportunityStatus } from "@/shared/opportunities";
import { opportunityStatusSchema } from "@/types/schemas/opportunities";
export function OpportunityWork({
  projectId,
  compact = false,
}: {
  projectId: string;
  compact?: boolean;
}) {
  const target = useProjectDomain(projectId);
  return (
    <WorkList
      key={`${projectId}:${target}`}
      projectId={projectId}
      target={target}
      compact={compact}
    />
  );
}
function WorkList({
  projectId,
  target,
  compact,
}: {
  projectId: string;
  target: string | null;
  compact: boolean;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<OpportunityStatus | "all">("all");
  const [page, setPage] = useState(0);
  const selectedStatus = filter === "all" ? undefined : filter;
  const query = useQuery({
    queryKey: opportunityWorkKey(projectId, target, page, selectedStatus),
    queryFn: () =>
      listOpportunities({ data: { projectId, page, status: selectedStatus } }),
    enabled: Boolean(target),
  });
  const refresh = useMutation({
    mutationFn: () =>
      refreshOpportunities({
        data: { projectId, dateRange: "last_28_days", searchType: "web" },
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["opportunity-work", projectId],
      }),
  });
  const items = query.data?.opportunities ?? [];
  const visible = items;
  const active = items.filter(
    (item) => !["dismissed", "measured"].includes(item.status),
  );
  return (
    <AppCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">
          {compact ? "Progress and results" : "Saved work"}
        </h2>
        {compact ? (
          <Link
            to="/p/$projectId/opportunities"
            params={{ projectId }}
            className="app-link"
          >
            Manage work
          </Link>
        ) : (
          <Button
            disabled={refresh.isPending || !target}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending
              ? "Reviewing evidence…"
              : "Review latest evidence"}
          </Button>
        )}
      </div>
      {query.data?.coverage.hasMore ? (
        <p className="text-xs text-base-content/60">
          Showing up to {query.data.coverage.limit} prioritized work items per
          page. Additional work is available on the next page.
        </p>
      ) : null}
      <p className="text-xs text-base-content/60">
        Tasks and evidence belong to {target ?? "this project's website"}.
        Updating a status records your work; it does not change the website.
        Evidence reads use Search Console and stored data.
      </p>
      {query.isError ? (
        <InlineQueryError
          message="Saved work could not be loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : !target ? (
        <p>Set this project's website before saving work.</p>
      ) : query.isPending ? (
        <Loader />
      ) : (
        <>
          <p className="text-sm">
            Counts for this page: {active.length} active ·{" "}
            {
              items.filter(
                (item) =>
                  item.status === "implemented" ||
                  item.status === "results_pending",
              ).length
            }{" "}
            awaiting results ·{" "}
            {
              items.filter((item) => item.result?.availability === "measured")
                .length
            }{" "}
            measured observations
          </p>
          {query.data?.latestRun ? (
            <p className="text-xs text-base-content/60">
              Last evidence review: {query.data.latestRun.fetchedAt} ·{" "}
              {query.data.latestRun.observedFrom}–
              {query.data.latestRun.observedTo} ·{" "}
              {query.data.latestRun.availability}.{" "}
              {query.data.latestRun.reasons.join(" ")}
            </p>
          ) : null}
          {!compact ? (
            <label className="flex max-w-56 flex-col gap-1 text-sm">
              Work status
              <select
                className="app-select app-select-sm"
                value={filter}
                onChange={(event) => {
                  const selected = opportunityStatusSchema.safeParse(
                    event.target.value,
                  );
                  setFilter(selected.success ? selected.data : "all");
                  setPage(0);
                }}
              >
                <option value="all">All work</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!compact ? (
            <nav
              aria-label="Saved work pages"
              className="flex flex-wrap items-center gap-2"
            >
              <Button
                size="sm"
                variant="secondary"
                disabled={page === 0 || query.isFetching}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                Previous work
              </Button>
              <p className="text-sm">Work page {page + 1}</p>
              <Button
                size="sm"
                variant="secondary"
                disabled={!query.data?.coverage.hasMore || query.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                Next work
              </Button>
            </nav>
          ) : null}
          {visible.length === 0 ? (
            <p className="text-sm">
              No saved work matches this view. Investigate a page to save an
              action, or review the latest evidence for decline candidates.
              Prepare contextual links from a page investigation.
            </p>
          ) : compact ? (
            <ul className="space-y-3">
              {visible.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <Link
                    to="/p/$projectId/page"
                    params={{ projectId }}
                    search={investigationSearch(item)}
                    className="app-link"
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs">
                    {statusLabels[item.status]} ·{" "}
                    {item.observationState === "no_longer_observed"
                      ? "No longer observed; implementation unverified"
                      : `${item.priorityBand} priority`}
                  </p>
                  {item.result ? (
                    <p className="text-xs">{resultCopy(item)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-4">
              {visible.map((item) => (
                <WorkItem
                  key={`${item.id}:${item.revision}`}
                  item={item}
                  projectId={projectId}
                />
              ))}
            </div>
          )}
        </>
      )}
      {refresh.isError ? (
        <p role="alert" className="text-sm text-error">
          {getStandardErrorMessage(refresh.error)}
        </p>
      ) : refresh.data ? (
        <p role="status" className="text-sm">
          Evidence review: {refresh.data.availability}.{" "}
          {refresh.data.reasons.join(" ")}
        </p>
      ) : null}
    </AppCard>
  );
}
