import { useQuery } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import {
  isEmailVerificationBypassed,
  isHostedClientAuthMode,
} from "@/lib/auth-mode";
import { getClientRuntimeConfig } from "@/serverFunctions/config";

const CLIENT_RUNTIME_CONFIG_QUERY_KEY = ["client-runtime-config"] as const;
const CLIENT_RUNTIME_CONFIG_STALE_TIME = 5 * 60 * 1000;

type ClientRuntimeConfigQueryData = {
  emailVerificationBypassed: boolean;
  aiExplainAvailable: boolean;
  gbpWriteAvailable: boolean;
  source: "prerender" | "runtime";
};

/**
 * Shared subscription to the one client-runtime-config query. Every consumer
 * of a server-runtime-derived flag (email verification bypass, AI-explain
 * availability) reads through this, so there is exactly one cache entry and
 * exactly one forced live refetch -- owned by `ClientRuntimeConfigBootstrap`
 * in __root.tsx via `refreshOnMount`. Everyone else just subscribes without
 * refetching on their own mount, the same way the hosted-auth route guards
 * already subscribe to `useEmailVerificationBypassed` below.
 */
function useClientRuntimeConfigQuery({
  refreshOnMount = false,
}: {
  refreshOnMount?: boolean;
} = {}) {
  const prerenderedConfig = useLoaderData({ from: "__root__" });
  const isHostedMode = isHostedClientAuthMode();
  const runtimeConfigQuery = useQuery<ClientRuntimeConfigQueryData>({
    queryKey: CLIENT_RUNTIME_CONFIG_QUERY_KEY,
    queryFn: async () => ({
      ...(await getClientRuntimeConfig()),
      source: "runtime",
    }),
    initialData: {
      emailVerificationBypassed: prerenderedConfig.emailVerificationBypassed,
      aiExplainAvailable: prerenderedConfig.aiExplainAvailable,
      gbpWriteAvailable: prerenderedConfig.gbpWriteAvailable,
      source: "prerender",
    },
    // The prerendered value is only a first-paint hint. Mark it stale so the
    // root bootstrap's forced mount refetch always replaces it with a value
    // read from the live Worker environment.
    initialDataUpdatedAt: 0,
    enabled: isHostedMode,
    staleTime: CLIENT_RUNTIME_CONFIG_STALE_TIME,
    refetchOnMount: refreshOnMount ? "always" : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const isResolved =
    !isHostedMode || runtimeConfigQuery.data.source === "runtime";

  return { data: runtimeConfigQuery.data, isResolved };
}

export function useEmailVerificationBypassed({
  refreshOnMount = false,
}: {
  refreshOnMount?: boolean;
} = {}) {
  const { data, isResolved } = useClientRuntimeConfigQuery({ refreshOnMount });

  return {
    // Never expose a prerendered `true` as authoritative. Callers can only
    // bypass verification after the browser has received the runtime result.
    isBypassed:
      isResolved && isEmailVerificationBypassed(data.emailVerificationBypassed),
    isResolved,
  };
}

/**
 * Gates the insights "Explain this" button (src/client/features/insights).
 * Same trust rule as email-verification bypass: a prerendered `true` is only
 * a hint, never trusted until the live refetch (owned by
 * ClientRuntimeConfigBootstrap) confirms it against the real Worker env --
 * otherwise a hosted build made before OPENROUTER_API_KEY was set would hide
 * the button forever, even after the operator adds the key.
 */
export function useAiExplainAvailable(): boolean {
  const { data, isResolved } = useClientRuntimeConfigQuery();
  return isResolved && data.aiExplainAvailable;
}

/**
 * Gates GBP writing (scheduled posts + listing updates, src/client/features/
 * local-seo). Same trust rule as the two flags above: a prerendered `true` is
 * only a hint until the live refetch (owned by ClientRuntimeConfigBootstrap)
 * confirms it against the real Worker env -- otherwise a build made before
 * GBP_GOOGLE_CLIENT_ID/SECRET were set would hide the feature forever, even
 * after the operator finishes Cloud Console + verification and adds them.
 */
export function useGbpWriteAvailable(): boolean {
  const { data, isResolved } = useClientRuntimeConfigQuery();
  return isResolved && data.gbpWriteAvailable;
}
