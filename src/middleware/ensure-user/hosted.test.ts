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
