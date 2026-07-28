import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { InsightIcon } from "@/client/components/InsightTile";
import { scheduleGbpPost } from "@/serverFunctions/gbp";
import {
  describeScheduleValidationErrors,
  GBP_POST_CONTENT_MAX_LENGTH,
  GBP_POST_VALIDATION_COPY,
  validateScheduledPost,
  type GbpCallToActionType,
  type GbpPostValidationError,
} from "./gbpPostSchedule";

const CTA_OPTIONS: { value: GbpCallToActionType; label: string }[] = [
  { value: "BOOK", label: "Book" },
  { value: "ORDER", label: "Order online" },
  { value: "SHOP", label: "Shop" },
  { value: "LEARN_MORE", label: "Learn more" },
  { value: "SIGN_UP", label: "Sign up" },
  { value: "CALL", label: "Call now" },
];

/** Local `datetime-local` input value -> the ISO instant the rest of the
 *  system (validateScheduledPost, the DB column, the publish queue) works
 *  in. `new Date(value)` parses a timezone-less "YYYY-MM-DDTHH:mm" string as
 *  the BROWSER's local time, which is exactly what the input represents. */
function toIsoInstant(datetimeLocalValue: string): string | null {
  if (!datetimeLocalValue) return null;
  const parsed = new Date(datetimeLocalValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** A <select>'s value is always a plain string -- resolving it through
 *  CTA_OPTIONS (rather than asserting it into the literal union) is what
 *  keeps this a real narrowing instead of an unsafe type assertion. */
function parseCtaType(value: string): GbpCallToActionType | "" {
  return CTA_OPTIONS.find((option) => option.value === value)?.value ?? "";
}

/**
 * Compose-and-schedule form for a Google Business Profile post. Nothing here
 * touches Google directly -- scheduleGbpPost only inserts a `scheduled` row
 * (see GbpWriteService.schedulePost). There is NO background trigger that
 * publishes it later (see GbpWriteService.publishDuePosts's own doc comment)
 * -- a post only ever reaches Google when a human clicks "Publish due posts
 * now" or a post's own "Publish now" (GbpScheduledPostsList.tsx), and that
 * click gets its own confirm step. The confirm here is still worth keeping
 * (follows AnalyzeProjectCard's explicit-confirm pattern) because it's the
 * one checkpoint before content/timing is locked into the queue -- but its
 * copy must say plainly that queuing is all this does, or a user reads
 * "publish automatically" and reasonably believes the post already went out.
 */
export function GbpPostComposer({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [content, setContent] = React.useState("");
  const [mediaUrl, setMediaUrl] = React.useState("");
  const [ctaType, setCtaType] = React.useState<GbpCallToActionType | "">("");
  const [ctaUrl, setCtaUrl] = React.useState("");
  const [scheduledAtLocal, setScheduledAtLocal] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);

  const scheduledAtIso = toIsoInstant(scheduledAtLocal);
  const errors: GbpPostValidationError[] =
    scheduledAtIso == null
      ? ["scheduled_in_past"]
      : validateScheduledPost(
          {
            content,
            scheduledAt: scheduledAtIso,
            callToActionType: ctaType || null,
            callToActionUrl: ctaUrl || null,
          },
          new Date(),
        );
  const canSchedule = content.trim() !== "" && errors.length === 0;

  const scheduleMutation = useMutation({
    mutationFn: () =>
      scheduleGbpPost({
        data: {
          projectId,
          content,
          mediaUrl: mediaUrl.trim() || null,
          callToActionType: ctaType || null,
          callToActionUrl: ctaUrl.trim() || null,
          scheduledAt: scheduledAtIso ?? "",
        },
      }),
    onSuccess: (result) => {
      setConfirming(false);
      if ("errors" in result) {
        // schedulePost's server-side re-validation is a LOCAL check (see its
        // own doc comment) -- Google's API is never called on this path, so
        // the message must describe what actually failed here, not
        // attribute it to Google (finding A3).
        toast.error(describeScheduleValidationErrors(result.errors));
        return;
      }
      toast.success("Post scheduled");
      setContent("");
      setMediaUrl("");
      setCtaType("");
      setCtaUrl("");
      setScheduledAtLocal("");
      void queryClient.invalidateQueries({
        queryKey: ["gbpScheduledPosts", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={CalendarClock} tone="neutral" />
          Schedule a post
        </h2>

        <label className="form-control">
          <span className="label-text pb-1 text-xs font-medium">
            What&apos;s the post about?
          </span>
          <textarea
            className="textarea textarea-bordered textarea-sm"
            rows={3}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <span
            className={`mt-1 text-xs ${content.length > GBP_POST_CONTENT_MAX_LENGTH ? "text-error" : "text-base-content/50"}`}
          >
            {content.length} / {GBP_POST_CONTENT_MAX_LENGTH}
          </span>
        </label>

        <label className="form-control">
          <span className="label-text pb-1 text-xs font-medium">
            Photo URL (optional)
          </span>
          <input
            type="text"
            className="input input-bordered input-sm"
            value={mediaUrl}
            onChange={(event) => setMediaUrl(event.target.value)}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-control">
            <span className="label-text pb-1 text-xs font-medium">
              Action button (optional)
            </span>
            <select
              className="select select-bordered select-sm"
              value={ctaType}
              onChange={(event) => setCtaType(parseCtaType(event.target.value))}
            >
              <option value="">None</option>
              {CTA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {ctaType && ctaType !== "CALL" ? (
            <label className="form-control">
              <span className="label-text pb-1 text-xs font-medium">
                Button URL
              </span>
              <input
                type="text"
                className="input input-bordered input-sm"
                value={ctaUrl}
                onChange={(event) => setCtaUrl(event.target.value)}
              />
            </label>
          ) : null}
        </div>

        <label className="form-control w-fit">
          <span className="label-text pb-1 text-xs font-medium">
            Publish at
          </span>
          <input
            type="datetime-local"
            className="input input-bordered input-sm"
            value={scheduledAtLocal}
            onChange={(event) => setScheduledAtLocal(event.target.value)}
          />
        </label>

        {errors.length > 0 && (content.trim() !== "" || scheduledAtLocal) ? (
          <ul className="space-y-0.5 text-xs text-error">
            {errors.map((error) => (
              <li key={error}>{GBP_POST_VALIDATION_COPY[error]}</li>
            ))}
          </ul>
        ) : null}

        {confirming ? (
          <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <p className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                This queues the post for{" "}
                {scheduledAtIso
                  ? new Date(scheduledAtIso).toLocaleString()
                  : "the chosen time"}
                . Nothing publishes on its own -- it stays queued until someone
                clicks &quot;Publish due posts now&quot; (or this post&apos;s
                &quot;Publish now&quot;) after that time. Continue?
              </span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={scheduleMutation.isPending}
                onClick={() => scheduleMutation.mutate()}
              >
                {scheduleMutation.isPending
                  ? "Scheduling…"
                  : "Yes, schedule it"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm w-fit"
            disabled={!canSchedule}
            onClick={() => setConfirming(true)}
          >
            Schedule post
          </button>
        )}
      </div>
    </div>
  );
}
