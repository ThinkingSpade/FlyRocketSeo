import { Link } from "@tanstack/react-router";
import { Lightning } from "@phosphor-icons/react";
import { DashboardCard, useProjectNavLinks } from "./dashboardShared";
import { buttonVariants } from "@cloudflare/kumo/components/button";

// The main tools, pulled straight from the project nav so labels/routes stay
// in sync with the sidebar.
const QUICK_ACTION_TARGETS = [
  "/p/$projectId/keywords",
  "/p/$projectId/domain",
  "/p/$projectId/backlinks",
  "/p/$projectId/competitors",
  "/p/$projectId/audit",
] as const;

export function QuickActionsCard({ projectId }: { projectId: string }) {
  const nav = useProjectNavLinks(projectId);
  const actions = QUICK_ACTION_TARGETS.map((target) => nav.get(target));

  return (
    <DashboardCard icon={Lightning} title="Research tools">
      <div className="flex flex-wrap gap-2">
        {actions.map(({ icon: Icon, label, linkProps }) => (
          <Link
            key={label}
            {...linkProps}
            className={`${buttonVariants({ variant: "ghost", size: "sm" })} app-touch-target h-auto min-h-0 items-center gap-2 border border-base-300 px-3 py-2 font-normal`}
          >
            <Icon className="size-4 text-base-content/70" />
            <span className="text-xs">{label}</span>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}
