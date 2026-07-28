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
