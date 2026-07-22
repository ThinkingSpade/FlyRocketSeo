/** Better Auth providerId for the incremental Google Search Console connection.
 *  Kept in `shared` so both server (auth config, GSC client) and client (connect
 *  button) can reference it without importing the server-only auth config. */
export const GSC_OAUTH_PROVIDER_ID = "google-search-console";

export type GscSitesErrorReason =
  | "requires_reconnect"
  | "api_not_configured"
  | "temporary";

export const GSC_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/webmasters.readonly",
] as const;

export const GSC_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/ThinkingSpade/FlyRocketSeo/blob/main/docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md";
