import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { GbpConnectionService } from "@/server/features/gbp/services/GbpConnectionService";
import { GbpWriteService } from "@/server/features/gbp/services/GbpWriteService";
import { GbpScheduledPostRepository } from "@/server/features/gbp/repositories/GbpScheduledPostRepository";
import { createSelfHostedGbpAuthorizationUrl } from "@/server/features/gbp/selfHostedGbpOAuth";
import { captureServerEvent } from "@/server/lib/posthog";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const postIdSchema = projectScopedSchema.extend({ postId: z.string().min(1) });
const setConnectionSchema = projectScopedSchema.extend({
  locationName: z.string().min(1),
  // The chosen location's account resource name ("accounts/123") -- required
  // so publishing can later compose the v4 localPosts parent. See
  // gbpConnections.accountName's column comment for why this is separate
  // from locationName.
  accountName: z.string().min(1),
});
const startSelfHostedLinkSchema = z.object({
  callbackURL: z.string().min(1),
});

const ctaTypeSchema = z.enum([
  "BOOK",
  "ORDER",
  "SHOP",
  "LEARN_MORE",
  "SIGN_UP",
  "CALL",
]);

const schedulePostSchema = projectScopedSchema.extend({
  content: z.string(),
  mediaUrl: z.string().nullable(),
  callToActionType: ctaTypeSchema.nullable(),
  callToActionUrl: z.string().nullable(),
  scheduledAt: z.string(),
});

const categoryRefSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
});

const listingUpdateSchema = projectScopedSchema.extend({
  update: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("description"), description: z.string() }),
    z.object({
      kind: z.literal("primaryCategory"),
      category: categoryRefSchema,
    }),
    z.object({
      kind: z.literal("addAdditionalCategory"),
      category: categoryRefSchema,
    }),
  ]),
});

const searchCategoriesSchema = projectScopedSchema.extend({
  query: z.string().min(1),
  regionCode: z.string().min(2),
  languageCode: z.string().min(2),
});

// ---------------------------------------------------------------------------
// Connection lifecycle -- mirrors src/serverFunctions/gsc.ts's shape, against
// the wholly separate google-business-profile grant/table.
// ---------------------------------------------------------------------------

export const getGbpConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant] = await Promise.all([
      GbpConnectionService.getConnection(context.projectId),
      GbpConnectionService.userHasGrant(context.userId),
    ]);
    return {
      connected: Boolean(connection),
      currentUserHasGrant,
      locationName: connection?.locationName ?? null,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const listGbpLocations = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [result, connection] = await Promise.all([
      GbpConnectionService.listAvailableLocationsForUser(context.userId),
      GbpConnectionService.getConnection(context.projectId),
    ]);
    return {
      errorReason: result.errorReason,
      // Final wave item 2: the page cap may have been hit with more still
      // outstanding -- forwarded so the picker can say enumeration was
      // incomplete instead of asserting none exist.
      incomplete: result.incomplete,
      locations: result.locations.map((location) => ({
        ...location,
        isSelected: location.name === connection?.locationName,
      })),
    };
  });

export const setGbpConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setConnectionSchema)
  .handler(async ({ data, context }) => {
    const connection = await GbpConnectionService.setConnection({
      projectId: context.projectId,
      organizationId: context.organizationId,
      locationName: data.locationName,
      accountName: data.accountName,
      userId: context.userId,
      userEmail: context.userEmail,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "gbp:connect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: true as const, locationName: connection.locationName };
  });

export const disconnectGbp = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    await GbpConnectionService.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "gbp:disconnect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: false as const };
  });

export const startSelfHostedGbpLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(startSelfHostedLinkSchema)
  .handler(async ({ data, context }) => {
    const publicOrigin = getPublicOrigin(getRequest());
    const url = await createSelfHostedGbpAuthorizationUrl({
      user: { userId: context.userId, userEmail: context.userEmail },
      callbackURL: data.callbackURL,
      publicOrigin,
    });
    return { url };
  });

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

/** Validates and queues a post. NOT itself a Google-side write -- see
 *  GbpWriteService.schedulePost's own doc comment for why scheduling is
 *  reversible (editable/cancelable) in a way publishing is not. */
export const scheduleGbpPost = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(schedulePostSchema)
  .handler(async ({ data, context }) => {
    return GbpWriteService.schedulePost({
      projectId: context.projectId,
      content: data.content,
      mediaUrl: data.mediaUrl,
      callToActionType: data.callToActionType,
      callToActionUrl: data.callToActionUrl,
      scheduledAt: data.scheduledAt,
      createdByUserId: context.userId,
    });
  });

export const listGbpScheduledPosts = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    return GbpScheduledPostRepository.listByProject(context.projectId);
  });

/** WRITE: publishes one post to the client's live Google Business Profile.
 *  Callers must have already shown an explicit confirm step -- see
 *  GbpPostComposer.tsx / GbpScheduledPostsList.tsx. */
export const publishGbpPostNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(postIdSchema)
  .handler(async ({ data, context }) => {
    return GbpWriteService.publishPost({
      postId: data.postId,
      projectId: context.projectId,
    });
  });

/** WRITE: publishes every currently-due scheduled post for this project, in
 *  order. Callers must have already shown an explicit confirm step. */
export const publishDueGbpPosts = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    return GbpWriteService.publishDuePosts(context.projectId);
  });

// ---------------------------------------------------------------------------
// Listing field updates
// ---------------------------------------------------------------------------

/** WRITE: patches one listing field on the client's live Google Business
 *  Profile. Callers must have already shown an explicit confirm step -- see
 *  GbpListingFixButton.tsx. */
export const applyGbpListingUpdate = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listingUpdateSchema)
  .handler(async ({ data, context }) => {
    return GbpWriteService.applyListingUpdate({
      projectId: context.projectId,
      update: data.update,
    });
  });

/** Read-only category typeahead -- no write. */
export const searchGbpCategories = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchCategoriesSchema)
  .handler(async ({ data, context }) => {
    return GbpWriteService.searchCategories({
      projectId: context.projectId,
      query: data.query,
      regionCode: data.regionCode,
      languageCode: data.languageCode,
    });
  });
