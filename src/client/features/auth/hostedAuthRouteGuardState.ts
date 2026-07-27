type HostedAuthRouteGuardStateInput = {
  isHostedMode: boolean;
  isSessionPending: boolean;
  hasUser: boolean;
  emailVerified: boolean;
  runtimeConfigResolved: boolean;
  emailVerificationBypassed: boolean;
};

export function getHostedAuthRouteGuardState({
  isHostedMode,
  isSessionPending,
  hasUser,
  emailVerified,
  runtimeConfigResolved,
  emailVerificationBypassed,
}: HostedAuthRouteGuardStateInput) {
  if (!isHostedMode) {
    return {
      canRenderAuthenticatedContent: true,
      redirect: null,
    } as const;
  }

  if (isSessionPending) {
    return {
      canRenderAuthenticatedContent: false,
      redirect: null,
    } as const;
  }

  if (!hasUser) {
    return {
      canRenderAuthenticatedContent: false,
      redirect: "sign-in",
    } as const;
  }

  if (emailVerified) {
    return {
      canRenderAuthenticatedContent: true,
      redirect: null,
    } as const;
  }

  if (!runtimeConfigResolved) {
    return {
      canRenderAuthenticatedContent: false,
      redirect: null,
    } as const;
  }

  if (emailVerificationBypassed) {
    return {
      canRenderAuthenticatedContent: true,
      redirect: null,
    } as const;
  }

  return {
    canRenderAuthenticatedContent: false,
    redirect: "verify-email",
  } as const;
}
