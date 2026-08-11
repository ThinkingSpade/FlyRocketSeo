import { createFileRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod";
import { useProjectMarket } from "@/client/hooks/useProjectDomain";
import { ScopeControl } from "@/client/features/geo/ScopeControl";
import { TargetAreaBanner } from "@/client/features/geo/TargetAreaBanner";
import { useTargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import { AppPageShell } from "@/client/components/AppPageShell";

/**
 * `domain` is the site an inbound link wants tracked -- every tab that names
 * a competitor or a client domain can now hand it over instead of dropping
 * the user on the domain list to find or retype it. Declared on the LAYOUT so
 * both children inherit it; `rank-tracking/index.tsx` is what consumes it,
 * either by opening that domain's existing tracker or by starting the create
 * flow already filled in.
 */
const rankTrackingSearchSchema = z.object({
  domain: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_project/p/$projectId/rank-tracking")({
  validateSearch: rankTrackingSearchSchema,
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
  // separate, already-existing concept: this control never rewrites an
  // EXISTING tracked config's stored locationCode (an existing US tracker
  // must keep saying US), and never fires a metered rank check by itself --
  // changing it is a free D1 write, same as every other tab's ScopeControl.
  // It genuinely affects something, though: rank-tracking/index.tsx reads
  // this same confirmed area independently (Outlet has no react-router-style
  // context for live state) and hands it to RankTrackingConfigModal as a
  // brand-NEW config's own starting pick -- see rankTrackingConfigArea.ts's
  // own header for why a metro/city default needed that modal's picker
  // upgraded from a country-only LocationSelect to GeoLocationSelect.
  const market = useProjectMarket(projectId);
  const targetAreaScope = useTargetAreaScope(projectId, market.locationCode);

  return (
    <AppPageShell>
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
    </AppPageShell>
  );
}
