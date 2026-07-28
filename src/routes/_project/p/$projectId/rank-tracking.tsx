import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useProjectMarket } from "@/client/hooks/useProjectDomain";
import { ScopeControl } from "@/client/features/geo/ScopeControl";
import { TargetAreaBanner } from "@/client/features/geo/TargetAreaBanner";
import { useTargetAreaScope } from "@/client/features/geo/useTargetAreaScope";

export const Route = createFileRoute("/_project/p/$projectId/rank-tracking")({
  component: RankTrackingLayout,
});

function RankTrackingLayout() {
  const { projectId } = Route.useParams();
  // Tracked SERP position is one of the six figures the activation plan can
  // scope to a metro. This layout wraps both the domain list and a single
  // domain's detail view (via Outlet), so putting ScopeControl here --
  // rather than in either child -- is what keeps it to ONE control for the
  // whole tab. A per-domain config's OWN location (set in
  // RankTrackingConfigModal, shown in RankTrackingDomainDetail) is a
  // separate, already-existing concept and stays untouched: this control
  // only shows/changes the project's confirmed target area, never rewrites
  // an existing tracked config's stored locationCode.
  const market = useProjectMarket(projectId);
  const targetAreaScope = useTargetAreaScope(projectId, market.locationCode);

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Rank Tracking</h1>
            <p className="text-sm text-base-content/70">
              Track keyword positions across domains
            </p>
          </div>
          <ScopeControl
            area={targetAreaScope.area}
            onChange={targetAreaScope.onChange}
            hasConfirmedArea={targetAreaScope.hasConfirmedArea}
            onClear={targetAreaScope.onClear}
          />
        </div>

        <TargetAreaBanner projectId={projectId} />

        <Outlet />
      </div>
    </div>
  );
}
