import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    HOSTED_ALLOWED_EMAILS: undefined as string | undefined,
  },
  findActiveInviteByEmail: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("@/server/auth/repositories/InviteRepository", () => ({
  InviteRepository: {
    findActiveInviteByEmail: mocks.findActiveInviteByEmail,
  },
}));

import { isHostedEmailAllowed } from "./hosted-access";

describe("isHostedEmailAllowed", () => {
  beforeEach(() => {
    mocks.env.HOSTED_ALLOWED_EMAILS = undefined;
    mocks.findActiveInviteByEmail.mockReset();
  });

  it("allows a normalized env-listed email without querying invites", async () => {
    mocks.env.HOSTED_ALLOWED_EMAILS =
      " operator@example.com, TEAM@example.com ";

    await expect(isHostedEmailAllowed(" Team@Example.com ")).resolves.toBe(
      true,
    );
    expect(mocks.findActiveInviteByEmail).not.toHaveBeenCalled();
  });

  it("allows a pending invitation for a normalized email", async () => {
    mocks.findActiveInviteByEmail.mockResolvedValue({
      id: "invite-1",
      status: "pending",
    });

    await expect(isHostedEmailAllowed(" New@Example.com ")).resolves.toBe(true);
    expect(mocks.findActiveInviteByEmail).toHaveBeenCalledWith(
      "new@example.com",
    );
  });

  it("allows an accepted invitation while it remains active", async () => {
    mocks.findActiveInviteByEmail.mockResolvedValue({
      id: "invite-1",
      status: "accepted",
    });

    await expect(isHostedEmailAllowed("new@example.com")).resolves.toBe(true);
  });

  it("denies an email with neither an allow-list entry nor an invite", async () => {
    mocks.findActiveInviteByEmail.mockResolvedValue(null);

    await expect(isHostedEmailAllowed("other@example.com")).resolves.toBe(
      false,
    );
  });

  it("denies expired and canceled invitations", async () => {
    mocks.findActiveInviteByEmail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "invite-2",
        status: "canceled",
      });

    await expect(isHostedEmailAllowed("expired@example.com")).resolves.toBe(
      false,
    );
    await expect(isHostedEmailAllowed("canceled@example.com")).resolves.toBe(
      false,
    );
  });

  it("fails closed when the invitation lookup throws", async () => {
    mocks.findActiveInviteByEmail.mockRejectedValue(new Error("database down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(isHostedEmailAllowed("new@example.com")).resolves.toBe(false);
  });
});
