import { useCustomer } from "autumn-js/react";
import { useBillingMode } from "@/client/features/billing/useBillingMode";

/**
 * `useCustomer`, gated on the runtime billing status. On unmetered self-hosts
 * (billing disabled) `/api/autumn/*` is a 404, so every Autumn fetch is wasted
 * and logs an "[Autumn] network_error" to the console — this wrapper never
 * fires the fetch there. While the status is still resolving it holds the
 * fetch and reports `isLoading` so consumers don't flash free/paid states; if
 * the status query errors, `useBillingMode` fails open to "enabled" and the
 * customer fetch proceeds as before.
 *
 * All client `useCustomer` consumers should go through this wrapper — a bare
 * `useCustomer` reintroduces the doomed fetch on self-hosts.
 */
export function useBillingCustomer(options?: { enabled?: boolean }) {
  const wantsFetch = options?.enabled ?? true;
  const billingMode = useBillingMode({ enabled: wantsFetch });
  const customerQuery = useCustomer({
    queryOptions: {
      enabled: wantsFetch && billingMode === "enabled",
    },
  });

  return {
    ...customerQuery,
    isLoading:
      wantsFetch && billingMode === "loading" ? true : customerQuery.isLoading,
    billingDisabled: billingMode === "disabled",
  };
}
