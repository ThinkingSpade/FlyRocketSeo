import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    LOOPS_API_KEY: undefined as string | undefined,
    LOOPS_TRANSACTIONAL_INVITE_ID: undefined as string | undefined,
  },
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("@/server/email/loops-client", () => ({
  getContactNameParts: vi.fn(),
  updateLoopsContact: vi.fn(),
}));

import { hasHostedInviteEmailConfig, sendHostedInviteEmail } from "./loops";

describe("sendHostedInviteEmail", () => {
  beforeEach(() => {
    mocks.env.LOOPS_API_KEY = undefined;
    mocks.env.LOOPS_TRANSACTIONAL_INVITE_ID = undefined;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a no-op unless both invite email values are configured", async () => {
    mocks.env.LOOPS_API_KEY = "loops-key";

    expect(hasHostedInviteEmailConfig()).toBe(false);
    await expect(
      sendHostedInviteEmail({
        email: "team@example.com",
        inviteUrl: "https://app.example.com/sign-up?invite=1",
        invitedByName: "Operator",
      }),
    ).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the normalized invite payload when configured", async () => {
    mocks.env.LOOPS_API_KEY = "loops-key";
    mocks.env.LOOPS_TRANSACTIONAL_INVITE_ID = "invite-template";
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    expect(hasHostedInviteEmailConfig()).toBe(true);
    await sendHostedInviteEmail({
      email: " Team@Example.com ",
      inviteUrl: "https://app.example.com/sign-up?invite=1",
      invitedByName: "Operator",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://app.loops.so/api/v1/transactional",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          transactionalId: "invite-template",
          email: "team@example.com",
          addToAudience: false,
          dataVariables: {
            appName: "FlyRocketSEO",
            inviteUrl: "https://app.example.com/sign-up?invite=1",
            invitedByName: "Operator",
          },
        }),
      }),
    );
  });
});
