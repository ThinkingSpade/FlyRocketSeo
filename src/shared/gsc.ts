/** Better Auth providerId for the incremental Google Search Console connection.
 *  Kept in `shared` so both server (auth config, GSC client) and client (connect
 *  button) can reference it without importing the server-only auth config. */
export const GSC_OAUTH_PROVIDER_ID = "google-search-console";

export type GscSitesErrorReason =
  | "requires_reconnect"
  | "api_not_configured"
  | "temporary";

/** Why a project's Search Console data is unavailable. `not_connected` is the
 *  genuine first-run state (no property bound yet); every other value means a
 *  property IS bound but Google refused the read, so the UI must offer a
 *  reconnect/fix instead of the pristine "Connect Search Console" prompt. */
export type GscAccessFailureReason =
  | "not_connected"
  | "requires_reconnect"
  | "api_not_configured"
  | "permission_denied";

export const GSC_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/webmasters.readonly",
] as const;

export const GSC_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/ThinkingSpade/FlyRocketSeo/blob/main/docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md";
