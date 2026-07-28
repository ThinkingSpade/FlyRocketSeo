import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { InsightIcon } from "@/client/components/InsightTile";
import { scheduleGbpPost } from "@/serverFunctions/gbp";
import {
  GBP_POST_CONTENT_MAX_LENGTH,
  validateScheduledPost,
  type GbpCallToActionType,
} from "./gbpPostSchedule";

const CTA_OPTIONS: { value: GbpCallToActionType; label: string }[] = [
  { value: "BOOK", label: "Book" },
  { value: "ORDER", label: "Order online" },
  { value: "SHOP", label: "Shop" },
  { value: "LEARN_MORE", label: "Learn more" },
  { value: "SIGN_UP", label: "Sign up" },
  { value: "CALL", label: "Call now" },
];

const VALIDATION_COPY: Record<string, string> = {
  empty_content: "Write something before scheduling.",
  content_too_long: `Content is over Google's ${GBP_POST_CONTENT_MAX_LENGTH}-character limit.`,
  scheduled_in_past: "Pick a time in the future.",
  cta_url_required: "This action button needs a URL to send people to.",
  cta_url_not_allowed_for_call:
    "A Call button dials your listed phone number -- it can't also have a URL.",
};

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
 * (see GbpWriteService.schedulePost). The confirm step still applies (follows
 * AnalyzeProjectCard's explicit-confirm pattern) because once scheduled, the
 * post WILL publish automatically the next time someone runs "Publish due
 * posts" with no further per-post confirmation -- so this is the one and only
 * human checkpoint before that eventually-automatic Google-side write.
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
  const errors =
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
        toast.error(
          "Google rejected this post -- check the highlighted fields.",
        );
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
              <li key={error}>{VALIDATION_COPY[error] ?? error}</li>
            ))}
          </ul>
        ) : null}

        {confirming ? (
          <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <p className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                This will publish automatically to your live Google Business
                Profile at{" "}
                {scheduledAtIso
                  ? new Date(scheduledAtIso).toLocaleString()
                  : "the chosen time"}
                , with no further confirmation. Continue?
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
