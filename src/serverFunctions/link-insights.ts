import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import {
  buildCannibalizationRows,
  buildLinkOpportunities,
} from "@/server/features/gsc/linkInsights";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  linkInsightsRequestSchema,
  linkPresenceRequestSchema,
} from "@/types/schemas/link-insights";

// query x page fan-out; matches the Search Performance striking-distance scan.
const QUERY_PAGE_ROW_LIMIT = 1000;

/** A day of cache per (source, target, phrase): pages change slowly, and the
 *  check exists to triage suggestions, not audit in real time. */
const LINK_PRESENCE_TTL_SECONDS = 24 * 60 * 60;

const PAGE_FETCH_TIMEOUT_MS = 15_000;
// Cap what we parse; a pathological page must not burn the CPU budget.
const MAX_HTML_CHARS = 3_000_000;

const linkPresenceResultSchema = z.object({
  linksToTarget: z.boolean(),
  mentionsPhrase: z.boolean(),
  error: z.string().nullable(),
});

/**
 * Link Opportunities + Cannibalization, both shaped from one `["query","page"]`
 * Search Analytics fetch over the last 28 days. All first-party GSC data, free.
 */
export const getLinkInsights = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(linkInsightsRequestSchema)
  .handler(async ({ context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: "last_28_days",
    });

    try {
      const result = await GscService.getPerformance({
        projectId: context.projectId,
        startDate,
        endDate,
        dimensions: ["query", "page"],
        filters: [],
        rowLimit: QUERY_PAGE_ROW_LIMIT,
      });

      return {
        connected: true as const,
        range: { startDate, endDate },
        opportunities: buildLinkOpportunities(result.rows),
        cannibalization: buildCannibalizationRows(result.rows),
      };
    } catch (error) {
      if (
        error instanceof GscNotConnectedError ||
        isExpectedGrantFailure(error)
      ) {
        return { connected: false as const };
      }
      throw error;
    }
  });

/**
 * Live-check ONE suggested source page: does it already link to the target,
 * and does it mention the anchor phrase? One fetch + one parse per invocation
 * keeps each call inside the Worker CPU budget; the client fans out per row.
 */
export const checkLinkPresence = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(linkPresenceRequestSchema)
  .handler(async ({ data, context }) => {
    const source = new URL(data.sourceUrl);
    const target = new URL(data.targetUrl);
    // Internal-link checks are within-site by definition; refusing cross-host
    // input also keeps this endpoint from being a generic proxy.
    if (
      source.hostname.replace(/^www\./, "") !==
      target.hostname.replace(/^www\./, "")
    ) {
      throw new Error("Source and target must be on the same site.");
    }

    const cacheKey = await buildCacheKey("link-presence", {
      organizationId: context.organizationId,
      sourceUrl: data.sourceUrl,
      targetUrl: data.targetUrl,
      phrase: data.phrase.trim().toLowerCase(),
    });
    const cached = linkPresenceResultSchema.safeParse(
      await getCached(cacheKey),
    );
    if (cached.success) {
      return cached.data;
    }

    let result: {
      linksToTarget: boolean;
      mentionsPhrase: boolean;
      error: string | null;
    };
    try {
      const response = await fetch(data.sourceUrl, {
        headers: {
          "User-Agent": "FlyRocketSEO-Audit/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        result = {
          linksToTarget: false,
          mentionsPhrase: false,
          error: `Page returned ${response.status}`,
        };
      } else {
        const html = await response.text();
        if (html.length > MAX_HTML_CHARS) {
          result = {
            linksToTarget: false,
            mentionsPhrase: false,
            error: "Page too large to analyze",
          };
        } else {
          // Dynamic import keeps cheerio out of the worker's startup graph
          // (same reasoning as the audit's page analyzer).
          const { analyzeLinkPresence } = await import(
            "@/server/features/gsc/linkPresence"
          );
          result = {
            ...analyzeLinkPresence(html, {
              sourceUrl: data.sourceUrl,
              targetUrl: data.targetUrl,
              phrase: data.phrase,
            }),
            error: null,
          };
        }
      }
    } catch {
      result = {
        linksToTarget: false,
        mentionsPhrase: false,
        error: "Couldn't fetch the page",
      };
    }

    void setCached(cacheKey, result, LINK_PRESENCE_TTL_SECONDS).catch(
      (cacheError) => {
        console.error("link-presence cache-write failed:", cacheError);
      },
    );
    return result;
  });
