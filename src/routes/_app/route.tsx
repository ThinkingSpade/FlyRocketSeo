import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { AuthenticatedAppLayout } from "@/client/layout/AppShell";
import { useOnboardingRedirect } from "@/client/features/onboarding/useOnboardingRedirect";
import { LoadingShell } from "@/client/components/LoadingShell";

export const Route = createFileRoute("/_app")({
  component: AppRouteLayout,
});

function AppRouteLayout() {
  const authGate = useHostedAuthRouteGuard();
  useOnboardingRedirect();

  // Keep the loading animation on screen while the session resolves (a cold
  // Worker isolate can take ~4.5s to answer get-session). Returning null here
  // was the blank page the shell animation was meant to prevent — the shell
  // only covers up to mount, this covers up to the session being known.
  if (!authGate.canRenderAuthenticatedContent) {
    return <LoadingShell />;
  }

  return (
    <AuthenticatedAppLayout>
      <Outlet />
    </AuthenticatedAppLayout>
  );
}
