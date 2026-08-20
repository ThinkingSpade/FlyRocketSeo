import { FREE_MAX_AUDIT_PAGES } from "@/shared/audit-limits";
import { isErrorCode, type ErrorCode } from "@/shared/error-codes";
import { GBP_WRITE_NOT_CONFIGURED_MESSAGE } from "@/shared/gbp";

const STANDARD_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in and try again.",
  AUTH_CONFIG_MISSING:
    "FlyRocketSEO auth is not configured. Follow the README setup steps for Cloudflare Access.",
  PAYMENT_REQUIRED:
    "An active hosted subscription is required before you can use FlyRocketSEO.",
  INSUFFICIENT_CREDITS:
    "You've run out of credits. Add more credits or upgrade your plan to continue.",
  FORBIDDEN: "You do not have access to this resource.",
  NOT_FOUND: "The requested resource was not found.",
  AUDIT_CAPACITY_REACHED:
    "You've reached audit capacity for your account. Delete old audits from your projects to start a new one.",
  AUDIT_PAGE_LIMIT_EXCEEDED: `Free plan audits are limited to ${FREE_MAX_AUDIT_PAGES} pages. Upgrade to run larger audits.`,
  AUDIT_ALREADY_RUNNING:
    "You already have an audit running. Wait for it to finish or delete it before starting another.",
  VALIDATION_ERROR: "Please check your input and try again.",
  CRAWL_TARGET_BLOCKED: "This crawl target is blocked by security policy.",
  BACKLINKS_BILLING_ISSUE:
    "The connected DataForSEO account has a billing or balance issue.",
  AI_SEARCH_BILLING_ISSUE:
    "The connected DataForSEO account has a billing or balance issue.",
  DATAFORSEO_AUTH_FAILED:
    "DataForSEO rejected the API key. Check that DATAFORSEO_API_KEY is the base64 of your DataForSEO login:password.",
  RATE_LIMITED: "Too many requests. Please wait and try again.",
  UPSTREAM_UNAVAILABLE:
    "The data provider is temporarily unavailable. Please retry in a moment.",
  CONFLICT: "This request conflicts with existing data.",
  INTERNAL_ERROR:
    "An unexpected error occurred. Please check server logs and try again.",
  // Sourced from shared/gbp.ts (final wave item 3, an A6 residual) --
  // this was a byte-for-byte duplicate of GbpWriteService's own
  // NOT_CONFIGURED_MESSAGE, and the two drifted once one of them got the
  // A6 honesty fix and the other didn't.
  GBP_NOT_CONFIGURED: GBP_WRITE_NOT_CONFIGURED_MESSAGE,
  GBP_NOT_CONNECTED:
    "This project isn't connected to a Google Business Profile location yet. Connect one from the Local SEO tab first.",
  GEO_SEED_DATA_LOST:
    'The in-progress location data expired or was lost. Click "Seed location data" again to restart from the beginning — locations already written are unaffected.',
  // The profile drafter's five failures. The wording is the wording that was
  // already written at each throw site in ProfileDraftService/projectProfile
  // and never reached anyone, because only the CODE crosses the boundary.
  // Each one names who can fix it and what still works without it — the whole
  // feature degrades to "type it in yourself", so no failure here is fatal.
  PROJECT_DOMAIN_MISSING:
    "This project has no domain set, so there's no site to read. Add one in project settings, or fill the fields in yourself.",
  // Deliberately does not name the domain: only the code crosses the client
  // boundary, so there is nowhere to interpolate it. Worth the trade — a
  // sentence that says what happened beats one that names the site but
  // explains nothing.
  PROFILE_SITE_UNREADABLE:
    "We couldn't read that site — it may block automated requests. Fill the fields in yourself and everything downstream still works.",
  PROFILE_DRAFT_UNREADABLE:
    "The model's answer wasn't usable. Try again, or fill the fields in yourself.",
  MODEL_NOT_CONFIGURED:
    "Drafting needs an OPENROUTER_API_KEY on the deployment. Add it, or fill the fields in yourself — everything else here works without it.",
  MODEL_CREDITS_EXHAUSTED:
    "Your OpenRouter account is out of credits. Top it up at openrouter.ai/settings/credits, or fill the fields in yourself — nothing else here needs a model.",
  APIVERVE_NOT_CONFIGURED:
    "Domain expiry lookups need an APIVERVE_API_KEY on the deployment. Add it — everything else on this tab works without it.",
  APIVERVE_AUTH_FAILED:
    "APIVerve rejected the API key. Check that APIVERVE_API_KEY is a valid key from apiverve.com.",
  APIVERVE_CREDITS_EXHAUSTED:
    "The APIVerve account is out of credits. Top it up to run more domain expiry lookups — nothing else on this tab needs it.",
};

export function getStandardErrorMessage(
  error: unknown,
  fallback: string = STANDARD_MESSAGES.INTERNAL_ERROR,
): string {
  if (!(error instanceof Error)) return fallback;
  if (isErrorCode(error.message)) return STANDARD_MESSAGES[error.message];
  if (error.message) return error.message;
  return fallback;
}

export function getErrorCode(error: unknown): ErrorCode | null {
  if (!(error instanceof Error)) return null;
  return isErrorCode(error.message) ? error.message : null;
}
