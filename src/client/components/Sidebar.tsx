import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import {
  CaretDown,
  Question,
  CreditCard,
  SquaresFour,
  SignOut,
  ChatCircle,
  MagnifyingGlass,
  Gear,
  Users,
  User,
  X,
} from "@phosphor-icons/react";
import { openCommandPalette } from "@/client/components/CommandPalette";
import {
  connectNavGroup,
  getProjectSidebarGroups,
} from "@/client/navigation/items";
import { ProjectSwitcher } from "@/client/features/projects/ProjectSwitcher";
import { WorkspaceSwitcher } from "@/client/features/workspaces/WorkspaceSwitcher";
import { SamSidebarPanel } from "@/client/features/sam/SamSidebarPanel";
import { DataforseoBalanceIndicator } from "@/client/components/DataforseoBalanceIndicator";
import { ThemePreferenceMenuItems } from "@/client/components/ThemePreferenceMenuItems";
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { useBillingMode } from "@/client/features/billing/useBillingMode";
import { BILLING_ROUTE } from "@/shared/billing";
import { Button } from "@cloudflare/kumo/components/button";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import {
  readCollapsedGroups,
  writeCollapsedGroups,
} from "@/client/navigation/navigationPreferences";
import { Kbd } from "@/client/components/Kbd";
import {
  navItemClass,
  SidebarNavLink,
} from "@/client/components/SidebarNavLink";

interface SidebarProps {
  projectId: string | null;
  onNavigate?: () => void;
  onClose?: () => void;
  onOpenCommand?: () => void;
}

export function Sidebar({
  projectId,
  onNavigate,
  onClose,
  onOpenCommand,
}: SidebarProps) {
  const navGroups = [
    ...(projectId ? getProjectSidebarGroups(projectId) : []),
    { ...connectNavGroup, relatedItems: [] },
  ];
  const navigate = useNavigate();
  const location = useLocation();
  const onSamRoute = location.pathname.includes("/sam");

  const navId = useId();
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      return readCollapsedGroups(
        window.localStorage,
        navGroups.map((group) => group.label),
      );
    } catch {
      return [];
    }
  });
  const activeGroup = navGroups.find((group) =>
    [...group.items, ...group.relatedItems].some((item) => {
      const path = item.to.replace("$projectId", projectId ?? "");
      return (
        location.pathname === path ||
        (item.to !== "/p/$projectId" &&
          location.pathname.startsWith(`${path}/`))
      );
    }),
  )?.label;
  useEffect(() => {
    if (activeGroup)
      setCollapsed((previous) =>
        previous.filter((label) => label !== activeGroup),
      );
  }, [activeGroup, location.pathname]);
  useEffect(() => {
    const sync = (event: Event) => {
      if (event instanceof CustomEvent && Array.isArray(event.detail))
        setCollapsed(event.detail);
    };
    window.addEventListener("flyrocketseo:navigation-layout", sync);
    return () =>
      window.removeEventListener("flyrocketseo:navigation-layout", sync);
  }, []);
  const toggleGroup = (label: string) => {
    const next = collapsed.includes(label)
      ? collapsed.filter((value) => value !== label)
      : [...collapsed, label];
    setCollapsed(next);
    try {
      writeCollapsedGroups(window.localStorage, next);
    } catch {
      /* Storage can itself be denied. */
    }
    window.dispatchEvent(
      new CustomEvent("flyrocketseo:navigation-layout", { detail: next }),
    );
  };

  // PostHog-style sidebar tabs: Browse shows the regular nav, Chat shows the
  // SAM chat history. The tab is view state (switching to Browse leaves the
  // conversation open in the content panel), but the route wins: landing on
  // /sam selects Chat, navigating anywhere else flips back to Browse.
  const [view, setView] = useState<"browse" | "chat">(
    onSamRoute ? "chat" : "browse",
  );
  useEffect(() => {
    setView(onSamRoute ? "chat" : "browse");
  }, [onSamRoute]);

  const openChat = () => {
    setView("chat");
    if (!projectId) return;
    if (!onSamRoute) {
      void navigate({
        to: "/p/$projectId/sam",
        params: { projectId },
        search: {},
      });
      onNavigate?.();
    }
  };

  return (
    <aside
      aria-label="Workspace sidebar"
      className="flex h-full w-60 flex-col bg-base-200"
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2 text-base font-semibold text-base-content"
        >
          <img
            src="/logo-mark.png"
            alt=""
            width={24}
            height={24}
            className="h-6 w-6"
          />
          FlyRocketSEO
        </Link>
        {onClose ? (
          <Button
            type="button"
            onClick={onClose}
            variant="ghost"
            size="sm"
            shape="circle"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
        ) : null}
      </div>

      {/* Workspace above project, because that is the containment order — the
          project switcher below only ever lists the current workspace's
          projects. The workspace control renders nothing for the usual account
          with a single workspace, which is why it shares this block rather than
          owning one: an empty wrapper would leave its padding behind. */}
      <div className="px-3 pb-1">
        <WorkspaceSwitcher onCloseDrawer={onNavigate} />
        <ProjectSwitcher
          activeProjectId={projectId}
          onCloseDrawer={onNavigate}
        />
      </div>

      {projectId ? (
        // Same segmented idiom as the in-page tab strips (e.g. Domain
        // Overview's Top Keywords / Top Pages) — see SegmentedToggle for why
        // segmented is what the reference dashboard actually uses.
        <div className="px-3 pb-1">
          <Tabs
            variant="segmented"
            value={view}
            onValueChange={(next) => {
              // Chat has a side effect beyond selection (it navigates to /sam),
              // so the two branches cannot collapse into a single setter.
              if (next === "chat") openChat();
              else if (next === "browse") setView("browse");
            }}
            tabs={[
              {
                value: "browse",
                label: (
                  <span className="flex items-center gap-1.5">
                    <SquaresFour className="size-4" />
                    Browse
                  </span>
                ),
              },
              {
                value: "chat",
                label: (
                  <span className="flex items-center gap-1.5">
                    <ChatCircle className="size-4" />
                    Chat
                  </span>
                ),
              },
            ]}
          />
        </div>
      ) : null}

      {view === "chat" && projectId ? (
        <SamSidebarPanel projectId={projectId} onNavigate={onNavigate} />
      ) : (
        <nav
          aria-label="Project navigation"
          className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
        >
          {navGroups.map((group, groupIndex) => (
            <div key={group.label} className="mb-1">
              <button
                type="button"
                aria-expanded={!collapsed.includes(group.label)}
                aria-controls={`${navId}-group-${groupIndex}`}
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-kumo-subtle transition-colors hover:bg-base-300/40 hover:text-base-content"
              >
                {group.label}
                <CaretDown
                  aria-hidden="true"
                  className={`size-3 transition-transform duration-150 motion-reduce:transition-none ${collapsed.includes(group.label) ? "-rotate-90" : ""}`}
                />
              </button>
              <div
                id={`${navId}-group-${groupIndex}`}
                hidden={collapsed.includes(group.label)}
              >
                {group.items.map((item) => {
                  const { icon, label, ...linkProps } = item;
                  return (
                    <SidebarNavLink
                      key={linkProps.to}
                      icon={icon}
                      label={label}
                      onNavigate={onNavigate}
                      linkProps={linkProps}
                    />
                  );
                })}
                {group.relatedItems.length > 0 ? (
                  <details
                    key={`${group.label}-${location.pathname}`}
                    open={
                      group.relatedItems.some(
                        (item) =>
                          location.pathname ===
                          item.to.replace("$projectId", projectId ?? ""),
                      ) || undefined
                    }
                    className="mt-1"
                  >
                    <summary className="cursor-pointer rounded-md px-3 py-1.5 text-xs text-base-content/65 hover:bg-base-300/50">
                      More {group.label.toLowerCase()} tools
                    </summary>
                    {group.relatedItems.map((item) => {
                      const { icon, label, ...linkProps } = item;
                      return (
                        <SidebarNavLink
                          key={linkProps.to}
                          icon={icon}
                          label={label}
                          onNavigate={onNavigate}
                          linkProps={linkProps}
                        />
                      );
                    })}
                  </details>
                ) : null}
              </div>
            </div>
          ))}
        </nav>
      )}

      <SidebarFooter onNavigate={onNavigate} onOpenCommand={onOpenCommand} />
    </aside>
  );
}

