import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { setLastProjectId } from "@/client/lib/active-project";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { LoadingShell } from "@/client/components/LoadingShell";
import { FreePlanBanner } from "@/client/features/billing/FreePlanBanner";
import { useOnboardingRedirect } from "@/client/features/onboarding/useOnboardingRedirect";
import { getErrorCode } from "@/client/lib/error-messages";
import { AuthenticatedAppLayout } from "@/client/layout/AppShell";
import {
  getCurrentAuthRedirectFromHref,
  getSignInSearch,
} from "@/lib/auth-redirect";
import { getProjectAccess } from "@/serverFunctions/projects";

export const Route = createFileRoute("/_project/p/$projectId")({
  // Everything under this subtree fetches its data client-side with
  // react-query, so SSR would only render empty chrome.
  ssr: false,
  component: ProjectLayout,
});

// Redirect-only guard, deliberately NOT a blocking beforeLoad: the shell
// renders immediately while the access check runs in the background, and the
// browser only gets bounced if it lands on a project it can't see (stale
// last-project id, foreign URL). Real authorization is enforced on every data
// call; nothing sensitive renders from this check.
function useProjectAccessRedirect(projectId: string) {
  const navigate = useNavigate();
  const access = useQuery({
    queryKey: ["projectAccess", projectId],
    queryFn: () => getProjectAccess({ data: { projectId } }),
    // A failed check redirects away — retrying would just delay it.
    retry: false,
    // One check per project per tab; a revoked project still dead-ends at
    // every data call, so there's nothing to re-validate here.
    staleTime: Infinity,
  });
  const error = access.error;
  useEffect(() => {
    if (!error) return;
    if (getErrorCode(error) === "UNAUTHENTICATED") {
      void navigate({
        to: "/sign-in",
        search: getSignInSearch(
          getCurrentAuthRedirectFromHref(window.location.href),
        ),
        replace: true,
      });
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [error, navigate]);
}

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const authGate = useHostedAuthRouteGuard();
  useOnboardingRedirect();
  useProjectAccessRedirect(projectId);

  // Remember this as the last-visited project for the landing redirect.
  // Settings is excluded: editing another project's settings is
  // administration, not a context switch, so it shouldn't change which
  // project the app opens next time.
  const isSettingsPage = useLocation({
    select: (l) => l.pathname.endsWith("/settings"),
  });
  useEffect(() => {
    if (isSettingsPage) return;
    setLastProjectId(projectId);
  }, [projectId, isSettingsPage]);

  // Hold the loading animation while the session resolves rather than blanking
  // the page on a cold Worker isolate.
  if (!authGate.canRenderAuthenticatedContent) {
    return <LoadingShell />;
  }

  return (
    <AuthenticatedAppLayout
      projectId={projectId}
      banner={authGate.isHostedMode ? <FreePlanBanner /> : undefined}
    >
      {/* Keyed by project, so switching projects remounts the page subtree.
       *
       * This router does NOT remount a route component when only a path param
       * changes: `@tanstack/react-router` keys the match only when `remountDeps`
       * or `defaultRemountDeps` is configured, and neither is set here or in
       * `router.tsx`. So `/p/A/keywords` -> `/p/B/keywords` keeps every
       * `useState` in the Keywords tree alive across the switch.
       *
       * The worst consequence is a MONEY bug, not just stale UI. Keyword
       * Research holds `authorizedResearchInput` / `authorizedGeo` /
       * `researchRunNonce` to remember that the user authorized a paid run.
       * Those survive the switch, the controller rebuilds the request with the
       * NEW projectId, and because an authorization is still present it fires a
       * fresh metered request for project B using project A's keyword, location
       * and target area — with no click. An open Save-Keywords dialog is the
       * same shape: A's selected keywords, saved under B.
       *
       * Fixed at the boundary rather than per component. A reset effect in each
       * component only covers the instances someone remembered, and silently
       * fails for the next one added; an audit of this found 18 of them. A
       * project switch IS a context change, so discarding view state is the
       * intended behaviour here, not collateral damage.
       *
       * The global shell stays mounted — this keys the Outlet, not the layout —
       * so the sidebar and banner do not flash.
       *
       * It does NOT fix state held OUTSIDE React: three `localStorage` filter
       * stores are global despite holding project-specific terms, and those need
       * their keys namespaced separately.
       */}
      <Outlet key={projectId} />
    </AuthenticatedAppLayout>
  );
}
