import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getRankTrackingConfigs } from "@/serverFunctions/rank-tracking";
import { RankTrackingDomainDetail } from "@/client/features/rank-tracking/RankTrackingDomainDetail";
import { RankTrackingConfigModal } from "@/client/features/rank-tracking/RankTrackingConfigModal";
import { Button } from "@cloudflare/kumo/components/button";

export const Route = createFileRoute(
  "/_project/p/$projectId/rank-tracking/$configId",
)({
  component: RankTrackingConfigRoute,
});

function RankTrackingConfigRoute() {
  const { projectId, configId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showConfigModal, setShowConfigModal] = useState(false);

  const {
    data: configs,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["rankTrackingConfigs", projectId],
    queryFn: () => getRankTrackingConfigs({ data: { projectId } }),
  });

  const config = configs?.find((c) => c.id === configId) ?? null;

  const invalidateConfigs = () => {
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigs", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigSummaries", projectId],
    });
  };

  const handleBack = () => {
    void navigate({
      to: "/p/$projectId/rank-tracking",
      params: { projectId },
    });
  };

  if (isLoading) return null;

  // Before the not-found branch, always. A failed read leaves `configs`
  // undefined, which made `config` null and told the user their domain does not
  // exist -- reporting a deletion when nothing was read. The list is a free D1
  // query, so retrying costs nothing.
  if (isError) {
    return (
      <>
        <InlineQueryError
          message={getStandardErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
        <Button variant="ghost" size="sm" onClick={handleBack}>
          Back to domains
        </Button>
      </>
    );
  }

  if (!config) {
    return (
      <>
        <p className="text-sm text-base-content/70">
          Domain configuration not found.
        </p>
        <Button variant="ghost" size="sm" onClick={handleBack}>
          Back to domains
        </Button>
      </>
    );
  }

  return (
    <>
      <RankTrackingDomainDetail
        config={config}
        projectId={projectId}
        onBack={handleBack}
        onEdit={() => setShowConfigModal(true)}
      />

      {showConfigModal && (
        <RankTrackingConfigModal
          projectId={projectId}
          existingConfig={config}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => {
            setShowConfigModal(false);
            invalidateConfigs();
          }}
        />
      )}
    </>
  );
}
