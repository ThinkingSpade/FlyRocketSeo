import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { DashboardCard, useProjectNavLinks } from "./dashboardShared";

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
    <DashboardCard icon={Zap} title="Quick actions">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {actions.map(({ icon: Icon, label, linkProps }) => (
          <Link
            key={label}
            {...linkProps}
            className="btn btn-ghost btn-sm h-auto min-h-0 flex-col items-center gap-1.5 border border-base-300 py-3 font-normal"
          >
            <Icon className="size-4 text-base-content/70" />
            <span className="text-xs">{label}</span>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}
