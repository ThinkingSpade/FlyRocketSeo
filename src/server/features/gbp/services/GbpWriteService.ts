import { AppError } from "@/server/lib/errors";
import { GBP_WRITE_NOT_CONFIGURED_MESSAGE } from "@/shared/gbp";
import {
  buildPublishQueue,
  canStartPublishing,
  describePublishBlockReason,
  validateScheduledPost,
  type GbpCallToActionType,
  type GbpPostValidationError,
} from "@/client/features/local-seo/gbpPostSchedule";
import {
  createGbpClient,
  GbpApiError,
  GbpTokenError,
  isNetworkTransportError,
  type GbpCategorySuggestion,
} from "@/server/lib/gbpClient";
import { isGbpWriteConfigured } from "@/server/features/gbp/oauth-config";
import {
  GbpConnectionRepository,
  type GbpConnection,
} from "@/server/features/gbp/repositories/GbpConnectionRepository";
import {
  GbpScheduledPostRepository,
  type GbpScheduledPost,
} from "@/server/features/gbp/repositories/GbpScheduledPostRepository";

/**
 * The two write actions this feature exists for: publishing a Google
 * Business Profile post, and patching listing fields. Both are gated on
 * isGbpWriteConfigured() FIRST (the operator's capability) and then on this
 * project's own gbp_connections row (which location, whose grant) -- neither
 * check is optional. Failures from either gate -- and from Google's API
 * itself -- come back as a specific `{ reason, message }`, never a generic
 * thrown failure: a plain `throw` would cross the client boundary as just an
 * error CODE (see toClientError in server/lib/errors.ts) and collapse to
 * whatever static text that code maps to in error-messages.ts, which is
 * exactly the "generic failure" this was asked not to do.
 *
 * Every function here is called ONLY from an explicit, user-confirmed
 * action -- see GbpPostComposer.tsx and GbpListingFixButton.tsx's confirm
 * steps. Nothing in this module runs as a side effect of a query, a route
 * load, or restoring state.
 */

type GbpBlockedReason =
  | "not_configured"
  | "not_connected"
  | "blocked"
  | "token_expired"
  | "api_error";

// None of this module's types are exported: serverFunctions/gbp.ts and the
// UI both consume these functions' return values structurally (destructuring
// `result.ok`/`result.message`/etc.) rather than importing the shapes by
// name, so there is no real external consumer to export them for.
type GbpBlockedOutcome = {
  ok: false;
  reason: GbpBlockedReason;
  message: string;
};

// Sourced from shared/gbp.ts (final wave item 3, an A6 residual) rather than
// kept as a local copy -- this was a byte-for-byte duplicate of
// error-messages.ts's GBP_NOT_CONFIGURED text, and the two drifted apart
// once one of them got the A6 honesty fix and the other didn't.
const NOT_CONFIGURED_MESSAGE = GBP_WRITE_NOT_CONFIGURED_MESSAGE;
const NOT_CONNECTED_MESSAGE =
  "This project isn't connected to a Google Business Profile location yet. Connect one on the Local SEO tab first.";

type WritableConnectionGate =
  | { blocked: GbpBlockedOutcome }
  | { connection: GbpConnection };

/** The capability + connection gate every write action runs through, in that
 *  order: an absent operator capability is checked before an absent
 *  per-project connection so the message always names the REAL blocker
 *  (an operator who hasn't configured GBP at all would otherwise see a
 *  confusing "connect a location" prompt for a connect flow that can't
 *  even start). */
async function requireWritableConnection(
  projectId: string,
): Promise<WritableConnectionGate> {
  if (!(await isGbpWriteConfigured())) {
    return {
      blocked: {
        ok: false,
        reason: "not_configured",
        message: NOT_CONFIGURED_MESSAGE,
      },
    };
  }
  const connection = await GbpConnectionRepository.getByProjectId(projectId);
  if (!connection) {
    return {
      blocked: {
        ok: false,
        reason: "not_connected",
        message: NOT_CONNECTED_MESSAGE,
      },
    };
  }
  return { connection };
}

