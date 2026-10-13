import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  updateOpportunity,
  measureOpportunity,
  listOpportunityAssignees,
} from "@/serverFunctions/opportunities";
import type { Opportunity } from "@/shared/opportunities";
import { opportunityStatusSchema } from "@/types/schemas/opportunities";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import {
  statusLabels,
  investigationSearch,
  resultCopy,
} from "./opportunityWorkShared";
import { WorkHistory } from "./WorkHistory";
export function WorkItem({
  item,
  projectId,
}: {
  item: Opportunity;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(item.status);
  const [assignee, setAssignee] = useState(item.assigneeUserId ?? "");
  const [note, setNote] = useState("");
  const [implementedDate, setImplementedDate] = useState(
    item.implementedAt?.slice(0, 10) ?? "",
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const assignees = useQuery({
    queryKey: ["opportunity-assignees", projectId],
    queryFn: () => listOpportunityAssignees({ data: { projectId } }),
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["opportunity-work", projectId],
    });
  const update = useMutation({
    mutationFn: () =>
      updateOpportunity({
        data: {
          projectId,
          opportunityId: item.id,
          expectedRevision: item.revision,
          status: status === item.status ? undefined : status,
          assigneeUserId: assignee || null,
          note: note.trim() || undefined,
          implementedAt:
            status === "implemented" &&
            status !== item.status &&
            implementedDate
              ? `${implementedDate}T12:00:00.000Z`
              : undefined,
        },
      }),
    onSuccess: invalidate,
  });
  const measure = useMutation({
    mutationFn: () =>
      measureOpportunity({
        data: {
          projectId,
          opportunityId: item.id,
          expectedRevision: item.revision,
          startDate: start,
          endDate: end,
        },
      }),
    onSuccess: invalidate,
  });
  return (
    <article
      aria-label={item.title}
      className="rounded-lg border border-base-300 p-4 space-y-3"
    >
      <div>
        <Link
          className="app-link font-medium"
          to="/p/$projectId/page"
          params={{ projectId }}
          search={investigationSearch(item)}
        >
          {item.title}
        </Link>
        <p className="break-all text-xs text-base-content/60">{item.url}</p>
      </div>
      <p className="text-sm">{item.finding}</p>
      <p className="text-xs">
        {item.priorityBand} priority · {item.confidenceBand} evidence confidence
        · {statusLabels[item.status]}
      </p>
      {item.observationState === "no_longer_observed" ? (
        <p className="text-xs text-warning">
          No longer observed in the latest comparable evidence. This is not a
          verified fix.
        </p>
      ) : null}
      <p className="text-xs text-base-content/60">
        {item.evidence.source} · {item.evidence.scope.siteUrl} ·{" "}
        {item.evidence.window.startDate}–{item.evidence.window.endDate} ·
        captured {item.evidence.fetchedAt} ·{" "}
        {item.evidence.scope.country ?? "All countries"} ·{" "}
        {item.evidence.scope.device ?? "All devices"} ·{" "}
        {item.evidence.scope.searchType} search
      </p>
      <ul className="list-disc pl-5 text-xs">
        {item.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
        {item.nextSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      {item.evidence.link ? (
        <div className="rounded border border-base-300 p-2 text-xs">
          <p>
            Candidate anchor: {item.evidence.link.anchor} ·{" "}
            {item.evidence.link.sourceLocation}
          </p>
          <blockquote>{item.evidence.link.sourceExcerpt}</blockquote>
          <p className="break-all">
            {item.evidence.link.sourceUrl} → {item.evidence.link.destinationUrl}{" "}
            · captured {item.evidence.link.capturedAt}
          </p>
        </div>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            className="app-select app-select-sm"
            value={status}
            onChange={(event) => {
              const next = opportunityStatusSchema.safeParse(
                event.target.value,
              );
              if (next.success) setStatus(next.data);
            }}
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value} disabled={value === "measured"}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Assignee
          <select
            className="app-select app-select-sm"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            disabled={assignees.isPending || assignees.isError}
          >
            <option value="">Unassigned</option>
            {assignees.data?.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name || person.email}
              </option>
            ))}
          </select>
        </label>
        {status === "implemented" ? (
          <label className="flex flex-col gap-1 text-sm">
            Implementation date
            <Input
              type="date"
              required
              value={implementedDate}
              onChange={(event) => setImplementedDate(event.target.value)}
            />
          </label>
        ) : null}
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          Implementation notes / reason
          <Input
            value={note}
            maxLength={4000}
            onChange={(event) => setNote(event.target.value)}
            required={status === "implemented" || status === "dismissed"}
            placeholder="What changed, artifact, or dismissal reason"
          />
        </label>
        <Button type="submit" disabled={update.isPending || measure.isPending}>
          Save progress
        </Button>
      </form>
      {update.isError || measure.isError ? (
        <p role="alert" className="text-sm text-error">
          {getStandardErrorMessage(update.error ?? measure.error)}
        </p>
      ) : null}
      {item.implementedAt ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Track observed results
          </summary>
          <p className="mt-2 text-xs">
            Choose an equal-length final-data window after the recorded
            implementation and observation lag. Matching property, URL, device,
            country and search type are required. Low volume or incomplete
            evidence stays pending.
          </p>
          <form
            className="mt-2 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              measure.mutate();
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              After start
              <Input
                type="date"
                value={start}
                required
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              After end
              <Input
                type="date"
                value={end}
                required
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
            <Button
              type="submit"
              disabled={measure.isPending || update.isPending}
            >
              {measure.isPending ? "Reading observations…" : "Measure results"}
            </Button>
          </form>
        </details>
      ) : null}
      {item.result ? (
        <div role="status" className="text-sm">
          <p>{resultCopy(item)}</p>
          <p className="text-xs">
            Baseline {item.result.baseline.window.startDate}–
            {item.result.baseline.window.endDate}; after{" "}
            {item.result.after.window.startDate}–
            {item.result.after.window.endDate}.{" "}
            {item.result.limitations.join(" ")}
          </p>
        </div>
      ) : null}
      <WorkHistory
        item={item}
        projectId={projectId}
        assignees={assignees.data ?? []}
      />
    </article>
  );
}
