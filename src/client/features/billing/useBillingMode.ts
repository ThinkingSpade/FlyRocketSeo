import { useQuery } from "@tanstack/react-query";
import { getBillingRuntimeStatus } from "@/serverFunctions/billing";

export type BillingMode = "loading" | "enabled" | "disabled";

/**
 * Runtime billing state for gating billing/upgrade UI. Returns "disabled" ONLY
 * when the server confirms billing is off (hosted mode with no Autumn key = an
 * unmetered self-host). While loading it reports "loading"; if the status query
 * errors it resolves to "enabled" — so we never hide billing UI (or skip a
 * billing fetch) on uncertainty, and a money-sensitive failure never flips
 * gates the wrong way.
 *
 * Pass `enabled: false` to hold the status query itself (e.g. before a session
 * exists — the server fn requires auth); the mode then stays "loading".
 */
export function useBillingMode(options?: { enabled?: boolean }): BillingMode {
  const query = useQuery({
    queryKey: ["billingRuntimeStatus"],
    queryFn: () => getBillingRuntimeStatus(),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });

  if (query.data) {
    return query.data.enabled ? "enabled" : "disabled";
  }
  if (query.isError) {
    return "enabled";
  }
  return "loading";
}
