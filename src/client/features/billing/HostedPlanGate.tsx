import type { ReactNode } from "react";
import { useBillingCustomer } from "@/client/features/billing/useBillingCustomer";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getCustomerPlanStatus } from "@/client/features/billing/plan-detection";

export type HostedPlanGateState = {
  isLoading: boolean;
  isFreePlan: boolean;
};

const SELF_HOSTED_PLAN_GATE: HostedPlanGateState = {
  isLoading: false,
  isFreePlan: false,
};

export function HostedPlanGate({
  children,
}: {
  children: (state: HostedPlanGateState) => ReactNode;
}) {
  if (!isHostedClientAuthMode()) {
    return children(SELF_HOSTED_PLAN_GATE);
  }

  return <HostedPlanGateContent>{children}</HostedPlanGateContent>;
}

function HostedPlanGateContent({
  children,
}: {
  children: (state: HostedPlanGateState) => ReactNode;
}) {
  const { data: session, isPending: isSessionPending } = useSession();
  const hasSession = Boolean(session?.user?.id);
  const customerQuery = useBillingCustomer({ enabled: hasSession });

  return children({
    isLoading: isSessionPending || !hasSession || customerQuery.isLoading,
    isFreePlan:
      !!customerQuery.data &&
      getCustomerPlanStatus(customerQuery.data) === "free",
  });
}
