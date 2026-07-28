/**
 * Pure scheduling logic for Google Business Profile posts. No I/O: every
 * function here takes plain data (and, where "now" matters, an explicit Date)
 * and returns plain data. GbpWriteService (server-side) is the only caller
 * that touches the database or Google's API -- it loads rows, hands them to
 * this module, and acts on what comes back.
 *
 * The property that matters most is `canStartPublishing`: a Google Business
 * Profile post, once created via the API, is live on the client's public
 * profile. Publishing the same row twice would mean a duplicate post with no
 * clean way to detect or merge it after the fact -- so this module treats
 * "which posts are safe to publish right now" as its central concern, not an
 * afterthought bolted onto the due-date check.
 */

export type GbpScheduledPostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

/** Google's LocalPost.CallToAction.ActionType values, minus
 *  ACTION_TYPE_UNSPECIFIED -- a `null` callToActionType already means "no
 *  CTA" in this model, so the unspecified variant has no use here. Mirrors
 *  the enum inlined on gbp_scheduled_posts.call_to_action_type in both
 *  src/db/app.schema.ts and src/db/pg/app.schema.ts; keep the two in sync. */
export type GbpCallToActionType =
  | "BOOK"
  | "ORDER"
  | "SHOP"
  | "LEARN_MORE"
  | "SIGN_UP"
  | "CALL";

/** The minimal shape selectDuePosts/orderPublishQueue/buildPublishQueue need.
 *  Callers pass their full DB row (or a mapped subset) -- extra fields are
 *  ignored, so this can't drift from what the repository actually selects. */
export type GbpScheduledPostRecord = {
  id: string;
  status: GbpScheduledPostStatus;
  /** ISO 8601 instant. */
  scheduledAt: string;
};

/** Google's documented maximum for a Business Profile local post's `summary`
 *  field, across every post topic type (standard, event, offer, alert) --
 *  https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts
 *  ("summary: Description/body of the local post... Maximum 1,500
 *  characters."). Named and cited rather than inlined so a future correction
 *  has exactly one place to change. */
export const GBP_POST_CONTENT_MAX_LENGTH = 1500;

/**
 * The double-publish guard. Only a `scheduled` post may begin publishing:
 * - `draft` was never scheduled, so nothing about it is "due" yet.
 * - `publishing` is already in flight -- allowing it again is exactly the
 *   duplicate-post bug this function exists to prevent.
 * - `published` already succeeded; there is nothing left to do.
 * - `failed` is refused ON PURPOSE, not retried automatically: a failure
 *   needs a human to look at `errorMessage` and deliberately re-schedule,
 *   rather than being silently retried into a second attempt at whatever
 *   made Google reject it the first time (see describePublishBlockReason).
 *
 * Callers must treat this as the single source of truth for "is it safe to
 * flip this row to publishing" -- both the batch due-selector below AND the
 * service's immediate-publish path re-check it independently, so a race
 * between two callers picking up the same row can only ever let the first
 * one through.
 */
export function canStartPublishing(status: GbpScheduledPostStatus): boolean {
  return status === "scheduled";
}

/** Human-readable reason a post is blocked from publishing, or null when it
 *  isn't blocked. Surfaced verbatim in the UI/service error so "why can't I
 *  publish this" is never a generic failure -- see GbpWriteService. */
export function describePublishBlockReason(
  status: GbpScheduledPostStatus,
): string | null {
  if (canStartPublishing(status)) return null;
  if (status === "draft") return "This post hasn't been scheduled yet.";
  if (status === "publishing") return "This post is already publishing.";
  if (status === "published") return "This post has already been published.";
  // status === "failed"
  return "This post failed previously -- reschedule it to retry.";
}

function isPostDue(post: GbpScheduledPostRecord, now: Date): boolean {
  return (
    canStartPublishing(post.status) &&
    new Date(post.scheduledAt).getTime() <= now.getTime()
  );
}

/** Which posts are due to publish at `now`. Filters out everything
 *  `canStartPublishing` would refuse, so a post already publishing/published
 *  is never selected again regardless of how stale its scheduledAt is. */
export function selectDuePosts<T extends GbpScheduledPostRecord>(
  posts: T[],
  now: Date,
): T[] {
  return posts.filter((post) => isPostDue(post, now));
}

/** Oldest-scheduled-first, so a backlog of due posts publishes in the order
 *  the user actually queued it rather than however the caller's query
 *  happened to return rows. Ties (identical scheduledAt) break on `id` for a
 *  deterministic, test-stable order -- never on insertion order, which this
 *  function doesn't have visibility into once given a plain array. */
