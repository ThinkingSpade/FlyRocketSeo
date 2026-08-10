import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { keywordDiscoveryResultSchema } from "@/types/schemas/keyword-discovery";
import type { StoredMetricGeo } from "@/types/schemas/geo";

// The record-then-rethrow property is what the whole no-repeat-billing
// guarantee rests on (see runKeywordDiscovery's catch block): a failed paid
// attempt must leave a durable row AND the caller must still see the error.
// A future refactor that drops either half breaks that guarantee silently --
// no sibling "orchestration service" test in this repo covers it, because no
// sibling service is load-bearing for spend the way this one is.
//
// Mocking style follows SerpOverviewService.test.ts (same shape: a service
// that wraps a provider call, r2-cache, and AnalysisRunService.record):
// vi.hoisted() for the mock fns referenced inside vi.mock factories, and
// implementations re-armed in beforeEach because this repo's vitest.config
// sets `restoreMocks: true`, which wipes a vi.fn()'s implementation (not
// just its call history) before every test.
const mocks = vi.hoisted(() => ({
  getKeywordsPage: vi.fn(),
  record: vi.fn(),
  buildCacheKey: vi.fn(),
  setCached: vi.fn(),
}));

vi.mock("@/server/features/domain/services/domainKeywordsPage", () => ({
  getKeywordsPage: mocks.getKeywordsPage,
}));
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: { record: mocks.record },
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: mocks.buildCacheKey,
  setCached: mocks.setCached,
}));

import { runKeywordDiscovery } from "./keywordDiscovery";

const billingCustomer = {
  organizationId: "org_123",
  userId: "user_123",
  userEmail: "team@example.com",
};

const geo: StoredMetricGeo = {
  locationCode: 2840,
  parentCountryCode: 2840,
  languageCode: "en",
  provider: "labs",
  scope: "national",
  label: "United States",
};

const input = {
  projectId: "project_123",
  domain: "example.com",
  locationCode: 2840,
  languageCode: "en",
  geo,
};

/**
 * The payload the service actually wrote under the cache key on its most
 * recent call, parsed through the real schema rather than cast with `as`.
 * `mock.calls` is untyped (`any[]`), so validating through
 * `keywordDiscoveryResultSchema` is what gives the result back a real,
 * narrowable `KeywordDiscoveryResult` type -- and it doubles as a check that
 * whatever the service records still matches the schema Task 5/6 read it
 * back with.
 */
function lastRecordedResult() {
  const calls = mocks.setCached.mock.calls;
  const lastCall = calls[calls.length - 1];
  if (!lastCall) throw new Error("setCached was never called");
  return keywordDiscoveryResultSchema.parse(lastCall[1]);
}

beforeEach(() => {
  mocks.buildCacheKey.mockImplementation(
    async (prefix: string, params: Record<string, unknown>) =>
      `${prefix}:${JSON.stringify(params)}`,
  );
  mocks.setCached.mockResolvedValue(undefined);
  mocks.record.mockResolvedValue(undefined);
});

it("records status: 'ok' and returns the mapped keywords on success", async () => {
  mocks.getKeywordsPage.mockResolvedValue({
    domain: "example.com",
    page: 1,
    pageSize: 100,
    totalCount: 1,
    hasMore: false,
    keywords: [
      {
        keyword: "flying lessons",
        position: 3,
        searchVolume: 500,
        traffic: 40,
        cpc: 2.1,
        url: "https://example.com/flying",
        relativeUrl: "/flying",
        keywordDifficulty: 22,
      },
    ],
    fetchedAt: "2026-08-10T00:00:00.000Z",
  });

  const result = await runKeywordDiscovery(input, billingCustomer);

  expect(result).toEqual({
    status: "ok",
    domain: "example.com",
    fetchedAt: "2026-08-10T00:00:00.000Z",
    keywords: [
      {
        keyword: "flying lessons",
        position: 3,
        searchVolume: 500,
        traffic: 40,
        cpc: 2.1,
        url: "https://example.com/flying",
        relativeUrl: "/flying",
        keywordDifficulty: 22,
      },
    ],
  });

  // The payload actually written under the cache key -- the durable row a
  // restore reads back -- must be the "ok" result, not just a pointer.
  expect(mocks.setCached).toHaveBeenCalledTimes(1);
  expect(lastRecordedResult()).toEqual(result);

  expect(mocks.record).toHaveBeenCalledTimes(1);
  expect(mocks.record).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: "project_123",
      feature: "keyword_discovery",
      label: "example.com",
    }),
  );
});

it("records status: 'failed' and rethrows the ORIGINAL error, unmodified", async () => {
  const providerError = new AppError("INSUFFICIENT_CREDITS");
  mocks.getKeywordsPage.mockRejectedValue(providerError);

  // .toBe, not .toThrow(Error) -- this asserts the exact same error
  // instance crosses the catch block. A refactor that swallows the error
  // and throws a new generic one, or that returns the "failed" result
  // instead of throwing, must fail this test.
  await expect(runKeywordDiscovery(input, billingCustomer)).rejects.toBe(
    providerError,
  );

  expect(mocks.setCached).toHaveBeenCalledTimes(1);
  const recordedPayload = lastRecordedResult();
  expect(recordedPayload.status).toBe("failed");
  if (recordedPayload.status === "failed") {
    expect(recordedPayload.reason).toBe("insufficient_credits");
    expect(typeof recordedPayload.attemptedAt).toBe("string");
  }

  expect(mocks.record).toHaveBeenCalledTimes(1);
  expect(mocks.record).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: "project_123",
      feature: "keyword_discovery",
      label: "example.com",
    }),
  );
});

it("classifies a failure by AppError.code, not by matching error.message text", async () => {
  // Regression coverage for the code-review finding this replaced: the
  // previous implementation ran a regex over `error.message` and only
  // happened to work because AppError("INSUFFICIENT_CREDITS")'s message
  // defaults to the code string and DataForSEO's rate-limit AppError's
  // message happens to contain "429". Neither message format is a promise
  // -- `code` is -- so these cases pin behavior against `code`, using
  // messages that would NOT match the old regexes.
  mocks.getKeywordsPage.mockRejectedValueOnce(
    new AppError("RATE_LIMITED", "Too many requests upstream"),
  );
  await expect(
    runKeywordDiscovery(input, billingCustomer),
  ).rejects.toBeInstanceOf(AppError);
  const rateLimited = lastRecordedResult();
  expect(rateLimited.status).toBe("failed");
  if (rateLimited.status === "failed") {
    expect(rateLimited.reason).toBe("rate_limited");
  }

  mocks.setCached.mockClear();
  mocks.getKeywordsPage.mockRejectedValueOnce(
    new AppError("UPSTREAM_UNAVAILABLE", "no rate or credit words here"),
  );
  await expect(
    runKeywordDiscovery(input, billingCustomer),
  ).rejects.toBeInstanceOf(AppError);
  const genericFailure = lastRecordedResult();
  expect(genericFailure.status).toBe("failed");
  if (genericFailure.status === "failed") {
    expect(genericFailure.reason).toBe("provider_error");
  }
});
