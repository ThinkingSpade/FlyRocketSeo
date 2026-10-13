import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "fixture-key",
}));
import {
  fetchGoogleReviewsResult,
  fetchMyBusinessInfo,
  fetchQuestionsAnswers,
  postGoogleReviewsTask,
} from "./business";

const path = ["v3", "business_data", "google", "my_business_info", "live"];
function response(
  result: unknown[],
  statusCode = 20000,
  statusMessage = "Ok.",
) {
  return Response.json({
    status_code: 20000,
    tasks: [
      {
        id: "task-1",
        status_code: statusCode,
        status_message: statusMessage,
        path,
        cost: 0.01,
        result,
      },
    ],
  });
}
const input = { keyword: "Acme", locationCode: 2840, languageCode: "en" };
describe("BusinessData observation contracts", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  it("rejects a missing business observation without calling it a not-found business", async () => {
    vi.mocked(fetch).mockResolvedValue(response([{}]));
    await expect(fetchMyBusinessInfo(input)).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      billing: { costUsd: 0.01 },
    });
  });
  it("preserves a recognized no-search-results response as observed not found", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response([], 40501, "No Search Results."),
    );
    expect((await fetchMyBusinessInfo(input)).data).toBeNull();
  });
  it("rejects malformed Q&A observations rather than silently flattening them to empty", async () => {
    vi.mocked(fetch).mockResolvedValue(response([{ items: "bad" }]));
    await expect(
      fetchQuestionsAnswers({
        keyword: "Acme",
        locationCoordinate: "0,0",
        languageCode: "en",
        depth: 20,
      }),
    ).rejects.toMatchObject({ name: "DataforseoChargedTaskError" });
  });
  it("retains billed evidence when a queued review post is rejected", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response([], 40501, "Invalid Field: 'keyword'."),
    );
    await expect(
      postGoogleReviewsTask({ ...input, depth: 30 }),
    ).rejects.toMatchObject({
      name: "DataforseoChargedTaskError",
      billing: { costUsd: 0.01 },
      isInvalidField: true,
    });
  });
  it("normalizes invalid completed review summary fields to unknown", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response([{ rating: { value: 9 }, reviews_count: 0.5, items: [] }]),
    );
    expect(await fetchGoogleReviewsResult("task-1")).toMatchObject({
      status: "completed",
      rating: null,
      reviewsCount: null,
      items: [],
    });
  });
  it("keeps zero review count distinct from missing count", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response([{ rating: { value: 4.4 }, reviews_count: 0, items: [] }]),
    );
    expect(await fetchGoogleReviewsResult("task-1")).toMatchObject({
      status: "completed",
      rating: 4.4,
      reviewsCount: 0,
    });
  });
});
