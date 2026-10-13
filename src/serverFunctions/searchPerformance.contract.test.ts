import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  buildSearchAnalyticsRequest,
  type GscPerformanceInput,
} from "@/server/features/gsc/searchAnalytics";
import {
  exportSearchPerformanceTable,
  getSearchPerformanceReport,
} from "./searchPerformance";

const mocks = vi.hoisted(() => ({ pull: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    validator() {
      return this;
    },
    handler(fn: unknown) {
      return fn;
    },
  }),
}));
vi.mock("@/serverFunctions/middleware", () => ({ requireProjectContext: [] }));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getAnalyticsPerformance: mocks.pull },
  toGscUnavailable: (error: unknown) => {
    throw error;
  },
}));

const context = {
  projectId: "authorized-project",
  organizationId: "org",
  userId: "user",
  userEmail: "test@example.com",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  mocks.pull.mockImplementation(async (input: GscPerformanceInput) => ({
    siteUrl: "sc-domain:example.com",
    connectedBy: "test@example.com",
    request: buildSearchAnalyticsRequest(input, new Date(), 5000),
    rows: [
      {
        keys:
          input.dimensions?.length === 2
            ? ["rocket", "https://example.com/"]
            : ["rocket"],
        clicks: 1,
        impressions: 83,
        ctr: 1 / 83,
        position: 6.123456789,
      },
    ],
  }));
});
afterEach(() => vi.useRealTimers());

it("returns export pull provenance from the actual property/request rather than UI state", async () => {
  const request = {
    data: {
      projectId: "authorized-project",
      dateRange: "last_28_days",
      dimension: "query",
      country: "usa",
      device: "MOBILE",
    },
    context,
  } as const;
  const result = await exportSearchPerformanceTable(request);
  expect(result).toMatchObject({
    rowsExamined: 1,
    truncated: false,
    provenance: {
      source: "Google Search Console",
      property: "sc-domain:example.com",
      country: "usa",
      device: "MOBILE",
      startDate: "2026-09-13",
      endDate: "2026-10-10",
      searchType: "web",
      dataState: "all",
      capturedAt: "2026-10-13T12:00:00.000Z",
    },
  });
  expect(result.rows[0]?.ctr).toBe(1 / 83);
});

it("returns original overview query-page pull provenance for the striking-distance export", async () => {
  const request = {
    data: {
      projectId: "authorized-project",
      dateRange: "last_28_days",
      country: "usa",
      device: "MOBILE",
    },
    context,
  } as const;
  const report = await getSearchPerformanceReport(request);
  expect(report).toMatchObject({
    connected: true,
    provenance: {
      property: "sc-domain:example.com",
      country: "usa",
      device: "MOBILE",
      searchType: "web",
      dataState: "all",
      startDate: "2026-09-13",
      endDate: "2026-10-10",
      capturedAt: "2026-10-13T12:00:00.000Z",
    },
    sampling: { queryPages: { rowsExamined: 1, truncated: false } },
  });
});
