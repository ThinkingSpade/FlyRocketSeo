import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { List } from "@phosphor-icons/react";
import {
  MobileSidebarDrawer,
  SeoApiStatusBanners,
} from "@/client/layout/AppShellParts";
import { GscReEngagementModal } from "@/client/features/gsc/GscReEngagementModal";
import { RelatedTools } from "@/client/layout/RelatedTools";
import { Sidebar } from "@/client/components/Sidebar";
import { BILLING_ROUTE } from "@/shared/billing";
import { getSeoApiKeyStatus } from "@/serverFunctions/config";
import { getProjects } from "@/serverFunctions/projects";
import { getLastProjectId } from "@/client/lib/active-project";
import { Button } from "@cloudflare/kumo/components/button";

export function AuthenticatedAppLayout({
  children,
  projectId,
  banner,
}: {
  children: React.ReactNode;
  projectId?: string;
  banner?: React.ReactNode;
}) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const menuTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  // On non-project pages (e.g. /settings) there's no projectId in the URL, so
  // derive one for the nav/switcher: prefer the last-visited project, else the
  // most recent. The whole app tree is client-only (see root ClientOnly), so we
  // can read localStorage synchronously during the first render — this lets the
  // sidebar show the full project nav on the very first paint instead of briefly
  // flashing only the always-visible Connect group while projects load.
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    enabled: !projectId,
  });
  const [rememberedProjectId] = React.useState<string | null>(() =>
    getLastProjectId(),
  );
  const fallbackProjects = projectsQuery.data ?? [];
  const fallbackProjectId =
    fallbackProjects.find((project) => project.id === rememberedProjectId)
      ?.id ??
    fallbackProjects[0]?.id ??
    null;
  // Once the projects list loads, fallbackProjectId is the validated choice
  // (remembered-if-valid, else most recent). Before it loads, fall back to the
  // remembered id so the project nav renders immediately; a stale id here only
  // builds links that self-correct via the route guard once data arrives.
  const sidebarProjectId =
    projectId ?? fallbackProjectId ?? rememberedProjectId;
  const shouldCheckSeoApiKeyStatus = location.pathname !== BILLING_ROUTE;
  const seoApiKeyStatusQuery = useQuery({
    queryKey: ["seoApiKeyStatus"],
    queryFn: () => getSeoApiKeyStatus(),
    enabled: shouldCheckSeoApiKeyStatus,
  });
  const isSeoApiKeyConfigured = shouldCheckSeoApiKeyStatus
    ? (seoApiKeyStatusQuery.data?.configured ?? null)
    : null;
  const seoApiKeyStatusError =
    shouldCheckSeoApiKeyStatus && seoApiKeyStatusQuery.isError;

  const shouldShowSeoApiWarning =
    !seoApiKeyStatusError && isSeoApiKeyConfigured === false;

  // Route changes and responsive transitions must never leave an invisible
  // focus trap behind the desktop sidebar.
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);
  React.useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setDrawerOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <div className="app-shell flex h-[100dvh] bg-base-200">
      <a
        className="app-skip-link"
        href="#main-content"
        onClick={() => document.getElementById("main-content")?.focus()}
      >
        Skip to content
      </a>
      <div className="hidden shrink-0 md:block">
        <Sidebar projectId={sidebarProjectId} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar
          triggerRef={menuTriggerRef}
          drawerOpen={drawerOpen}
          onOpenDrawer={() => setDrawerOpen(true)}
        />

        {/* PostHog-style cutout: the main content sits on a raised panel with a
            thin strip of the sidebar background above it and a hairline border. */}
        <div className="flex min-h-0 flex-1 flex-col md:pt-2">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-base-100 md:rounded-tl-lg md:border-l md:border-t md:border-base-300">
            <SeoApiStatusBanners
              shouldShowSeoApiWarning={shouldShowSeoApiWarning}
              seoApiKeyStatusError={seoApiKeyStatusError}
            />

            {banner}
            <RelatedTools projectId={sidebarProjectId} />

            <main
              id="main-content"
              tabIndex={-1}
              className="app-main min-h-0 min-w-0 flex-1 overflow-auto"
            >
              {children}
            </main>
          </div>
        </div>
      </div>

      <MobileSidebarDrawer
        open={drawerOpen}
        finalFocus={menuTriggerRef}
        projectId={sidebarProjectId}
        onClose={() => setDrawerOpen(false)}
      />

      <GscReEngagementModal
        projectId={sidebarProjectId}
        suppressed={drawerOpen}
      />
    </div>
  );
}

function MobileTopBar({
  triggerRef,
  drawerOpen,
  onOpenDrawer,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  drawerOpen: boolean;
  onOpenDrawer: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-base-300 bg-base-100 px-2 py-1.5 md:hidden">
      <Button
        type="button"
        shape="square"
        variant="ghost"
        size="sm"
        ref={triggerRef}
        className="app-touch-target"
        aria-haspopup="dialog"
        aria-controls={drawerOpen ? "mobile-navigation" : undefined}
        aria-label="Toggle sidebar"
        aria-expanded={drawerOpen}
        onClick={onOpenDrawer}
      >
        <List className="h-5 w-5" />
      </Button>
      <Link
        to="/"
        className="ml-1 flex items-center gap-1.5 font-semibold text-base-content"
      >
        <img
          src="/logo-mark.png"
          alt=""
          width={20}
          height={20}
          className="h-5 w-5"
        />
        FlyRocketSEO
      </Link>
    </div>
  );
}
