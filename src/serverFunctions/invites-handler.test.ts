import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getHostedBaseUrl: vi.fn() }));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { getHostedUser: vi.fn() },
}));
vi.mock("@/server/auth/repositories/InviteRepository", () => ({
  InviteRepository: { createInvite: vi.fn() },
}));
vi.mock("@/server/email/loops", () => ({
  hasHostedInviteEmailConfig: vi.fn(),
  sendHostedInviteEmail: vi.fn(),
}));

import { createHostedInviteForContext } from "./invites-handler";

const context = {
  userId: "user-1",
  userEmail: "operator@example.com",
  organizationId: "org-1",
};

function createDependencies(emailConfigured: boolean) {
  return {
    now: () => new Date("2026-07-20T12:00:00Z"),
    createInvite: vi
      .fn()
      .mockResolvedValue("123e4567-e89b-12d3-a456-426614174000"),
    getHostedBaseUrl: vi.fn(() => "https://app.example.com/"),
    getHostedUser: vi.fn().mockResolvedValue({
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
    }),
    hasHostedInviteEmailConfig: vi.fn(() => emailConfigured),
    sendHostedInviteEmail: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createHostedInviteForContext", () => {
  it("creates a seven-day invite and shapes a normalized copyable link", async () => {
    const dependencies = createDependencies(false);

    await expect(
      createHostedInviteForContext(
        " Teammate@Example.com ",
        context,
        dependencies,
      ),
    ).resolves.toEqual({
      inviteUrl:
        "https://app.example.com/sign-up?invite=123e4567-e89b-12d3-a456-426614174000&email=teammate%40example.com",
      emailSent: false,
    });
    expect(dependencies.createInvite).toHaveBeenCalledWith({
      email: "teammate@example.com",
      organizationId: "org-1",
      inviterId: "user-1",
      expiresAt: new Date("2026-07-27T12:00:00Z"),
    });
    expect(dependencies.sendHostedInviteEmail).not.toHaveBeenCalled();
  });

  it("reports email sent only after the configured sender succeeds", async () => {
    const dependencies = createDependencies(true);

    const result = await createHostedInviteForContext(
      "teammate@example.com",
      context,
      dependencies,
    );

    expect(result.emailSent).toBe(true);
    expect(dependencies.sendHostedInviteEmail).toHaveBeenCalledWith({
      email: "teammate@example.com",
      inviteUrl: result.inviteUrl,
      invitedByName: "Operator",
    });
  });

  it("keeps the invite link when configured email delivery fails", async () => {
    const dependencies = createDependencies(true);
    dependencies.sendHostedInviteEmail.mockRejectedValue(
      new Error("provider unavailable"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await createHostedInviteForContext(
      "teammate@example.com",
      context,
      dependencies,
    );

    expect(result.inviteUrl).toContain("/sign-up?invite=");
    expect(result.emailSent).toBe(false);
  });
});
