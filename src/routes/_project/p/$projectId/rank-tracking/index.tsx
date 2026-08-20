import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectMarket } from "@/client/hooks/useProjectDomain";
import { useTargetArea } from "@/client/features/geo/useTargetArea";
import { resolveActiveScopeArea } from "@/client/features/geo/resolveScopeArea";
import { getRankTrackingConfigSummaries } from "@/serverFunctions/rank-tracking";
import { normalizeDomain } from "@/types/schemas/domain";
import { RankTrackingDomainList } from "@/client/features/rank-tracking/RankTrackingDomainList";
import { RankTrackingConfigModal } from "@/client/features/rank-tracking/RankTrackingConfigModal";

export const Route = createFileRoute("/_project/p/$projectId/rank-tracking/")({
  component: RankTrackingIndex,
});

/** Best-effort: an inbound link can carry anything, and a domain we cannot
 *  normalize simply matches nothing and prefills the form as typed. */
function safeNormalizeDomain(value: string): string {
  try {
    return normalizeDomain(value);
  } catch {
    return value.trim().toLowerCase();
  }
}

function RankTrackingIndex() {
  const { projectId } = Route.useParams();
  const { domain: requestedDomain } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [prefillDomain, setPrefillDomain] = useState<string | undefined>(
    undefined,
  );

  // The SAME resolved value the layout's own ScopeControl (rank-tracking.tsx)
  // shows next to the heading -- read independently here rather than threaded
  // through Outlet (TanStack Router has no react-router-style outlet context
  // for live component state) -- both calls share the cached
  // ["target-area", projectId] query, so this costs no extra fetch. Only
  // consumed as the CREATE flow's own initial pick (RankTrackingConfigModal's
  // `defaultArea`); never read into anything metered.
  const market = useProjectMarket(projectId);
  const targetAreaQuery = useTargetArea(projectId);
  const confirmedArea = targetAreaQuery.data?.confirmed
    ? targetAreaQuery.data.area
    : null;
  const defaultConfigArea = resolveActiveScopeArea(
    confirmedArea,
    market.locationCode,
  );

  // Shares RankTrackingDomainList's own cache entry, so reading it here to
  // resolve `?domain=` costs no extra request.
  const summariesQuery = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });

  // Lands the `?domain=` handoff exactly once, then clears it: on the tracker
  // that already exists, or on a create form filled in with what the link
  // asked for. Left in the URL it would reopen the modal every time the user
  // closed it.
  const summaries = summariesQuery.data;
  useEffect(() => {
    if (!requestedDomain || !summaries) return;
    const wanted = safeNormalizeDomain(requestedDomain);
    const match = summaries.find(
      (config) => safeNormalizeDomain(config.domain) === wanted,
    );
    if (match) {
      void navigate({
        to: "/p/$projectId/rank-tracking/$configId",
        params: { projectId, configId: match.id },
        replace: true,
      });
      return;
    }
    setPrefillDomain(wanted);
    setShowConfigModal(true);
    void navigate({
      to: "/p/$projectId/rank-tracking",
      params: { projectId },
      search: {},
      replace: true,
    });
  }, [navigate, projectId, requestedDomain, summaries]);

  const invalidateConfigs = () => {
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigs", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigSummaries", projectId],
    });
  };

  const closeConfigModal = () => {
    setShowConfigModal(false);
    setPrefillDomain(undefined);
  };

  return (
    <>
      <RankTrackingDomainList
        projectId={projectId}
        onAddDomain={() => setShowConfigModal(true)}
      />

      {showConfigModal && (
        <RankTrackingConfigModal
          projectId={projectId}
          existingConfig={null}
          defaultArea={defaultConfigArea}
          defaultDomain={prefillDomain}
          onClose={closeConfigModal}
          onConfigCreated={invalidateConfigs}
          onSaved={(createdConfigId) => {
            closeConfigModal();
            invalidateConfigs();
            if (createdConfigId) {
              void navigate({
                to: "/p/$projectId/rank-tracking/$configId",
                params: { projectId, configId: createdConfigId },
              });
            }
          }}
        />
      )}
    </>
  );
}