function SidebarFooter({
  onNavigate,
  onOpenCommand,
}: {
  onNavigate?: () => void;
  onOpenCommand?: () => void;
}) {
  const { data: session } = useSession();
  const isHostedMode = isHostedClientAuthMode();
  const billingMode = useBillingMode();
  const email = session?.user?.email;

  return (
    <div className="shrink-0 border-t border-base-300 px-2 py-2 pb-safe">
      <button
        type="button"
        onClick={onOpenCommand ?? openCommandPalette}
        className={`${navItemClass} w-full`}
        aria-label="Open command menu"
      >
        <MagnifyingGlass className="h-4 w-4 shrink-0" />
        <span className="truncate">Search</span>
        <Kbd size="xs" className="ml-auto">
          {typeof navigator !== "undefined" &&
          /Mac|iPhone|iPad/.test(navigator.platform)
            ? "⌘K"
            : "Ctrl K"}
        </Kbd>
      </button>

      {!isHostedMode ? <DataforseoBalanceIndicator /> : null}
      {isHostedMode ? (
        <SidebarNavLink
          icon={Users}
          label="Team"
          onNavigate={onNavigate}
          linkProps={{ to: "/team" }}
        />
      ) : null}
      <SidebarNavLink
        icon={Question}
        label="Help & Community"
        onNavigate={onNavigate}
        linkProps={{ to: "/support" }}
      />

      {email ? (
        <DropdownMenu>
          <DropdownMenu.Trigger
            // `render` rather than children: Trigger is itself a button, so
            // nesting one inside it would be invalid markup.
            render={
              <button
                type="button"
                className={`${navItemClass} w-full`}
                aria-label="Open account menu"
              >
                <User className="h-4 w-4 shrink-0" />
                <span className="truncate" data-ph-mask>
                  {email}
                </span>
              </button>
            }
          />
          {/* side="top" is what `dropdown-top` used to do — this sits at the
              bottom of the sidebar, so the menu has to open upward. */}
          <DropdownMenu.Content side="top" align="start" sideOffset={4}>
            <DropdownMenu.LinkItem
              icon={Gear}
              render={<Link to="/settings" onClick={onNavigate} />}
            >
              Settings
            </DropdownMenu.LinkItem>
            {isHostedMode && billingMode !== "disabled" ? (
              <DropdownMenu.LinkItem
                icon={CreditCard}
                render={<Link to={BILLING_ROUTE} onClick={onNavigate} />}
              >
                Billing
              </DropdownMenu.LinkItem>
            ) : null}
            <ThemePreferenceMenuItems />
            {isHostedMode ? (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  variant="danger"
                  icon={SignOut}
                  onClick={() => signOutAndRedirect()}
                >
                  Sign out
                </DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu>
      ) : (
        <SidebarNavLink
          icon={Gear}
          label="Settings"
          onNavigate={onNavigate}
          linkProps={{ to: "/settings" }}
        />
      )}
    </div>
  );
}
