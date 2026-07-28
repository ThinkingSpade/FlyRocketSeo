import { getOptionalEnvValue } from "@/server/lib/runtime-env";

type GbpOAuthClientConfig = {
  clientId: string;
  clientSecret: string;
};

/**
 * The Google OAuth client used ONLY for the business.manage (GBP write)
 * grant -- see src/shared/gbp.ts for why this must never be
 * GOOGLE_CLIENT_ID/SECRET (GSC's client).
 *
 * Deliberately env-only, with no DB-editable override the way GSC's
 * oauth-config.ts has one: GBP writing additionally requires the operator to
 * have completed Google's restricted-scope verification for this exact
 * client, which a same-day settings-page edit could never keep in sync with.
 * Env vars (set at deploy time, alongside the Cloud Console + verification
 * work they require) are the honest match for that.
 */
export async function getGbpOAuthClientConfig(): Promise<GbpOAuthClientConfig | null> {
  const clientId = (await getOptionalEnvValue("GBP_GOOGLE_CLIENT_ID"))?.trim();
  const clientSecret = (
    await getOptionalEnvValue("GBP_GOOGLE_CLIENT_SECRET")
  )?.trim();

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret };
}

/**
 * Whether GBP writing is wireable in this deployment: the operator has set
 * the GBP-specific OAuth client AND BETTER_AUTH_SECRET (>=32 chars, encrypts
 * the stored tokens -- same scheme as GSC's grant).
 *
 * NECESSARY, not SUFFICIENT: this says nothing about whether Google has
 * actually approved this client for the restricted business.manage scope --
 * there is no API to check that, and no way for us to know it. Same honesty
 * rule as aiExplainAvailable (config.ts): surface exactly what we can verify,
 * gate the UI on it, and let the connect-flow copy and operator docs own the
 * rest (see getClientRuntimeConfig's gbpWriteAvailable).
 */
export async function isGbpWriteConfigured(): Promise<boolean> {
  if (!(await getGbpOAuthClientConfig())) return false;

  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= 32);
}