/**
 * Classifies a failure from an actual Google-side call (createLocalPost,
 * patchLocation, getLocation, searchCategories) that has NOT yet succeeded --
 * every branch here can honestly describe "this call to Google failed",
 * because it did. Never call this for a failure that happens AFTER a
 * Google call already succeeded (see publishPost's own two-phase try/catch
 * below): the write went through, so nothing here -- rejection, an expired
 * connection -- would be true anymore.
 */
function messageForGbpFailure(error: unknown): {
  reason: GbpBlockedReason;
  message: string;
} {
  if (error instanceof GbpTokenError) {
    // Final wave item 1: this can mean a genuinely revoked/expired grant,
    // but getToken() cannot always tell that apart from an unrelated
    // internal error (see gbpClient.ts's own doc comment on GbpTokenError).
    // "Reconnect" is still the right remedy either way, but asserting
    // "expired or was revoked" as an established fact is not.
    return {
      reason: "token_expired",
      message:
        "Couldn't verify your Google Business Profile connection is still valid. Reconnect it and try again.",
    };
  }
  if (error instanceof GbpApiError) {
    return { reason: "api_error", message: error.message };
  }
  if (isNetworkTransportError(error)) {
    return {
      reason: "api_error",
      message:
        "Couldn't reach Google Business Profile. Check your connection and try again.",
    };
  }
  return {
    reason: "api_error",
    message:
      error instanceof Error
        ? error.message
        : "Something went wrong talking to Google Business Profile. Try again.",
  };
}

type SchedulePostInput = {
  projectId: string;
  content: string;
  mediaUrl: string | null;
  callToActionType: GbpCallToActionType | null;
  callToActionUrl: string | null;
  scheduledAt: string;
  createdByUserId: string;
};

/** Creates a queued post row after running it through the same validation
 *  the pure model exposes -- this is the one and only place a post enters
 *  `scheduled` status, so an invalid post (empty, over the length limit, a
 *  past schedule time, a malformed CTA) can never reach the publish queue. */
async function schedulePost(
  input: SchedulePostInput,
): Promise<{ post: GbpScheduledPost } | { errors: GbpPostValidationError[] }> {
  const errors = validateScheduledPost(input, new Date());
  if (errors.length > 0) return { errors };

  const post = await GbpScheduledPostRepository.create({
    projectId: input.projectId,
    content: input.content.trim(),
    mediaUrl: input.mediaUrl,
    callToActionType: input.callToActionType,
    callToActionUrl: input.callToActionUrl,
    scheduledAt: input.scheduledAt,
    status: "scheduled",
    createdByUserId: input.createdByUserId,
  });
  return { post };
}

type PublishPostOutcome =
  | { ok: true; publishedPostId: string }
  | GbpBlockedOutcome;

/**
 * Publishes ONE scheduled post right now. Checks canStartPublishing
 * in-process (belt) and then claimForPublishing at the DB layer (braces)
 * before ever calling Google's API -- see
 * GbpScheduledPostRepository.claimForPublishing's own doc comment for why the
 * DB-level compare-and-swap is the check that actually matters once two
 * callers can race (a double click, or this same function called both from
 * a user's click AND from publishDuePosts in the same request cycle).
 */
