import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GbpScheduledPost } from "@/server/features/gbp/repositories/GbpScheduledPostRepository";

const mocks = vi.hoisted(() => ({
  isGbpWriteConfigured: vi.fn(),
  connectionGetByProjectId: vi.fn(),
  postGetById: vi.fn(),
  claimForPublishing: vi.fn(),
  markPublished: vi.fn(),
  markFailed: vi.fn(),
  createLocalPost: vi.fn(),
}));

// Every dependency below is mocked wholesale (not importOriginal) -- none of
// them are under test here (that's GbpScheduledPostRepository.test.ts and
// gbpClient.test.ts's job), and mocking them fully avoids needing to also
// stub `cloudflare:workers`/`@/db`, which their own real implementations
// reach transitively.
vi.mock("@/server/features/gbp/oauth-config", () => ({
  isGbpWriteConfigured: mocks.isGbpWriteConfigured,
}));

vi.mock("@/server/features/gbp/repositories/GbpConnectionRepository", () => ({
  GbpConnectionRepository: {
    getByProjectId: mocks.connectionGetByProjectId,
  },
}));

vi.mock(
  "@/server/features/gbp/repositories/GbpScheduledPostRepository",
  () => ({
    GbpScheduledPostRepository: {
      getById: mocks.postGetById,
      claimForPublishing: mocks.claimForPublishing,
      markPublished: mocks.markPublished,
      markFailed: mocks.markFailed,
    },
  }),
);

vi.mock("@/server/lib/gbpClient", () => ({
  createGbpClient: () => ({ createLocalPost: mocks.createLocalPost }),
  GbpApiError: class GbpApiError extends Error {},
  GbpTokenError: class GbpTokenError extends Error {},
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const POST_ID = "22222222-2222-2222-2222-222222222222";

/** A scheduled post row with sensible defaults -- only the fields
 *  publishPost's re-read branch (finding A7) actually reads are populated
 *  meaningfully; the rest just need to be present to satisfy the type. */
function post(overrides: Partial<GbpScheduledPost> = {}): GbpScheduledPost {
  return {
    id: POST_ID,
    projectId: PROJECT_ID,
    content: "New summer hours!",
    mediaUrl: null,
    callToActionType: null,
    callToActionUrl: null,
    scheduledAt: "2026-07-27T11:00:00.000Z",
    status: "scheduled",
    publishedPostId: null,
    errorMessage: null,
    createdByUserId: "u1",
    createdAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    ...overrides,
  };
}

describe("GbpWriteService.publishPost re-reads after a failed claim (finding A7)", () => {
  beforeEach(() => {
    mocks.isGbpWriteConfigured.mockResolvedValue(true);
    mocks.connectionGetByProjectId.mockResolvedValue({
      accountName: "accounts/123",
      locationName: "locations/456",
      connectedByUserId: "u1",
    });
    mocks.postGetById.mockReset();
    mocks.claimForPublishing.mockReset();
    mocks.markPublished.mockReset();
    mocks.markFailed.mockReset();
    mocks.createLocalPost.mockReset();
  });

  it("reports the post no longer exists when it was deleted before the claim (finding A7's exact failing input)", async () => {
    // The exact scenario from finding A7: the first read sees `scheduled`,
    // but the row is gone by the time claimForPublishing runs (e.g. the
    // project or post was deleted concurrently).
    mocks.postGetById
      .mockResolvedValueOnce(post({ status: "scheduled" })) // initial read
      .mockResolvedValueOnce(null); // re-read after the failed claim
    mocks.claimForPublishing.mockResolvedValue(null);
    const { GbpWriteService } = await import("./GbpWriteService");

    const result = await GbpWriteService.publishPost({
      postId: POST_ID,
      projectId: PROJECT_ID,
    });

    expect(result).toEqual({
      ok: false,
      reason: "blocked",
      message: "This post no longer exists -- it may have been deleted.",
    });
    // Never claims Google was involved, and never calls it either.
    expect(mocks.createLocalPost).not.toHaveBeenCalled();
  });

  it("reports the post was already published when it moved there before the claim", async () => {
    mocks.postGetById
      .mockResolvedValueOnce(post({ status: "scheduled" }))
      .mockResolvedValueOnce(post({ status: "published" }));
    mocks.claimForPublishing.mockResolvedValue(null);
    const { GbpWriteService } = await import("./GbpWriteService");

    const result = await GbpWriteService.publishPost({
      postId: POST_ID,
      projectId: PROJECT_ID,
    });

    expect(result).toEqual({
      ok: false,
      reason: "blocked",
      message: "This post has already been published.",
    });
  });

  it("reports the post already failed when it moved there before the claim", async () => {
    mocks.postGetById
      .mockResolvedValueOnce(post({ status: "scheduled" }))
      .mockResolvedValueOnce(post({ status: "failed" }));
    mocks.claimForPublishing.mockResolvedValue(null);
    const { GbpWriteService } = await import("./GbpWriteService");

    const result = await GbpWriteService.publishPost({
      postId: POST_ID,
      projectId: PROJECT_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/resched/i);
    }
  });

  it("does not claim publishing is in progress without evidence, when the re-read is inconclusive", async () => {
    // A pathological (but not impossible) race: the re-read still shows
    // `scheduled`, so describePublishBlockReason can't name a specific
    // blocker either. The message must not assert "already being
    // published" without something to back it up.
    mocks.postGetById
      .mockResolvedValueOnce(post({ status: "scheduled" }))
      .mockResolvedValueOnce(post({ status: "scheduled" }));
    mocks.claimForPublishing.mockResolvedValue(null);
    const { GbpWriteService } = await import("./GbpWriteService");

    const result = await GbpWriteService.publishPost({
      postId: POST_ID,
      projectId: PROJECT_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).not.toContain(
        "already being published",
      );
    }
  });

  it("still publishes normally when the claim succeeds", async () => {
    mocks.postGetById.mockResolvedValue(post({ status: "scheduled" }));
    mocks.claimForPublishing.mockResolvedValue(post({ status: "publishing" }));
    mocks.createLocalPost.mockResolvedValue({
      publishedPostName: "accounts/123/locations/456/localPosts/1",
    });
    const { GbpWriteService } = await import("./GbpWriteService");

    const result = await GbpWriteService.publishPost({
      postId: POST_ID,
      projectId: PROJECT_ID,
    });

    expect(result).toEqual({
      ok: true,
      publishedPostId: "accounts/123/locations/456/localPosts/1",
    });
    expect(mocks.markPublished).toHaveBeenCalledWith(
      POST_ID,
      "accounts/123/locations/456/localPosts/1",
    );
  });
});
