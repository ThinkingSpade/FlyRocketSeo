import {
  AiOptimizationApi,
  BacklinksApi,
  BusinessDataApi,
  ContentAnalysisApi,
  DataforseoLabsApi,
  DomainAnalyticsApi,
  KeywordsDataApi,
  OnPageApi,
  SerpApi,
} from "dataforseo-client";
import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import type { ErrorCode } from "@/shared/error-codes";

const API_BASE = "https://api.dataforseo.com";
const MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH = 1600;
// Safety ceiling on any live call (Lighthouse is the slowest, ~tens of seconds).
const DATAFORSEO_REQUEST_TIMEOUT_MS = 60_000;
// Retry budget for READS only. Total attempts = retries + 1; the shared
// request-timeout signal still caps overall wall time.
export const DATAFORSEO_MAX_RETRIES = 2;
const DATAFORSEO_RETRY_BACKOFF_MS = 250;

/**
 * Should this failed DataForSEO request be replayed?
 *
 * Only GETs. This code previously retried any 5xx twice while its own comment
 * called the operation "an idempotent read" — but it never checked the method,
 * and DataForSEO's `live` and `task_post` endpoints are POSTs that bill per
 * request. A 5xx does not tell us whether the provider already did the work and
 * charged for it, so replaying one can pay two or three times for a single user
 * action. Combined with the Lighthouse layer's own attempts this reached nine
 * HTTP calls for one strategy.
 *
 * Reads (`task_get`) are GETs, cost nothing to repeat, and are the only case a
 * transient 5xx is worth riding out.
 *
 * Exported so the money rule is directly testable rather than buried in a fetch
 * closure — it had no test at all before.
 */
export function shouldRetryDataforseoRequest(request: {
  status: number;
  method?: string;
  attempt: number;
}): boolean {
  if (request.attempt >= DATAFORSEO_MAX_RETRIES) return false;
  if (request.status < 500) return false;
  // Absent method defaults to NOT retrying. fetch() would treat it as a GET, but
  // guessing wrong here costs real money, so the safe default wins.
  return request.method?.toUpperCase() === "GET";
}

/**
 * Translates a DataForSEO HTTP/task failure into a product-specific AppError
 * (e.g. "billing issue"). Returns null when the failure isn't one this
 * classifier recognises, so the caller can fall back to a generic error. See
 * {@link createDataforseoBillingClassifier}.
 */
export type DataforseoErrorClassifier = (
  status: number | undefined,
  details: string,
  path: string,
) => AppError | null;

function formatDataforseoErrorPayload(value: unknown): string {
  const text =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();

  return text.length > MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH
    ? `${text.slice(0, MAX_DATAFORSEO_ERROR_PAYLOAD_LENGTH)}... [truncated]`
    : text;
}

function formatDataforseoRequestPath(url: RequestInfo): string {
  const rawUrl = typeof url === "string" ? url : url.url;
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return rawUrl;
  }
}

/**
 * The single authenticated `fetch` used by every DataForSEO SDK call. Throws on
 * non-2xx so the SDK's own `ApiException` path never fires; task-level failures
 * (which return HTTP 200) are handled downstream by {@link assertOk}. An
 * optional classifier maps recognised HTTP failures to product errors.
 */
function createAuthenticatedFetch(classify?: DataforseoErrorClassifier) {
  return async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
    const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Basic ${apiKey}`);
    // Resolve the signal once so retries share the overall request timeout
    // rather than restarting a fresh 60s budget on each attempt.
    const signal =
      init?.signal ?? AbortSignal.timeout(DATAFORSEO_REQUEST_TIMEOUT_MS);

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { ...init, headers, signal });
      if (response.ok) return response;

      // Transient upstream 5xx on a READ -> back off and retry. A POST is
      // billable and is never replayed; see shouldRetryDataforseoRequest.
      if (
        shouldRetryDataforseoRequest({
          status: response.status,
          method: init?.method,
          attempt,
        })
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, DATAFORSEO_RETRY_BACKOFF_MS * (attempt + 1)),
        );
        continue;
      }

      const rawText = await response.text();
      const path = formatDataforseoRequestPath(url);
      const classified = classify?.(response.status, rawText, path);
      if (classified) throw classified;

      const code: ErrorCode =
        response.status >= 500
          ? "UPSTREAM_UNAVAILABLE"
          : response.status === 429
            ? "RATE_LIMITED"
            : response.status === 401
              ? "DATAFORSEO_AUTH_FAILED"
              : "INTERNAL_ERROR";
      const error = new AppError(
        code,
        `DataForSEO HTTP ${response.status} on ${path}`,
        {
          provider: "dataforseo",
          providerStatus: String(response.status),
          providerPath: path,
          responseBody: formatDataforseoErrorPayload(rawText),
        },
      );
      error.name = "DataForSEOHttpError";
      throw error;
    }
  };
}

function http(classify?: DataforseoErrorClassifier) {
  return { fetch: createAuthenticatedFetch(classify) };
}

// Per-section API factories. Each is created per-request so the auth secret is
// read lazily (it lives in the Worker env, not in module scope).
export const labsApi = () => new DataforseoLabsApi(API_BASE, http());
export const keywordsDataApi = () => new KeywordsDataApi(API_BASE, http());
export const serpApi = () => new SerpApi(API_BASE, http());
export const businessDataApi = () => new BusinessDataApi(API_BASE, http());
export const onPageApi = () => new OnPageApi(API_BASE, http());
export const backlinksApi = (classify?: DataforseoErrorClassifier) =>
  new BacklinksApi(API_BASE, http(classify));
export const aiOptimizationApi = (classify?: DataforseoErrorClassifier) =>
  new AiOptimizationApi(API_BASE, http(classify));
export const contentAnalysisApi = () =>
  new ContentAnalysisApi(API_BASE, http());
export const domainAnalyticsApi = () =>
  new DomainAnalyticsApi(API_BASE, http());

/**
 * Authenticated GET for DataForSEO endpoints the SDK doesn't wrap (e.g.
 * `/v3/appendix/user_data`). Reuses the shared auth/timeout/retry fetch, so a
 * non-2xx throws the same classified AppError as every other call. Returns the
 * parsed JSON body; the caller validates its shape.
 */
export async function dataforseoGetJson(path: string): Promise<unknown> {
  const authFetch = createAuthenticatedFetch();
  const response = await authFetch(`${API_BASE}${path}`);
  return response.json();
}
