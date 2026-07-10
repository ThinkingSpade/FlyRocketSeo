import { useState } from "react";
import { Flag, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  createProjectEvent,
  deleteProjectEvent,
} from "@/serverFunctions/project-events";
import { EVENT_MARKER_COLOR } from "./ProjectEventsMarkers";
import { formatEventDate, todayLocalDateKey } from "./projectEventMarkers";
import { projectEventsQueryKey, useProjectEvents } from "./useProjectEvents";

/**
 * Manage the project's event journal: log what you did (published content,
 * fixed redirects, migrated the site) and delete stale entries. Logged events
 * show up as ⚑ markers on the rank-trend charts.
 */
export function ProjectEventsModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useProjectEvents(projectId);

  const [eventDate, setEventDate] = useState(todayLocalDateKey);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: projectEventsQueryKey(projectId),
    });

  const createMutation = useMutation({
    mutationFn: () =>
      createProjectEvent({
        data: {
          projectId,
          eventDate,
          title,
          note: note.trim() ? note : undefined,
        },
      }),
    onSuccess: () => {
      void invalidate();
      setTitle("");
      setNote("");
      captureClientEvent("project_events:create");
      toast.success("Event logged");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) =>
      deleteProjectEvent({ data: { projectId, eventId } }),
    onSuccess: () => {
      void invalidate();
      captureClientEvent("project_events:delete");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const canSubmit =
    title.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(eventDate) &&
    !createMutation.isPending;

  const submit = () => {
    if (canSubmit) createMutation.mutate();
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="project-events-title"
      maxWidth="max-w-lg"
    >
      <div>
        <h3
          id="project-events-title"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Flag className="size-4" style={{ color: EVENT_MARKER_COLOR }} />
          Site events
        </h3>
        <p className="text-xs text-base-content/60">
          Log what you did — published content, fixed redirects, migrated the
          site. Events appear as ⚑ markers on rank-trend charts so you can tie
          ranking moves to your work.
        </p>
      </div>

      {/* Log form */}
      <form
        className="space-y-2 rounded-lg border border-base-300 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="date"
            className="input input-bordered input-sm sm:w-40"
            aria-label="Event date"
            value={eventDate}
            max="9999-12-31"
            onChange={(e) => setEventDate(e.target.value)}
            required
          />
          <input
            type="text"
            className="input input-bordered input-sm flex-1"
            aria-label="Event title"
            placeholder="What did you do? e.g. Published 5 comparison posts"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="flex items-start gap-2">
          <input
            type="text"
            className="input input-bordered input-sm flex-1"
            aria-label="Optional note"
            placeholder="Optional note"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm gap-1"
            disabled={!canSubmit}
          >
            {createMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Log event
          </button>
        </div>
      </form>

      {/* Event list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-4 animate-spin text-base-content/50" />
        </div>
      ) : (events?.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-dashed border-base-300 p-6 text-center text-xs text-base-content/60">
          No events yet. The first one takes ten seconds — future-you, staring
          at a rank jump, will be glad you logged it.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {events?.map((event) => (
            <li
              key={event.id}
              className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-base-200/60"
            >
              <span className="mt-0.5 shrink-0 whitespace-nowrap text-[11px] tabular-nums text-base-content/50">
                {formatEventDate(event.eventDate)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{event.title}</span>
                {event.note ? (
                  <span className="block truncate text-xs text-base-content/50">
                    {event.note}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs shrink-0 px-1.5 text-base-content/40 hover:text-error"
                aria-label={`Delete event: ${event.title}`}
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(event.id)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
