import { z } from "zod";

const ERROR_CODES = [
  "UNAUTHENTICATED",
  "AUTH_CONFIG_MISSING",
  "PAYMENT_REQUIRED",
  "INSUFFICIENT_CREDITS",
  "FORBIDDEN",
  "NOT_FOUND",
  "AUDIT_CAPACITY_REACHED",
  "AUDIT_PAGE_LIMIT_EXCEEDED",
  "AUDIT_ALREADY_RUNNING",
  "VALIDATION_ERROR",
  "CRAWL_TARGET_BLOCKED",
  "BACKLINKS_BILLING_ISSUE",
  "AI_SEARCH_BILLING_ISSUE",
  "DATAFORSEO_AUTH_FAILED",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "CONFLICT",
  "INTERNAL_ERROR",
  // Every server function error collapses to just its CODE at the client
  // boundary (see toClientError) -- these two exist so "GBP writing isn't
  // configured" and "this project isn't connected yet" each show their own
  // accurate copy instead of borrowing AUTH_CONFIG_MISSING's generic
  // Cloudflare Access text or NOT_FOUND's generic one.
  "GBP_NOT_CONFIGURED",
  "GBP_NOT_CONNECTED",
  // The geo location seed job stages its one-time derived row list in R2
  // across the ~48 chunk calls a full run needs (see
  // geoLocationSeedStore.ts). This fires only if that staged data goes
  // missing between two chunk calls in the same run (TTL expiry after a long
  // pause, or an R2 read failure) -- a distinct, rare condition from any
  // other UPSTREAM/INTERNAL failure, and one with its own safe recovery
  // (restart the run) worth stating plainly rather than folding into a
  // generic "something went wrong".
  "GEO_SEED_DATA_LOST",
  // Same reason as the three above: the profile drafter had FIVE distinct
  // failures, each with its own written explanation and its own remedy, and
  // every one of them reached the user as INTERNAL_ERROR's "check server
  // logs" -- advice an end user cannot act on and which named the wrong
  // person. Two were worse than useless: a missing key and an empty
  // OpenRouter balance both threw PAYMENT_REQUIRED, so a user whose model
  // account needed topping up was told to buy a FlyRocketSEO subscription.
  "PROJECT_DOMAIN_MISSING",
  "PROFILE_SITE_UNREADABLE",
  "PROFILE_DRAFT_UNREADABLE",
  "MODEL_NOT_CONFIGURED",
  "MODEL_CREDITS_EXHAUSTED",
  // APIVerve backs the domain expiry lookup. Three distinct states, for the
  // same reason the MODEL_* pair above exists: an unset key is the operator's
  // job, a rejected key is a real fault, and an empty APIVerve quota is
  // neither -- and crucially none of them is INSUFFICIENT_CREDITS, which means
  // the CUSTOMER's metered balance is empty. Reusing that code here would tell
  // a user to top up an account that is not the problem.
  "APIVERVE_NOT_CONFIGURED",
  "APIVERVE_AUTH_FAILED",
  "APIVERVE_CREDITS_EXHAUSTED",
  // WhoisFreaks supplies the daily deleted-domains feed. Same split as the
  // APIVerve pair above: an unset key is the operator's job, a rejected key is
  // a real fault. 403 maps to AUTH_FAILED rather than a credits code because
  // this is a flat subscription -- there are no per-call credits to exhaust.
  "WHOISFREAKS_NOT_CONFIGURED",
  "WHOISFREAKS_AUTH_FAILED",
  // Internal control-flow signal for a feed date that predates the active
  // WhoisFreaks subscription window. The harvest records that date as skipped
  // instead of retrying it forever.
  "WHOISFREAKS_SUBSCRIPTION_WINDOW",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

const NON_REPORTABLE_ERROR_CODES = new Set<ErrorCode>([
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "PAYMENT_REQUIRED",
  "INSUFFICIENT_CREDITS",
  "VALIDATION_ERROR",
  "AUDIT_CAPACITY_REACHED",
  "AUDIT_PAGE_LIMIT_EXCEEDED",
  "AUDIT_ALREADY_RUNNING",
  // An expected per-project state (haven't connected GBP yet), not a bug --
  // same treatment as NOT_FOUND above.
  "GBP_NOT_CONNECTED",
  // Configuration and third-party-account states, not faults in this code:
  // the project has no domain yet, the operator hasn't set a key, the user's
  // OpenRouter balance ran out, or the client's own site refused a bot. Each
  // is a thing SOMEONE can fix, and none of them is a bug worth paging on.
  // PROFILE_DRAFT_UNREADABLE is deliberately NOT here -- a model returning
  // output we cannot parse is a real defect signal worth capturing.
  "PROJECT_DOMAIN_MISSING",
  "PROFILE_SITE_UNREADABLE",
  "MODEL_NOT_CONFIGURED",
  "MODEL_CREDITS_EXHAUSTED",
  // Operator configuration and a third-party quota -- someone can fix each,
  // neither is a bug. APIVERVE_AUTH_FAILED is deliberately absent: a key that
  // IS set and still gets rejected is a real defect signal, exactly as
  // DATAFORSEO_AUTH_FAILED is.
  "APIVERVE_NOT_CONFIGURED",
  "APIVERVE_CREDITS_EXHAUSTED",
  // Operator configuration, not a bug. WHOISFREAKS_AUTH_FAILED stays
  // reportable for the same reason DATAFORSEO_AUTH_FAILED does.
  "WHOISFREAKS_NOT_CONFIGURED",
  "WHOISFREAKS_SUBSCRIPTION_WINDOW",
]);

export function isErrorCode(value: string): value is ErrorCode {
  return errorCodeSchema.safeParse(value).success;
}

export function shouldCaptureAppErrorCode(
  code: ErrorCode | null | undefined,
): boolean {
  return code == null || !NON_REPORTABLE_ERROR_CODES.has(code);
}
