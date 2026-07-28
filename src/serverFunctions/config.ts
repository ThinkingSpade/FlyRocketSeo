import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { isGbpWriteConfigured } from "@/server/features/gbp/oauth-config";

export const getClientRuntimeConfig = createServerFn({ method: "GET" }).handler(
  async () => ({
    emailVerificationBypassed: env.BYPASS_EMAIL_VERIFICATION === "true",
    // Gates the insights "Explain this" button. Without a key the button is
    // hidden rather than shown-and-broken (see ExplainService).
    aiExplainAvailable: Boolean(env.OPENROUTER_API_KEY?.trim()),
    // Gates GBP writing (scheduled posts + listing updates) on the Local SEO
    // tab. Without GBP_GOOGLE_CLIENT_ID/SECRET the connect affordance shows
    // what connecting would enable instead of a button that cannot work --
    // same pattern as aiExplainAvailable above (see GbpWriteService).
    gbpWriteAvailable: await isGbpWriteConfigured(),
  }),
);

export const getSeoApiKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(() => {
    const configured = Boolean(env.DATAFORSEO_API_KEY?.trim());
    return { configured };
  });

/**
 * Live DataForSEO account balance for the header/sidebar indicator.
 *
 * The balance is account-wide, so it's only exposed in self-hosted mode where
 * the API key belongs to the end user. In hosted mode the key is the operator's
 * shared account — returning `{ supported: false }` keeps that balance private.
 */
export const getDataforseoAccountStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    if (await isHostedServerAuthMode()) {
      return { supported: false as const };
    }

    if (!env.DATAFORSEO_API_KEY?.trim()) {
      return {
        supported: true as const,
        configured: false as const,
        balance: null,
      };
    }

    try {
      // Loaded lazily to keep the DataForSEO SDK out of the Worker startup graph.
      const { fetchDataforseoBalance } =
        await import("@/server/lib/dataforseo/account");
      const balance = await fetchDataforseoBalance();
      return { supported: true as const, configured: true as const, balance };
    } catch {
      // Balance is a best-effort convenience; an upstream hiccup must never
      // break the app shell that renders the indicator.
      return {
        supported: true as const,
        configured: true as const,
        balance: null,
      };
    }
  });
