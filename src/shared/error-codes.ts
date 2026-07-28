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
]);

export function isErrorCode(value: string): value is ErrorCode {
  return errorCodeSchema.safeParse(value).success;
}

export function shouldCaptureAppErrorCode(
  code: ErrorCode | null | undefined,
): boolean {
  return code == null || !NON_REPORTABLE_ERROR_CODES.has(code);
}
