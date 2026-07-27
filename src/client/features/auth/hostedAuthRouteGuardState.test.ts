import { describe, expect, it } from "vitest";
import { getHostedAuthRouteGuardState } from "@/client/features/auth/hostedAuthRouteGuardState";

const unverifiedHostedUser = {
  isHostedMode: true,
  isSessionPending: false,
  hasUser: true,
  emailVerified: false,
};

describe("hosted auth route guard runtime config", () => {
  it("does not navigate or render protected content while config is unresolved", () => {
    expect(
      getHostedAuthRouteGuardState({
        ...unverifiedHostedUser,
        runtimeConfigResolved: false,
        emailVerificationBypassed: false,
      }),
    ).toEqual({
      canRenderAuthenticatedContent: false,
      redirect: null,
    });
  });

  it("allows protected content once runtime config resolves as bypassed", () => {
    expect(
      getHostedAuthRouteGuardState({
        ...unverifiedHostedUser,
        runtimeConfigResolved: true,
        emailVerificationBypassed: true,
      }),
    ).toEqual({
      canRenderAuthenticatedContent: true,
      redirect: null,
    });
  });

  it("navigates to verify email once config resolves as not bypassed", () => {
    expect(
      getHostedAuthRouteGuardState({
        ...unverifiedHostedUser,
        runtimeConfigResolved: true,
        emailVerificationBypassed: false,
      }),
    ).toEqual({
      canRenderAuthenticatedContent: false,
      redirect: "verify-email",
    });
  });
});
