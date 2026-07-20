import { useQuery } from "@tanstack/react-query";
import { getBillingRuntimeStatus } from "@/serverFunctions/billing";

export type BillingMode = "loading" | "enabled" | "disabled";

/**
 * Runtime billing state for gating billing/upgrade UI. Returns "disabled" ONLY
 * when the server confirms billing is off (hosted mode with no Autumn key = an
 * unmetered self-host). While loading, or if the status query errors, it stays
 * non-"disabled" — so we never hide billing UI on uncertainty and a
 * money-sensitive failure never flips gates the wrong way.
 */
export function useBillingMode(): BillingMode {
  const query = useQuery({
    queryKey: ["billingRuntimeStatus"],
    queryFn: () => getBillingRuntimeStatus(),
    staleTime: 5 * 60 * 1000,
  });

  if (query.data) {
    return query.data.enabled ? "enabled" : "disabled";
  }
  return "loading";
}
