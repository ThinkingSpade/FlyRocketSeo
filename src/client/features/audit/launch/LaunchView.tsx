import { useBillingCustomer } from "@/client/features/billing/useBillingCustomer";
import { AuditHistorySection } from "@/client/features/audit/launch/AuditHistorySection";
import { LaunchFormCard } from "@/client/features/audit/launch/LaunchFormCard";
import { useLaunchController } from "@/client/features/audit/launch/useLaunchController";
import { getCustomerPlanStatus } from "@/client/features/billing/plan-detection";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { AppPageShell } from "@/client/components/AppPageShell";

type LaunchViewProps = {
  projectId: string;
  onAuditStarted: (auditId: string) => void;
};

export function LaunchView(props: LaunchViewProps) {
  // Self-hosted has no Autumn customer and resolves to the paid tier on the
  // server, so only hosted mode needs to look up the plan.
  if (!isHostedClientAuthMode()) {
    return <LaunchContent {...props} isFreePlan={false} />;
  }

  return <HostedLaunchView {...props} />;
}

function HostedLaunchView(props: LaunchViewProps) {
  const { data: session } = useSession();
  const customerQuery = useBillingCustomer({
    enabled: Boolean(session?.user?.id),
  });

  // Until the customer loads, leave the form unrestricted rather than flash
  // free-plan copy at paid users; the server enforces the limit regardless.
  const isFreePlan =
    customerQuery.data != null &&
    getCustomerPlanStatus(customerQuery.data) === "free";

  return <LaunchContent {...props} isFreePlan={isFreePlan} />;
}

function LaunchContent({
  projectId,
  isFreePlan,
  onAuditStarted,
}: LaunchViewProps & { isFreePlan: boolean }) {
  const controller = useLaunchController({
    projectId,
    isFreePlan,
    onAuditStarted,
  });

  return (
    <AppPageShell>
      <h1 className="text-2xl font-semibold">Site Audit</h1>

      <LaunchFormCard
        launchForm={controller.launchForm}
        commitMaxPagesInput={controller.commitMaxPagesInput}
        maxPagesLimit={controller.maxPagesLimit}
      />

      <AuditHistorySection
        projectId={projectId}
        history={controller.historyQuery.data ?? []}
        isLoading={controller.historyQuery.isLoading}
        onDelete={controller.deleteAudit}
      />
    </AppPageShell>
  );
}
