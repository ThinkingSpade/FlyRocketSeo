import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AuthPageShell } from "@/client/features/auth/AuthPage";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { LoadingShell } from "@/client/components/LoadingShell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedShellLayout,
});

function AuthenticatedShellLayout() {
  const authGate = useHostedAuthRouteGuard();

  // Self-host doesn't use these hosted-only routes, so render nothing there.
  if (!authGate.isHostedMode) {
    return null;
  }
  // Hosted: hold the loading animation while the session resolves instead of
  // flashing a blank page on a cold Worker isolate.
  if (!authGate.canRenderAuthenticatedContent) {
    return <LoadingShell />;
  }

  return (
    <AuthPageShell>
      <Outlet />
    </AuthPageShell>
  );
}
