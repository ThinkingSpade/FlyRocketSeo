import { useQuery } from "@tanstack/react-query";
import { Link, type LinkOptions } from "@tanstack/react-router";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { getProjects } from "@/serverFunctions/projects";
import { getRankTrackingConfigSummaries } from "@/serverFunctions/rank-tracking";
import { getGscConnection } from "@/serverFunctions/gsc";
import { getAuditHistory } from "@/serverFunctions/audit";
import { DashboardCard, useProjectNavLinks } from "./dashboardShared";

type ChecklistStep = {
  key: string;
  label: string;
  cta: string;
  linkProps: LinkOptions;
  done: boolean;
};

/**
 * First-run nudge: a checklist of setup steps that vanishes once the project
 * is established. Each source is queried independently so one failing query
 * degrades just that row (treated as not-yet-done) instead of crashing the
 * card — this is a gentle nudge, not critical UI, so it stays quiet on error.
 */
export function GettingStartedCard({ projectId }: { projectId: string }) {
  const nav = useProjectNavLinks(projectId);
  // Project settings isn't a sidebar nav item, so its link is built directly.
  const settingsLink = {
    to: "/p/$projectId/settings",
    params: { projectId },
  } satisfies LinkOptions;

  // Reuse the dashboard's own query keys so these dedupe against the cards
  // below instead of firing duplicate requests.
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 60_000,
  });
  const summariesQuery = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });
  const gscQuery = useQuery({
    queryKey: ["gscConnection", projectId],
    queryFn: () => getGscConnection({ data: { projectId } }),
  });
  const auditQuery = useQuery({
    queryKey: ["auditHistory", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });

  // Wait for every source to settle (data or error) before rendering, so the
  // checklist never flashes a half-empty "0 of N" state on first load.
  if (
    projectsQuery.isPending ||
    summariesQuery.isPending ||
    gscQuery.isPending ||
    auditQuery.isPending
  ) {
    return null;
  }

  const project = projectsQuery.data?.find(
    (candidate) => candidate.id === projectId,
  );

  const steps: ChecklistStep[] = [
    {
      key: "domain",
      label: "Set your site's domain",
      cta: "Add domain",
      linkProps: settingsLink,
      done: !projectsQuery.isError && Boolean(project?.domain),
    },
    {
      key: "keywords",
      label: "Track your first keywords",
      cta: "Track keywords",
      linkProps: nav.get("/p/$projectId/rank-tracking").linkProps,
      done: !summariesQuery.isError && (summariesQuery.data?.length ?? 0) > 0,
    },
  ];

  // Self-host installs without Google OAuth configured can't connect GSC at
  // all, so hide the step there rather than nag with a step they can't finish.
  // When the query errors we can't tell, so we keep the step (as not-done).
  const gscConfigured = gscQuery.isError
    ? true
    : gscQuery.data.googleOAuthConfigured;
  if (gscConfigured) {
    steps.push({
      key: "gsc",
      label: "Connect Google Search Console",
      cta: "Connect",
      linkProps: nav.get("/p/$projectId/search-performance").linkProps,
      done: !gscQuery.isError && Boolean(gscQuery.data?.connected),
    });
  }

  steps.push({
    key: "audit",
    label: "Run your first site audit",
    cta: "Run audit",
    linkProps: nav.get("/p/$projectId/audit").linkProps,
    done: !auditQuery.isError && (auditQuery.data?.length ?? 0) > 0,
  });

  // Established project: every applicable step is done, so the nudge vanishes
  // and never clutters the dashboard.
  if (steps.every((step) => step.done)) {
    return null;
  }

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <DashboardCard icon={Rocket} title="Getting started">
      <div className="flex items-center gap-3">
        <progress
          className="progress progress-primary h-2 flex-1"
          value={doneCount}
          max={steps.length}
        />
        <span className="shrink-0 text-xs font-medium text-base-content/60 tabular-nums">
          {doneCount} of {steps.length} done
        </span>
      </div>

      <ul className="space-y-0.5">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-2 py-1">
            {step.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            ) : (
              <Circle className="size-4 shrink-0 text-base-content/40" />
            )}
            <span
              className={
                step.done
                  ? "text-sm text-base-content/50 line-through"
                  : "text-sm text-base-content/80"
              }
            >
              {step.label}
            </span>
            {step.done ? null : (
              <Link
                {...step.linkProps}
                className="ml-auto shrink-0 text-xs font-medium text-primary hover:underline"
              >
                {step.cta} →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
