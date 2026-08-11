import { beforeEach, describe, expect, it, vi } from "vitest";

// Defensive, matching this codebase's convention for testing a service whose
// import graph could otherwise reach a Worker-only `env` read. Every
// dependency below is mocked wholesale, so no real file body executes.
vi.mock("cloudflare:workers", () => ({ env: {} }));

const mocks = vi.hoisted(() => ({
  claimForDraft: vi.fn(),
  applyDraft: vi.fn(),
  draftFromSite: vi.fn(),
}));

vi.mock(
  "@/server/features/profiles/repositories/ProjectProfileRepository",
  () => ({
    ProjectProfileRepository: {
      claimForDraft: mocks.claimForDraft,
      applyDraft: mocks.applyDraft,
    },
  }),
);

vi.mock("./ProfileDraftService", () => ({
  ProfileDraftService: { draftFromSite: mocks.draftFromSite },
}));

import { ProfileAutoDraftService } from "./ProfileAutoDraftService";

const DRAFT = {
  offer: "Managed break room programs",
  customer: "Office managers",
  exclusions: "We don't sell equipment",
  brandTerms: "Delio",
  serviceAreaKind: "local" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claimForDraft.mockResolvedValue(true);
  mocks.draftFromSite.mockResolvedValue(DRAFT);
  mocks.applyDraft.mockResolvedValue(undefined);
});

/**
 * Auto-drafting has to be exactly-once per project, because the two ways of
 * getting it wrong are both expensive: repeating it burns a model call and a
 * five-page crawl on every page load, and racing it lets two callers crawl
 * the same site at once. The card is mounted on several tabs, so concurrent
 * callers are the ordinary case.
 *
 * The claim is what makes it once: the row is inserted BEFORE any work
 * starts, so whoever loses the insert has nothing left to do.
 */
describe("ProfileAutoDraftService.run", () => {
  it("drafts and stores when it wins the claim", async () => {
    const result = await ProfileAutoDraftService.run({
      projectId: "p1",
      domain: "deliotx.com",
    });

    expect(result).toEqual({ status: "drafted", profile: DRAFT });
    expect(mocks.draftFromSite).toHaveBeenCalledWith({
      domain: "deliotx.com",
      topQueries: [],
    });
    expect(mocks.applyDraft).toHaveBeenCalledWith("p1", DRAFT);
  });

  it("does no work at all when another caller already claimed it", async () => {
    mocks.claimForDraft.mockResolvedValue(false);

    const result = await ProfileAutoDraftService.run({
      projectId: "p1",
      domain: "deliotx.com",
    });

    expect(result).toEqual({ status: "skipped" });
    // The assertion that matters: no crawl and no model call. A second tab
    // mounting the card must cost one insert attempt, not one draft.
    expect(mocks.draftFromSite).not.toHaveBeenCalled();
    expect(mocks.applyDraft).not.toHaveBeenCalled();
  });

  it("never claims anything for a project with no site to read", async () => {
    const result = await ProfileAutoDraftService.run({
      projectId: "p1",
      domain: null,
    });

    expect(result).toEqual({ status: "skipped" });
    // Deliberately does not claim: a project that gets a domain later must
    // still be draftable, so there is nothing to remember here.
    expect(mocks.claimForDraft).not.toHaveBeenCalled();
  });

  it("leaves the claim in place when drafting fails, so it is not retried forever", async () => {
    mocks.draftFromSite.mockRejectedValue(new Error("PROFILE_SITE_UNREADABLE"));

    await expect(
      ProfileAutoDraftService.run({ projectId: "p1", domain: "deliotx.com" }),
    ).rejects.toThrow("PROFILE_SITE_UNREADABLE");

    // The claimed row stays: it is the record that we already tried. Nothing
    // here deletes it, which is what stops an unreadable site from being
    // re-crawled on every page load.
    expect(mocks.claimForDraft).toHaveBeenCalledOnce();
    expect(mocks.applyDraft).not.toHaveBeenCalled();
  });
});
