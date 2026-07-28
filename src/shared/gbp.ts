/** Better Auth providerId for the Google Business Profile WRITE connection
 *  (posts + listing updates). Kept in `shared` so both server (auth config,
 *  GBP API client) and client (connect button) can reference it without
 *  importing server-only code -- same reasoning as GSC_OAUTH_PROVIDER_ID in
 *  `@/shared/gsc`.
 *
 *  Deliberately a SEPARATE providerId from GSC_OAUTH_PROVIDER_ID: GBP writing
 *  needs the RESTRICTED `business.manage` scope (Google Cloud Console
 *  configuration + a Google verification review before real users can grant
 *  it), while GSC only ever needed the sensitive-but-unrestricted
 *  `webmasters.readonly` scope. Requesting business.manage under the SAME
 *  provider/grant as GSC would mean every future GSC token refresh re-asserts
 *  a scope GSC users never agreed to, and revoking/reconnecting GBP could
 *  touch the GSC grant. Two providers, two grants, two blast radii. */
export const GBP_OAUTH_PROVIDER_ID = "google-business-profile";

/** `openid`/`email`/`profile` mirror GSC_OAUTH_SCOPES's own shape (they give
 *  us the id_token `sub` used to identify the connecting Google account, the
 *  same way selfHostedOAuth.ts's getGoogleAccountId does). `business.manage`
 *  is the one RESTRICTED scope: it grants read/write access to the user's
 *  Google Business Profile listings and requires Google's restricted-scope
 *  verification (CASA-style review) before it can be requested from real
 *  users beyond the 100-test-user cap on an OAuth consent screen still in
 *  "Testing" publishing status. See GBP_GOOGLE_CLIENT_ID in src/env.d.ts for
 *  the operator-side gate on this ever being requested at all. */
export const GBP_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/business.manage",
] as const;

/**
 * Canonical, honest copy for "GBP writing isn't available on this
 * deployment yet" -- shown from TWO different code paths: GbpWriteService's
 * server-side gate (a toast when a write action is attempted without the
 * capability) and error-messages.ts's client-side GBP_NOT_CONFIGURED
 * mapping (reached when connecting itself is blocked -- see
 * selfHostedGbpOAuth.ts's createSelfHostedGbpAuthorizationUrl, whose thrown
 * AppError crosses the server-function boundary as just the CODE, per
 * toClientError -- this map's text is the only thing the user ever sees).
 *
 * ONE string, not two copies that can drift: this exact duplication is why
 * an earlier honesty fix (finding A6 -- stop claiming which setup step is
 * incomplete) landed in GbpNotConfiguredCard.tsx's prose but missed both of
 * these, which kept the old "ask your operator to finish the Cloud Console
 * setup and Google's verification review" claim. isGbpWriteConfigured() can
 * only confirm env vars are present (oauth-config.ts) -- it has no way to
 * check Google's scope/verification status at all, so this deliberately
 * never asserts which piece is missing.
 */
export const GBP_WRITE_NOT_CONFIGURED_MESSAGE =
  "Google Business Profile writing isn't available on this deployment yet. Ask your operator to check the Cloud Console setup, Google's verification review, and the required environment variables (see .env.example).";
