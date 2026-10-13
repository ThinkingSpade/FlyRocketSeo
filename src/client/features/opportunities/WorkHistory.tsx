import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@cloudflare/kumo/components/button";
import { getOpportunityHistory } from "@/serverFunctions/opportunities";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { Opportunity } from "@/shared/opportunities";
import { resultCopy, statusLabels } from "./opportunityWorkShared";

export function WorkHistory({
  item,
  projectId,
  assignees,
}: {
  item: Opportunity;
  projectId: string;
  assignees: { userId: string; name: string }[];
}) {
  const history = useInfiniteQuery({
    queryKey: ["opportunity-history", projectId, item.id, item.revision],
    enabled: false,
    initialPageParam: item.historyCoverage.beforeRevision ?? undefined,
    queryFn: ({ pageParam }) =>
      getOpportunityHistory({
        data: { projectId, opportunityId: item.id, beforeRevision: pageParam },
      }),
    getNextPageParam: (last) =>
      last.hasMore ? (last.beforeRevision ?? undefined) : undefined,
  });
  const events = [
    ...(history.data?.pages.flatMap((page) => page.events) ?? []),
    ...item.history,
  ].toSorted((a, b) => a.revision - b.revision);
  const hasMore = history.data
    ? history.hasNextPage
    : item.historyCoverage.hasMore;
  return (
    <details>
      <summary className="cursor-pointer text-xs">
        Work history and evidence
      </summary>
      <ul className="mt-2 space-y-1 text-xs">
        {events.map((event) => (
          <li key={event.id}>
            {event.createdAt} · {statusLabels[event.status]} ·{" "}
            {event.note ?? event.kind} ·{" "}
            {event.actorUserId
              ? (assignees.find((person) => person.userId === event.actorUserId)
                  ?.name ?? "Workspace member")
              : "Evidence review"}
            {event.result ? (
              <p>
                Recorded comparison:{" "}
                {resultCopy({ ...item, result: event.result })} Baseline{" "}
                {event.result.baseline.window.startDate}–
                {event.result.baseline.window.endDate}; after{" "}
                {event.result.after.window.startDate}–
                {event.result.after.window.endDate}.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {history.error ? (
        <p role="alert" className="text-sm">
          {getStandardErrorMessage(history.error)}
        </p>
      ) : null}
      {hasMore ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={history.isFetching}
          onClick={() => void history.fetchNextPage()}
        >
          {history.isFetching ? "Loading history…" : "Load older history"}
        </Button>
      ) : null}
    </details>
  );
}