async function publishPost(input: {
  postId: string;
  projectId: string;
}): Promise<PublishPostOutcome> {
  const gate = await requireWritableConnection(input.projectId);
  if ("blocked" in gate) return gate.blocked;

  // gbp_connections.accountName is nullable ONLY to accommodate rows saved
  // before that column existed (see its schema comment) -- without it there
  // is no way to compose the v4 localPosts parent, so refuse up front rather
  // than calling Google with a broken URL and failing the post.
  if (!gate.connection.accountName) {
    return {
      ok: false,
      reason: "not_connected",
      message:
        "This location was connected before account information was captured -- reconnect it on the Local SEO tab, then try again.",
    };
  }
  const gbpAccountName = gate.connection.accountName;

  const post = await GbpScheduledPostRepository.getById(input.postId);
  if (!post || post.projectId !== input.projectId) {
    throw new AppError(
      "NOT_FOUND",
      "Scheduled post not found for this project.",
    );
  }

  if (!canStartPublishing(post.status)) {
    return {
      ok: false,
      reason: "blocked",
      message:
        describePublishBlockReason(post.status) ??
        "This post cannot be published right now.",
    };
  }

  const claimed = await GbpScheduledPostRepository.claimForPublishing(post.id);
  if (!claimed) {
    // A null claim only proves the compare-and-swap didn't win -- NOT that
    // publishing is in progress (finding A7). Between the read above and
    // this claim attempt, the row could have been deleted, or already moved
    // to published/failed by a concurrent request. Re-read it and report
    // what's actually there instead of asserting one specific cause.
    const current = await GbpScheduledPostRepository.getById(post.id);
    return {
      ok: false,
      reason: "blocked",
      message:
        current == null
          ? "This post no longer exists -- it may have been deleted."
          : (describePublishBlockReason(current.status) ??
            "This post could not be claimed for publishing -- another request may have just claimed it. Try again."),
    };
  }

  // Split deliberately into two try/catches (final wave item 1): whether
  // Google actually accepted the post determines what an honest failure
  // message can say. Everything up to and including createLocalPost either
  // fails before Google saw the request or fails ON Google's own call, so
  // messageForGbpFailure's classification (built for "a call to Google
  // failed") is accurate there. Anything failing AFTER createLocalPost
  // returns is failing on OUR side, after the write already went through --
  // describing that as Google rejecting the request, or reusing
  // messageForGbpFailure's classification at all, would be false.
  let publishedPostName: string;
  try {
    const client = createGbpClient({
      userId: gate.connection.connectedByUserId,
    });
    const result = await client.createLocalPost(
      {
        accountName: gbpAccountName,
        locationName: gate.connection.locationName,
      },
      {
        summary: claimed.content,
        ...(claimed.callToActionType
          ? {
              callToAction: {
                actionType: claimed.callToActionType,
                ...(claimed.callToActionUrl
                  ? { url: claimed.callToActionUrl }
                  : {}),
              },
            }
          : {}),
        ...(claimed.mediaUrl
          ? {
              media: [
                { mediaFormat: "PHOTO" as const, sourceUrl: claimed.mediaUrl },
              ],
            }
          : {}),
      },
    );
    publishedPostName = result.publishedPostName;
  } catch (error) {
    const { reason, message } = messageForGbpFailure(error);
    await GbpScheduledPostRepository.markFailed(claimed.id, message);
    return { ok: false, reason, message };
  }

  try {
    await GbpScheduledPostRepository.markPublished(
      claimed.id,
      publishedPostName,
    );
  } catch {
    // Google ALREADY accepted this post -- createLocalPost above returned
    // successfully. Left at `publishing` rather than marked `failed`: a
    // `failed` row reads as "never went out" and would invite a retry that
    // calls createLocalPost a SECOND time, risking a duplicate post on a
    // listing that already has this one.
    return {
      ok: false,
      reason: "blocked",
      message:
        "Google Business Profile accepted this post, but saving that here failed -- check the profile directly before retrying, to avoid posting it twice.",
    };
  }
  return { ok: true, publishedPostId: publishedPostName };
}

type PublishDueOutcome = {
  attempted: number;
  published: number;
  failed: number;
};

