import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
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
  const bypassEmailVerification = useEmailVerificationBypassed();
  const emailVerified =
    session?.user?.emailVerified === true || bypassEmailVerification;

  useEffect(() => {
    if (isPending || !isHostedMode) {
      return;
    }

    const redirectTo = getCurrentAuthRedirectFromHref(window.location.href);

    if (!session?.user?.id) {
      void navigate({
        to: "/sign-in",
        search: getSignInSearch(redirectTo),
        replace: true,
      });
      return;
    }

    if (!emailVerified) {
      void navigate({
        to: "/verify-email",
        search: getVerifyEmailSearch(session.user.email, redirectTo),
        replace: true,
      });
    }
  }, [
    isPending,
    isHostedMode,
    emailVerified,
    session?.user?.email,
    session?.user?.id,
    navigate,
  ]);

  const hasVerifiedHostedSession =
    !isPending && Boolean(session?.user?.id) && emailVerified;

  return {
    isHostedMode,
    canRenderAuthenticatedContent: !isHostedMode || hasVerifiedHostedSession,
  };
}
