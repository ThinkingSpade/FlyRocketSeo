import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectMarket } from "@/client/hooks/useProjectDomain";
import { useTargetArea } from "@/client/features/geo/useTargetArea";
import { resolveActiveScopeArea } from "@/client/features/geo/resolveScopeArea";
import { RankTrackingDomainList } from "@/client/features/rank-tracking/RankTrackingDomainList";
import { RankTrackingConfigModal } from "@/client/features/rank-tracking/RankTrackingConfigModal";

export const Route = createFileRoute("/_project/p/$projectId/rank-tracking/")({
  component: RankTrackingIndex,
});

function RankTrackingIndex() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showConfigModal, setShowConfigModal] = useState(false);

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

  const invalidateConfigs = () => {
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigs", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigSummaries", projectId],
    });
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
          onClose={() => setShowConfigModal(false)}
          onConfigCreated={invalidateConfigs}
          onSaved={(createdConfigId) => {
            setShowConfigModal(false);
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