export function orderPublishQueue<T extends GbpScheduledPostRecord>(
  posts: T[],
): T[] {
  return posts.toSorted((a, b) => {
    const diff =
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

/** The real entry point: due posts, in publish order. Composes the two
 *  functions above so the one property that matters in production --
 *  "everything this returns is both due and safe to publish" -- is proven by
 *  their own, separately-tested guarantees rather than re-implemented here. */
export function buildPublishQueue<T extends GbpScheduledPostRecord>(
  posts: T[],
  now: Date,
): T[] {
  return orderPublishQueue(selectDuePosts(posts, now));
}

export type GbpPostValidationError =
  | "empty_content"
  | "content_too_long"
  | "scheduled_in_past"
  | "cta_url_required"
  | "cta_url_not_allowed_for_call";

// Not exported: every caller (GbpWriteService.schedulePost,
// GbpPostComposer.tsx) passes an inline object and relies on this
// function's parameter typing rather than importing the shape by name.
type GbpPostValidationInput = {
  content: string;
  /** ISO 8601 instant the post should go out at. */
  scheduledAt: string;
  callToActionType: GbpCallToActionType | null;
  callToActionUrl: string | null;
};

function validateContent(content: string): GbpPostValidationError[] {
  const trimmed = content.trim();
  if (trimmed === "") return ["empty_content"];
  if (trimmed.length > GBP_POST_CONTENT_MAX_LENGTH) return ["content_too_long"];
  return [];
}

function validateSchedule(
  scheduledAt: string,
  now: Date,
): GbpPostValidationError[] {
  // An unparseable string yields NaN, which is neither <= nor > any number --
  // so without this explicit check, garbage input would silently pass
  // instead of failing "in the past" the way it should.
  const scheduledMs = new Date(scheduledAt).getTime();
  if (Number.isNaN(scheduledMs) || scheduledMs <= now.getTime()) {
    return ["scheduled_in_past"];
  }
  return [];
}

/** Google rejects a `url` on a CALL action (there's nothing to link to -- it
 *  dials the listed phone number) and requires one on every other action
 *  type (BOOK/ORDER/SHOP/LEARN_MORE/SIGN_UP all need somewhere to send the
 *  click). A null callToActionType has no url requirement either way. */
function validateCallToAction(
  callToActionType: GbpCallToActionType | null,
  callToActionUrl: string | null,
): GbpPostValidationError[] {
  if (callToActionType == null) return [];
  const hasUrl = (callToActionUrl ?? "").trim() !== "";
  if (callToActionType === "CALL") {
    return hasUrl ? ["cta_url_not_allowed_for_call"] : [];
  }
  return hasUrl ? [] : ["cta_url_required"];
}

/** Validates a post before it can be scheduled. Returns every applicable
 *  error at once (not just the first) so a compose form can point out all of
 *  a post's problems in a single pass rather than one frustrating fix at a
 *  time. Empty array = valid. */
export function validateScheduledPost(
  input: GbpPostValidationInput,
  now: Date,
): GbpPostValidationError[] {
  return [
    ...validateContent(input.content),
    ...validateSchedule(input.scheduledAt, now),
    ...validateCallToAction(input.callToActionType, input.callToActionUrl),
  ];
}

/** One human-readable sentence per GbpPostValidationError -- the single
 *  source of truth for both the compose form's inline per-field list and the
 *  submit-time toast (see GbpPostComposer.tsx), so the two surfaces can never
 *  drift into describing the same error differently. `Record<
 *  GbpPostValidationError, string>` (not `Record<string, string>`) so adding
 *  a new error variant without a matching entry here fails to compile. */
export const GBP_POST_VALIDATION_COPY: Record<GbpPostValidationError, string> =
  {
    empty_content: "Write something before scheduling.",
    content_too_long: `Content is over Google's ${GBP_POST_CONTENT_MAX_LENGTH}-character limit.`,
    scheduled_in_past: "Pick a time in the future.",
    cta_url_required: "This action button needs a URL to send people to.",
    cta_url_not_allowed_for_call:
      "A Call button dials your listed phone number -- it can't also have a URL.",
  };

/**
 * Describes a schedulePost server response's validation errors for a toast
 * (finding A3). `schedulePost` re-validates server-side as defense in depth
 * -- e.g. the scheduled time can pass between the form's own client-side
 * check and the request actually reaching the server -- so this path is a
 * LOCAL validation failure, never a rejection from Google's API (Google is
 * never called before schedulePost returns `{ errors }`; see
 * GbpWriteService.schedulePost). The message must say so honestly rather
 * than attributing a local validation failure to Google.
 */
export function describeScheduleValidationErrors(
  errors: GbpPostValidationError[],
): string {
  const messages = errors.map((error) => GBP_POST_VALIDATION_COPY[error]);
  return messages.length > 0
    ? messages.join(" ")
    : "This post didn't pass validation -- check the highlighted fields.";
}
