import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    LOOPS_API_KEY: undefined as string | undefined,
    LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID: undefined as string | undefined,
    LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID: undefined as string | undefined,
    LOOPS_TRANSACTIONAL_INVITE_ID: undefined as string | undefined,
  },
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("@/server/email/loops-client", () => ({
  getContactNameParts: vi.fn(),
  updateLoopsContact: vi.fn(),
}));

import {
  hasHostedInviteEmailConfig,
  sendHostedInviteEmail,
  sendHostedPasswordResetEmail,
  sendHostedVerificationEmail,
} from "./loops";

describe("hosted Loops email", () => {
  beforeEach(() => {
    mocks.env.LOOPS_API_KEY = undefined;
    mocks.env.LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID = undefined;
    mocks.env.LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID = undefined;
    mocks.env.LOOPS_TRANSACTIONAL_INVITE_ID = undefined;
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends verification email without a password reset template ID", async () => {
    mocks.env.LOOPS_API_KEY = "loops-key";
    mocks.env.LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID = "verify-template";
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      sendHostedVerificationEmail({
        email: "user@example.com",
        confirmationUrl: "https://app.example.com/verify?token=secret",
      }),
    ).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(
      "https://app.loops.so/api/v1/transactional",
      expect.objectContaining({
        body: JSON.stringify({
          transactionalId: "verify-template",
          email: "user@example.com",
          addToAudience: false,
          dataVariables: {
            appName: "FlyRocketSEO",
            confirmationUrl: "https://app.example.com/verify?token=secret",
          },
        }),
      }),
    );
    expect(console.info).toHaveBeenCalledWith("LOOPS_SEND_OK", {
      transactionalId: "verify-template",
      email: "user@example.com",
    });
  });

  it("sends password reset email without a verification template ID", async () => {
    mocks.env.LOOPS_API_KEY = "loops-key";
    mocks.env.LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID = "reset-template";
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      sendHostedPasswordResetEmail({
        email: "user@example.com",
        resetUrl: "https://app.example.com/reset?token=secret",
      }),
    ).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(
      "https://app.loops.so/api/v1/transactional",
      expect.objectContaining({
        body: JSON.stringify({
          transactionalId: "reset-template",
          email: "user@example.com",
          addToAudience: false,
          dataVariables: {
            appName: "FlyRocketSEO",
            resetUrl: "https://app.example.com/reset?token=secret",
          },
        }),
      }),
    );
  });

  it("logs a missing required variable with a stable marker", async () => {
    mocks.env.LOOPS_API_KEY = "loops-key";

    await expect(
      sendHostedVerificationEmail({
        email: "user@example.com",
        confirmationUrl: "https://app.example.com/verify?token=secret",
      }),
    ).rejects.toThrow(
      "LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID is required in hosted mode",
    );
    expect(console.error).toHaveBeenCalledWith("LOOPS_CONFIG_MISSING", {
      variableName: "LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID",
    });
  });

  it("includes a sanitized provider payload in the logged and thrown error", async () => {
    mocks.env.LOOPS_API_KEY = "loops-key";
    mocks.env.LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID = "verify-template";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Template rejected",
          confirmationUrl: "https://app.example.com/verify?token=secret",
        }),
        { status: 422 },
      ),
    );

    await expect(
      sendHostedVerificationEmail({
        email: "user@example.com",
        confirmationUrl: "https://app.example.com/verify?token=secret",
      }),
    ).rejects.toThrow(
      'Provider response: {"message":"Template rejected","confirmationUrl":"[redacted confirmationUrl; present=true]"}',
    );
    expect(console.error).toHaveBeenCalledWith(
      "LOOPS_SEND_FAILED",
      expect.objectContaining({
        status: 422,
        email: "user@example.com",
        transactionalId: "verify-template",
      }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "token=secret",
    );
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
