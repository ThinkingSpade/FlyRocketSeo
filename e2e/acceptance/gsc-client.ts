import { env } from "cloudflare:workers";
import type {
  GscSearchAnalyticsRequest,
  GscSearchAnalyticsRow,
} from "../../src/server/lib/gscClient";
export { GscApiError, GscTokenError } from "../../src/server/lib/gscClient";
export type {
  GscSite,
  UrlInspectionResult,
  GscSearchAnalyticsRequest,
  GscSearchAnalyticsRow,
} from "../../src/server/lib/gscClient";

// Only the remote provider adapter is mocked. GscService still reads the
// selected property from real local D1 and server functions still authorize.
export function createGscClient({ userId }: { userId: string }) {
  return {
    listSites: async () => [
      { siteUrl: "sc-domain:primary.example", permissionLevel: "siteOwner" },
    ],
    querySearchAnalytics: async (
      siteUrl: string,
      request: GscSearchAnalyticsRequest,
    ) => {
      await env.KV.put(
        "acceptance:last-gsc-request",
        JSON.stringify({ userId, siteUrl, request }),
      );
      const dimensions = request.dimensions ?? [];
      const operationScope = siteUrl === "sc-domain:operation.example";
      const page =
        request.dimensionFilterGroups
          ?.flatMap((group) => group.filters)
          .find(
            (filter) =>
              filter.dimension === "page" && filter.operator === "equals",
          )?.expression ?? "https://primary.example/guide";
      const row: GscSearchAnalyticsRow = {
        keys: dimensions.map(
          (dimension) =>
            ({
              page,
              query: "rocket guide",
              date: request.endDate,
              country: "usa",
              device: "MOBILE",
            })[dimension] ?? dimension,
        ),
        clicks: 24,
        impressions: 1000,
        ctr: 0.024,
        position: 8,
      };
      if (operationScope && !request.startRow) {
        const paths = ["guide", "healthy"];
        return {
          rows: paths.map((path, index) => ({
            ...row,
            keys: dimensions.map((dimension) =>
              dimension === "page"
                ? `https://operation.example/${path}`
                : dimension === "query"
                  ? "operation rocket guide"
                  : dimension === "country"
                    ? "usa"
                    : dimension === "device"
                      ? "DESKTOP"
                      : request.endDate,
            ),
            clicks: index === 0 ? 24 : 20,
            impressions: index === 0 ? 1000 : 300,
            position: index === 0 ? 8 : 11,
          })),
          responseAggregationType: request.aggregationType ?? "byPage",
        };
      }
      return {
        rows: request.startRow
          ? []
          : dimensions.length === 1 &&
              dimensions[0] === "page" &&
              request.dimensionFilterGroups?.some((group) =>
                group.filters.some(
                  (filter) =>
                    filter.dimension === "query" &&
                    filter.expression === "rocket guide",
                ),
              )
            ? ["guide", "healthy", "existing"].map((path) => ({
                ...row,
                keys: [`https://primary.example/${path}`],
              }))
            : [row],
        responseAggregationType: request.aggregationType ?? "byPage",
      };
    },
    inspectUrl: async () => ({
      indexStatusResult: {
        verdict: "PASS",
        coverageState: "Submitted and indexed",
        pageFetchState: "SUCCESSFUL",
      },
    }),
  };
}
