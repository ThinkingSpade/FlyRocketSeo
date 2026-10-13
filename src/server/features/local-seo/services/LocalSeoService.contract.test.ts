import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemsGoogleBusinessInfo, RatingInfo } from "dataforseo-client";
const state = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  objects: new Map<string, string>(),
  profile: vi.fn(),
  post: vi.fn(),
  collect: vi.fn(),
  failWrite: false,
}));
vi.mock("cloudflare:workers", () => ({
  env: {
    R2: {
      put: async (key: string, body: string) => {
        if (state.failWrite) throw new Error("isolated R2 write failure");
        state.objects.set(key, body);
      },
    },
  },
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: unknown) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => state.cache.get(key) ?? null,
  setCached: async (key: string, value: unknown) => {
    state.cache.set(key, value);
  },
  getRunPayload: async (key: string) =>
    state.objects.get(`analysis-runs/${key}`) ?? null,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    business: { myBusinessInfo: state.profile, postReviewsTask: state.post },
  }),
}));
vi.mock("@/server/lib/dataforseo/business", () => ({
  fetchGoogleReviewsResult: state.collect,
}));
import { LocalSeoService } from "./LocalSeoService";
const customer = {
  organizationId: "org-1",
  userId: "user-1",
  userEmail: "one@example.com",
};
const input = {
  projectId: "project-1",
  keyword: "Acme",
  locationCode: 2840,
  languageCode: "en",
};
describe("Local SEO cache and reviews ownership", () => {
  beforeEach(() => {
    state.cache.clear();
    state.objects.clear();
    state.failWrite = false;
    state.profile.mockReset();
    state.post.mockReset().mockResolvedValue({ taskId: "reviews-1" });
    state.collect
      .mockReset()
      .mockResolvedValue({
        status: "completed",
        rating: 4.4,
        reviewsCount: 2,
        items: [],
      });
  });
  it("caches a genuine not-found observation without spending again", async () => {
    state.profile.mockResolvedValue(null);
    const first = await LocalSeoService.getBusinessProfile(input, customer);
    expect(await LocalSeoService.getBusinessProfile(input, customer)).toEqual(
      first,
    );
    expect(state.profile).toHaveBeenCalledTimes(1);
  });
  it("keeps source, capture and exact market/project scope through restoration", async () => {
    state.profile.mockResolvedValue(
      new ItemsGoogleBusinessInfo({
        title: "Acme",
        rating: new RatingInfo({ value: 0, votes_count: 0 }),
      }),
    );
    const first = await LocalSeoService.getBusinessProfile(input, customer);
    expect(first).toMatchObject({
      source: "DataForSEO Business Data",
      contractVersion: 2,
      scope: { ...input, organizationId: "org-1" },
      rating: 0,
      reviewsCount: 0,
    });
    expect(
      (await LocalSeoService.getCachedBusinessContext("project-1", customer))
        ?.profile,
    ).toEqual(first);
    expect(
      await LocalSeoService.getCachedBusinessContext("project-1", {
        ...customer,
        organizationId: "org-2",
      }),
    ).toBeNull();
  });
  it("denies foreign and unknown review tasks before provider collection", async () => {
    await LocalSeoService.startReviewsFetch({ ...input, depth: 30 }, customer);
    await expect(
      LocalSeoService.getReviewsResult(
        { projectId: "project-1", taskId: "reviews-1" },
        { ...customer, organizationId: "org-2" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      LocalSeoService.getReviewsResult(
        { projectId: "project-2", taskId: "reviews-1" },
        customer,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.collect).not.toHaveBeenCalled();
  });
  it("reuses completed reviews with original capture metadata and no new paid post", async () => {
    await LocalSeoService.startReviewsFetch({ ...input, depth: 30 }, customer);
    const first = await LocalSeoService.getReviewsResult(
      { projectId: "project-1", taskId: "reviews-1" },
      customer,
    );
    expect(first).toMatchObject({
      status: "completed",
      source: "DataForSEO Google Reviews",
      scope: { ...input, organizationId: "org-1" },
    });
    if (first.status !== "completed")
      throw new Error("Expected completed reviews");
    expect(typeof first.fetchedAt).toBe("string");
    expect(
      await LocalSeoService.getReviewsResult(
        { projectId: "project-1", taskId: "reviews-1" },
        customer,
      ),
    ).toEqual(first);
    expect(state.collect).toHaveBeenCalledTimes(1);
    expect(state.post).toHaveBeenCalledTimes(1);
  });
  it("keeps invalid review ratings and impossible calendar dates unavailable", async () => {
    state.collect.mockResolvedValue({
      status: "completed",
      rating: 4.4,
      reviewsCount: 1,
      items: [
        {
          review_id: "r-1",
          rating: { value: -1 },
          timestamp: "2026-02-31 12:00:00 +00:00",
        },
      ],
    });
    await LocalSeoService.startReviewsFetch({ ...input, depth: 30 }, customer);
    expect(
      await LocalSeoService.getReviewsResult(
        { projectId: "project-1", taskId: "reviews-1" },
        customer,
      ),
    ).toMatchObject({ items: [{ rating: null, timestamp: null }] });
  });
  it("returns the already-paid task ID and a visible receipt warning on storage failure", async () => {
    state.failWrite = true;
    const result = await LocalSeoService.startReviewsFetch(
      { ...input, depth: 30 },
      customer,
    );
    expect(result).toMatchObject({ taskId: "reviews-1", receiptSaved: false });
    expect(result.warning).toContain("reviews-1");
    expect(state.post).toHaveBeenCalledTimes(1);
  });
});
