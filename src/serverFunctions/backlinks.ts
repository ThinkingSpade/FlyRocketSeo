import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import {
  mapBacklinksTimeline,
  type BacklinksTimelinePoint,
} from "@/server/features/backlinks/services/backlinksTimeline";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  anchorsPageRequestSchema,
  backlinksOverviewInputSchema,
  backlinksRowsPageRequestSchema,
  referringDomainsPageRequestSchema,
  topPagesPageRequestSchema,
} from "@/types/schemas/backlinks";

// The web UI exposes spam score as a regular user filter, so the implicit
// DataForSEO spam-score cutoff stays off for all web requests.
const WEB_SPAM_OPTIONS = { hideSpam: false };

export const getBacklinksOverview = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(backlinksOverviewInputSchema)
  .handler(async ({ data, context }) => {
    const profile = await BacklinksService.profileOverview(
      {
        target: data.target,
        scope: data.scope,
      },
      context,
    );
    return profile.overview;
  });

export const getBacklinksRows = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(backlinksRowsPageRequestSchema)
  .handler(({ data, context }) =>
    BacklinksService.profileBacklinksPage(data, context, WEB_SPAM_OPTIONS),
  );

export const getBacklinksReferringDomains = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(referringDomainsPageRequestSchema)
  .handler(({ data, context }) =>
    BacklinksService.profileReferringDomainsPage(
      data,
      context,
      WEB_SPAM_OPTIONS,
    ),
  );

export const getBacklinksTopPages = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(topPagesPageRequestSchema)
  .handler(({ data, context }) =>
    BacklinksService.profileTopPagesPage(data, context),
  );

export const getBacklinksAnchors = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(anchorsPageRequestSchema)
  .handler(({ data, context }) =>
    BacklinksService.profileAnchorsPage(data, context),
  );

/** Timelines shift monthly; a day of cache keeps repeat views free. */
const TIMELINE_TTL_SECONDS = 24 * 60 * 60;
const TIMELINE_MONTHS = 12;

const timelinePointSchema = z.object({
  date: z.string(),
  referringDomains: z.number().nullable(),
  newReferringDomains: z.number(),
  lostReferringDomains: z.number(),
  newBacklinks: z.number(),
  lostBacklinks: z.number(),
});

const timelineResultSchema = z.object({
  points: z.array(timelinePointSchema),
  fetchedAt: z.string(),
});

const timelineRequestSchema = z.object({
  projectId: z.string().min(1),
  target: z.string().min(1).max(255),
});

/**
 * New/lost referring domains and backlinks per month for the last year — one
 * metered history call per target per day (R2-cached).
 */
export const getBacklinksTimeline = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(timelineRequestSchema)
  .handler(async ({ data, context }) => {
    const normalized = normalizeBacklinksTarget(data.target, {
      scope: "domain",
    });

    const cacheKey = await buildCacheKey("backlinks:timeline", {
      organizationId: context.organizationId,
      target: normalized.apiTarget,
    });
    const cached = timelineResultSchema.safeParse(await getCached(cacheKey));
    if (cached.success && cached.data.points.length > 0) {
      return cached.data;
    }

    const now = new Date();
    const from = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - (TIMELINE_MONTHS - 1),
        1,
      ),
    );
    const toIso = now.toISOString().slice(0, 10);
    const fromIso = from.toISOString().slice(0, 10);

    const dataforseo = createDataforseoClient(context);
    const items = await dataforseo.backlinks.history({
      target: normalized.apiTarget,
      dateFrom: fromIso,
      dateTo: toIso,
    });

    const result: { points: BacklinksTimelinePoint[]; fetchedAt: string } = {
      points: mapBacklinksTimeline(items),
      fetchedAt: new Date().toISOString(),
    };

    if (result.points.length > 0) {
      void setCached(cacheKey, result, TIMELINE_TTL_SECONDS).catch((error) => {
        console.error("backlinks.timeline cache-write failed:", error);
      });
    }

    return result;
  });