/**
 * Runs the pure model's publish queue (gbpPostSchedule.ts's buildPublishQueue)
 * for real: loads every scheduled post for a project, keeps only the due
 * ones in publish order, and publishes each in turn.
 *
 * There is no background cron calling this. It only ever runs from the
 * user's own "Publish due posts" click (GbpScheduledPostsList.tsx) -- which
 * is what keeps every actual Google-side write behind an explicit
 * confirmation, even though the SCHEDULING decision happened earlier. Wiring
 * an unattended trigger to call this on a timer is a reasonable next step,
 * but a deliberately separate one: it changes "every write is explicitly
 * user-confirmed" into "every write was confirmed at schedule time," which
 * deserves its own explicit decision rather than arriving as a side effect
 * of this function existing.
 */
async function publishDuePosts(projectId: string): Promise<PublishDueOutcome> {
  const posts = await GbpScheduledPostRepository.listByProject(projectId);
  const due = buildPublishQueue(posts, new Date());

  let published = 0;
  let failed = 0;
  for (const post of due) {
    const outcome = await publishPost({ postId: post.id, projectId });
    if (outcome.ok) published += 1;
    else failed += 1;
  }
  return { attempted: due.length, published, failed };
}

type ListingFieldUpdate =
  | { kind: "description"; description: string }
  | {
      kind: "primaryCategory";
      category: { name: string; displayName: string };
    }
  | {
      kind: "addAdditionalCategory";
      category: { name: string; displayName: string };
    };

type ApplyListingUpdateOutcome = { ok: true } | GbpBlockedOutcome;

/** Applies exactly one listing field fix, each matched to one GBP Audit
 *  check (description or category -- see GbpListingFixButton.tsx, which is
 *  the only caller and only offers a fix for checks this can actually make).
 *  `addAdditionalCategory` reads the location's CURRENT categories first,
 *  because Google's patch replaces the whole array named by the update
 *  mask -- without the read, appending one category would silently delete
 *  every other one already on the listing. */
async function applyListingUpdate(input: {
  projectId: string;
  update: ListingFieldUpdate;
}): Promise<ApplyListingUpdateOutcome> {
  const gate = await requireWritableConnection(input.projectId);
  if ("blocked" in gate) return gate.blocked;

  const client = createGbpClient({ userId: gate.connection.connectedByUserId });
  const locationName = gate.connection.locationName;

  try {
    if (input.update.kind === "description") {
      await client.patchLocation(
        locationName,
        { profile: { description: input.update.description } },
        ["profile.description"],
      );
    } else if (input.update.kind === "primaryCategory") {
      await client.patchLocation(
        locationName,
        { categories: { primaryCategory: input.update.category } },
        ["categories.primaryCategory"],
      );
    } else {
      const current = await client.getLocation(locationName, [
        "categories.additionalCategories",
      ]);
      const existing = current.categories?.additionalCategories ?? [];
      await client.patchLocation(
        locationName,
        {
          categories: {
            additionalCategories: [...existing, input.update.category],
          },
        },
        ["categories.additionalCategories"],
      );
    }
    return { ok: true };
  } catch (error) {
    const { reason, message } = messageForGbpFailure(error);
    return { ok: false, reason, message };
  }
}

type SearchCategoriesOutcome =
  | { ok: true; categories: GbpCategorySuggestion[] }
  | GbpBlockedOutcome;

/** Resolves free-text category names the user types into Google's fixed
 *  taxonomy IDs -- a bare display name is not itself a valid
 *  primaryCategory/additionalCategories value (see applyListingUpdate). */
async function searchCategories(input: {
  projectId: string;
  query: string;
  regionCode: string;
  languageCode: string;
}): Promise<SearchCategoriesOutcome> {
  const gate = await requireWritableConnection(input.projectId);
  if ("blocked" in gate) return gate.blocked;

  const client = createGbpClient({ userId: gate.connection.connectedByUserId });
  const categories = await client.searchCategories({
    query: input.query,
    regionCode: input.regionCode,
    languageCode: input.languageCode,
  });
  return { ok: true, categories };
}

export const GbpWriteService = {
  schedulePost,
  publishPost,
  publishDuePosts,
  applyListingUpdate,
  searchCategories,
};
