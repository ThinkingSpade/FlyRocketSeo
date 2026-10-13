import {
  GscService,
  toGscUnavailable,
} from "@/server/features/gsc/services/GscService";
import {
  resolveDateRange,
  type GscPerformanceFilter,
} from "@/server/features/gsc/searchAnalytics";
import {
  previousPeriod,
  sumSearchTotals,
  toDimensionRows,
} from "@/server/features/gsc/searchPerformanceReport";
import { pullWasTruncated } from "@/server/features/gsc/fetchAllRows";
import { AppError } from "@/server/lib/errors";
import type { PageInvestigationInput } from "@/types/schemas/page-investigation";

export async function getPagePerformance(
  input: Omit<PageInvestigationInput, "dateRange"> & {
    dateRange?: PageInvestigationInput["dateRange"];
  },
  domain: string | null,
) {
  const page = new URL(input.url);
  const ownSite = domain
    ? new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`)
    : null;
  if (
    !ownSite ||
    !["https:", "http:"].includes(page.protocol) ||
    page.username ||
    page.password ||
    page.hostname !== ownSite.hostname
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Choose a page on this project's current website. Competitor research is available separately.",
    );
  }
  const range = resolveDateRange(input);
  const previous = previousPeriod(range.startDate, range.endDate);
  const filters: GscPerformanceFilter[] = [
    { dimension: "page", operator: "equals", expression: input.url },
  ];
  if (input.country)
    filters.push({
      dimension: "country",
      operator: "equals",
      expression: input.country,
    });
  if (input.device)
    filters.push({
      dimension: "device",
      operator: "equals",
      expression: input.device,
    });
  const base = {
    projectId: input.projectId,
    filters,
    type: input.searchType,
    dataState: "final" as const,
  };
  try {
    const [current, prior, queries] = await Promise.all([
      GscService.getAnalyticsPerformance({
        ...base,
        ...range,
        dimensions: ["date"],
        rowLimit: 200,
      }),
      GscService.getAnalyticsPerformance({
        ...base,
        startDate: previous.startDate,
        endDate: previous.endDate,
        dimensions: ["date"],
        rowLimit: 200,
      }),
      GscService.getAnalyticsPerformance({
        ...base,
        ...range,
        dimensions: ["query"],
        rowLimit: 1000,
      }),
    ]);
    const coversPage = current.siteUrl.startsWith("sc-domain:")
      ? (() => {
          const propertyDomain = current.siteUrl
            .slice("sc-domain:".length)
            .toLowerCase();
          return (
            page.hostname === propertyDomain ||
            page.hostname.endsWith(`.${propertyDomain}`)
          );
        })()
      : input.url.startsWith(current.siteUrl);
    if (!coversPage) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The connected Search Console property does not cover this page. Select the matching property before saving evidence.",
      );
    }
    if (
      [current, prior, queries].some((pull) =>
        pull.rows.some(
          (row) =>
            !Number.isFinite(row.clicks) ||
            row.clicks < 0 ||
            !Number.isFinite(row.impressions) ||
            row.impressions < row.clicks ||
            !Number.isFinite(row.ctr) ||
            row.ctr < 0 ||
            row.ctr > 1 ||
            !Number.isFinite(row.position) ||
            row.position < 0 ||
            (row.impressions > 0 && row.position === 0),
        ),
      )
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid Search Console observations returned. Reload the evidence before interpreting numbers.",
      );
    }
    if (
      [prior, queries].some(
        (pull) =>
          pull.siteUrl !== current.siteUrl ||
          pull.connectedBy !== current.connectedBy,
      )
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Search Console property or account changed during this read. Reload the evidence.",
      );
    }
    if (
      current.request.startDate !== range.startDate ||
      current.request.endDate !== range.endDate ||
      queries.request.startDate !== range.startDate ||
      queries.request.endDate !== range.endDate ||
      prior.request.startDate !== previous.startDate ||
      prior.request.endDate !== previous.endDate
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Search Console changed a requested evidence window. Select complete comparable windows within the available history.",
      );
    }
    return {
      connected: true as const,
      source: "Google Search Console" as const,
      fetchedAt: new Date().toISOString(),
      scope: {
        ...input,
        siteUrl: current.siteUrl,
        connectedBy: current.connectedBy,
      },
      range: {
        ...range,
        prevStartDate: previous.startDate,
        prevEndDate: previous.endDate,
      },
      totals: sumSearchTotals(current.rows),
      prevTotals: sumSearchTotals(prior.rows),
      queries: toDimensionRows(queries.rows),
      coverage: {
        currentRows: current.rows.length,
        previousRows: prior.rows.length,
        currentTruncated: pullWasTruncated(current),
        previousTruncated: pullWasTruncated(prior),
        queryRows: queries.rows.length,
        queryTruncated: pullWasTruncated(queries),
        finalData: true,
      },
    };
  } catch (error) {
    return toGscUnavailable(error, {
      projectId: input.projectId,
      surface: "pageInvestigation",
    });
  }
}
