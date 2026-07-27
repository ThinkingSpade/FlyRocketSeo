import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { getHostedAuthRouteGuardState } from "@/client/features/auth/hostedAuthRouteGuardState";
import { useEmailVerificationBypassed } from "@/client/features/auth/useEmailVerificationBypassed";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  getCurrentAuthRedirectFromHref,
  getSignInSearch,
  getVerifyEmailSearch,
} from "@/lib/auth-redirect";

export function useHostedAuthRouteGuard() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const isHostedMode = isHostedClientAuthMode();
  const runtimeConfig = useEmailVerificationBypassed();
  const guardState = getHostedAuthRouteGuardState({
    isHostedMode,
    isSessionPending: isPending,
    hasUser: Boolean(session?.user?.id),
    emailVerified: session?.user?.emailVerified === true,
    runtimeConfigResolved: runtimeConfig.isResolved,
    emailVerificationBypassed: runtimeConfig.isBypassed,
  });

  useEffect(() => {
    if (!guardState.redirect) {
      return;
    }

    const redirectTo = getCurrentAuthRedirectFromHref(window.location.href);

    if (guardState.redirect === "sign-in") {
      void navigate({
        to: "/sign-in",
        search: getSignInSearch(redirectTo),
        replace: true,
      });
      return;
    }

    void navigate({
      to: "/verify-email",
      search: getVerifyEmailSearch(session?.user?.email, redirectTo),
      replace: true,
    });
  }, [guardState.redirect, navigate, session?.user?.email]);

  return {
    isHostedMode,
    canRenderAuthenticatedContent: guardState.canRenderAuthenticatedContent,
  };
}
