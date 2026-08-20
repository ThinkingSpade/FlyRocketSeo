import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  setActiveOrganization: vi.fn(),
  hasHostedAuthConfig: vi.fn(),
  getActiveOrganizationId: vi.fn(),
  getHostedAllowedEmails: vi.fn(),
  isHostedEmailAllowed: vi.fn(),
  getOrJoinSharedHostedOrganization: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: mocks.getSession,
      setActiveOrganization: mocks.setActiveOrganization,
      createOrganization: vi.fn(),
    },
  }),
  hasHostedAuthConfig: mocks.hasHostedAuthConfig,
}));
vi.mock("@/lib/auth-session", () => ({
  getActiveOrganizationId: mocks.getActiveOrganizationId,
}));
vi.mock("@/server/auth/default-hosted-organization", () => ({
  getOrJoinSharedHostedOrganization: mocks.getOrJoinSharedHostedOrganization,
}));
vi.mock("@/server/auth/hosted-access", () => ({
  getHostedAllowedEmails: mocks.getHostedAllowedEmails,
  isHostedEmailAllowed: mocks.isHostedEmailAllowed,
}));

import { resolveHostedContext } from "./hosted";

describe("resolveHostedContext hosted private access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasHostedAuthConfig.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "invitee@example.com",
        emailVerified: true,
      },
    });
    mocks.getActiveOrganizationId.mockReturnValue("org-1");
    mocks.getHostedAllowedEmails.mockReturnValue(["operator@example.com"]);
  });

  it("allows an invited user on later authenticated requests", async () => {
    mocks.isHostedEmailAllowed.mockResolvedValue(true);

    await expect(resolveHostedContext(new Headers())).resolves.toEqual({
      userId: "user-1",
      userEmail: "invitee@example.com",
      emailVerified: true,
      organizationId: "org-1",
    });
  });

  it("denies a non-listed, non-invited user when the env list is configured", async () => {
    mocks.isHostedEmailAllowed.mockResolvedValue(false);

    await expect(resolveHostedContext(new Headers())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("preserves operator recovery when the env list is unset", async () => {
    mocks.getHostedAllowedEmails.mockReturnValue([]);

    await expect(resolveHostedContext(new Headers())).resolves.toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
    });
    expect(mocks.isHostedEmailAllowed).not.toHaveBeenCalled();
  });
});

describe("resolveHostedContext delegated-organization recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasHostedAuthConfig.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com", emailVerified: true },
    });
    mocks.getHostedAllowedEmails.mockReturnValue([]);
    mocks.getOrJoinSharedHostedOrganization.mockResolvedValue("team-org");
  });

  it("re-resolves a session pointing at a delegated organization", async () => {
    // The failure this encodes: an owner signed in and the app opened on an
    // empty workspace, because the session carried a delegated organization
    // while every project sat in the team one. There is no workspace switcher
    // in the UI, so a session that keeps this value is a dead end.
    mocks.getActiveOrganizationId.mockReturnValue("delegated-user-1");

    await expect(resolveHostedContext(new Headers())).resolves.toMatchObject({
      userId: "user-1",
      organizationId: "team-org",
    });
  });

  it("rewrites the session so the next request is already correct", async () => {
    mocks.getActiveOrganizationId.mockReturnValue("delegated-user-1");

    await resolveHostedContext(new Headers());

    expect(mocks.setActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: "team-org" } }),
    );
  });

  it("leaves a real active organization alone", async () => {
    // The recovery must not fire for ordinary sessions: re-resolving every
    // request would drag a member of a second workspace back to the shared one.
    mocks.getActiveOrganizationId.mockReturnValue("some-other-org");

    await expect(resolveHostedContext(new Headers())).resolves.toMatchObject({
      organizationId: "some-other-org",
    });
    expect(mocks.getOrJoinSharedHostedOrganization).not.toHaveBeenCalled();
    expect(mocks.setActiveOrganization).not.toHaveBeenCalled();
  });

  it("does not treat a workspace merely named like one as delegated", async () => {
    // The check is an id prefix, and ids are opaque. A workspace whose NAME
    // begins with the word must not be swept up by it.
    mocks.getActiveOrganizationId.mockReturnValue("org-delegated-team");

    await expect(resolveHostedContext(new Headers())).resolves.toMatchObject({
      organizationId: "org-delegated-team",
    });
  });
});
