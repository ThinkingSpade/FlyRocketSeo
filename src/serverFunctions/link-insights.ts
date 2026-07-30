import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import { pullWasTruncated } from "@/server/features/gsc/fetchAllRows";
import { fetchValidatingEveryHop } from "@/server/lib/audit/url-policy";
import { isSameOrigin } from "@/server/lib/audit/url-utils";
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
      const result = await GscService.getAnalyticsPerformance({
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
        // Both lists are conclusions about what ISN'T there, drawn from a
        // clicks-ordered pull that Search Console does not promise is complete.
        // Without this the UI could not tell "your site is fine" from "we
        // didn't look past row 1000", and it said the former.
        rowsExamined: result.rows.length,
        truncated: pullWasTruncated(result),
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

    // Both URLs must belong to THIS PROJECT, not merely to each other.
    //
    // Matching source against target only is self-authorizing: a member of any
    // project could pass two URLs on an unrelated public site and use the
    // `mentionsPhrase` result as an oracle against it, varying `phrase` to
    // bypass the cache. That is a general-purpose proxy, which the previous
    // comment claimed this check prevented. The boundary has to come from the
    // project, so it is derived from `context.project.domain`.
    const projectDomain = context.project.domain?.trim();
    if (!projectDomain) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Set this project's domain before checking link presence.",
      );
    }
    const projectOrigin = `https://${projectDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;

    for (const url of [source, target]) {
      if (!isSameOrigin(url.toString(), projectOrigin)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Source and target must both be on this project's own site.",
        );
      }
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
      // Every hop is re-validated against the crawl URL policy AND pinned to the
      // project's own origin.
      //
      // This used to be `fetch(..., { redirect: "follow" })` behind a check on
      // the SUBMITTED hostname only. An authenticated project member could
      // therefore submit a page they control that answers
      // `302 Location: http://127.0.0.1:8787/…`, and the Worker would make that
      // request itself — straight past the private-address protections in
      // url-policy.ts. Following redirects means letting a remote server pick
      // our next request, so it cannot be delegated to fetch().
      //
      // Pinning to `projectOrigin` rather than `source.origin` matters: the
      // source is user input, so using its own origin as the boundary let the
      // submitter define what counted as in-bounds.
      const { response } = await fetchValidatingEveryHop(
        data.sourceUrl,
        {
          headers: {
            "User-Agent": "FlyRocketSEO-Audit/1.0",
            Accept: "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
        },
        { allowHop: (hop) => isSameOrigin(hop.toString(), projectOrigin) },
      );
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
          const { analyzeLinkPresence } =
            await import("@/server/features/gsc/linkPresence");
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
