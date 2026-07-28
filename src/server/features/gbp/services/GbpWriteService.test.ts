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
  // None of these tests exercise a transport-level failure -- always false,
  // same as the real heuristic would say for a plain string/Error/
  // GbpApiError/GbpTokenError that isn't a fetch-shaped TypeError.
  isNetworkTransportError: () => false,
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

/**
 * Final wave item 1's last (and most serious) residual: a non-Error
 * exception ANYWHERE in the publish/update catch path -- including AFTER
 * Google already accepted the request -- used to report "Google Business
 * Profile rejected this request." That is always a confident wrong
 * diagnosis for a non-Error throw (rejection is a specific, established
 * outcome this code hasn't observed), and it is actively FALSE once
 * createLocalPost has already returned successfully: the write went
 * through, so nothing was rejected. These tests pin: (1) createLocalPost
 * itself failing is still honestly classified (nothing was accepted, so
 * describing it as a failed Google call is accurate), and (2) a LATER
 * failure -- after createLocalPost succeeded -- is never described as a
 * rejection, and never recorded as `failed` (which would invite a retry
 * that calls createLocalPost a second time, risking a duplicate post).
 */
describe("GbpWriteService.publishPost after a successful Google write (final wave item 1)", () => {
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
    mocks.postGetById.mockResolvedValue(post({ status: "scheduled" }));
    mocks.claimForPublishing.mockResolvedValue(post({ status: "publishing" }));
  });

  it("does not claim rejection for a non-Error exception when Google's own call is what failed", async () => {
    // A plain string rejection -- the exact non-Error shape the brief calls
    // out ("a non-Error exception anywhere in the publish/update catch
    // path").
    mocks.createLocalPost.mockRejectedValue("weird non-error throw");
    const { GbpWriteService } = await import("./GbpWriteService");

    const result = await GbpWriteService.publishPost({
      postId: POST_ID,
      projectId: PROJECT_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).not.toContain("rejected");
    }
    // Nothing was accepted -- this genuinely never reached a published
    // state, so recording it as failed (unlike the post-success case below)
    // is honest.
    expect(mocks.markFailed).toHaveBeenCalled();
    expect(mocks.markPublished).not.toHaveBeenCalled();
  });

  it("does not claim Google rejected the request when createLocalPost succeeded but recording it afterward failed", async () => {
    mocks.createLocalPost.mockResolvedValue({
      publishedPostName: "accounts/123/locations/456/localPosts/1",
    });
    // Same non-Error shape, this time failing the step AFTER Google's call
    // already succeeded.
    mocks.markPublished.mockRejectedValue("boom");
    const { GbpWriteService } = await import("./GbpWriteService");

    const result = await GbpWriteService.publishPost({
      postId: POST_ID,
      projectId: PROJECT_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).not.toContain("rejected");
    }
  });

  it("does not mark the post failed after Google already accepted it (that would invite a duplicate-post retry)", async () => {
    mocks.createLocalPost.mockResolvedValue({
      publishedPostName: "accounts/123/locations/456/localPosts/1",
    });
    mocks.markPublished.mockRejectedValue(new Error("db blip"));
    const { GbpWriteService } = await import("./GbpWriteService");

    await GbpWriteService.publishPost({
      postId: POST_ID,
      projectId: PROJECT_ID,
    });

    expect(mocks.markFailed).not.toHaveBeenCalled();
  });
});

/**
 * Final wave item 3 (an A6 residual): GbpWriteService kept its OWN local
 * copy of the "not configured" message, a byte-for-byte duplicate of the
 * text error-messages.ts's GBP_NOT_CONFIGURED used to carry -- both said
 * "ask your operator to finish the Cloud Console setup and Google's
 * verification review", asserting those two specific steps are what's
 * outstanding. isGbpWriteConfigured() can only confirm env vars are present
 * (oauth-config.ts) -- it has no way to check Google's scope/verification
 * status at all, so neither copy could honestly claim that. Fixed by
 * sourcing both from one shared, honest constant (shared/gbp.ts) instead of
 * two copies that can drift.
 */
describe("GbpWriteService not-configured message honesty (final wave item 3)", () => {
  it("does not assert the Cloud Console setup or verification review specifically need finishing", async () => {
    mocks.isGbpWriteConfigured.mockResolvedValue(false);
    const { GbpWriteService } = await import("./GbpWriteService");

    const result = await GbpWriteService.searchCategories({
      projectId: PROJECT_ID,
      query: "Pizza",
      regionCode: "US",
      languageCode: "en",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_configured");
      expect(result.message.toLowerCase()).not.toContain(
        "finish the cloud console setup",
      );
    }
  });
});

describe("GbpWriteService.messageForGbpFailure honesty (final wave item 1)", () => {
  beforeEach(() => {
    mocks.isGbpWriteConfigured.mockResolvedValue(true);
    mocks.connectionGetByProjectId.mockResolvedValue({
      accountName: "accounts/123",
      locationName: "locations/456",
      connectedByUserId: "u1",
    });
    mocks.postGetById.mockReset();
    mocks.claimForPublishing.mockReset();
    mocks.markFailed.mockReset();
    mocks.createLocalPost.mockReset();
    mocks.postGetById.mockResolvedValue(post({ status: "scheduled" }));
    mocks.claimForPublishing.mockResolvedValue(post({ status: "publishing" }));
  });

  it("does not assert the connection specifically expired or was revoked for a token error", async () => {
    const { GbpTokenError } = await import("@/server/lib/gbpClient");
    mocks.createLocalPost.mockRejectedValue(
      new GbpTokenError("could not mint a token"),
    );
    const { GbpWriteService } = await import("./GbpWriteService");

    const result = await GbpWriteService.publishPost({
      postId: POST_ID,
      projectId: PROJECT_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).not.toContain("has expired");
      expect(result.message.toLowerCase()).not.toContain("was revoked");
    }
  });
});
