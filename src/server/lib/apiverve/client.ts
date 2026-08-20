import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * Shared transport for APIVerve's REST endpoints.
 *
 * Deliberately free of any static `cloudflare:workers` import so this file --
 * and its error mapping, which is the part that actually decides what a user
 * is told -- can be imported by the node-environment Vitest suite.
 *
 * Nothing here retries. APIVerve bills 5 credits per call, and an automatic
 * retry on a metered endpoint is how one click becomes four charges.
 */
const APIVERVE_BASE_URL = "https://api.apiverve.com/v1";
const FETCH_TIMEOUT_MS = 5_000;

export async function apiverveGet(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const key = await getOptionalEnvValue("APIVERVE_API_KEY");
  if (!key) {
    // Thrown BEFORE any network call: an unset key must never spend a request.
    throw new AppError("APIVERVE_NOT_CONFIGURED", "APIVERVE_API_KEY is not set");
  }

  const url = new URL(`${APIVERVE_BASE_URL}/${path}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "X-API-Key": key },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `APIVerve ${path} did not respond`,
    );
  }

  if (!response.ok) {
    throw errorForStatus(response.status, path);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `APIVerve ${path} returned a body that is not JSON`,
    );
  }
}

function errorForStatus(status: number, path: string): AppError {
  switch (status) {
    case 400:
      return new AppError(
        "VALIDATION_ERROR",
        `APIVerve rejected the ${path} request`,
      );
    case 401:
      return new AppError(
        "APIVERVE_AUTH_FAILED",
        "APIVerve rejected the API key",
      );
    case 403:
      return new AppError(
        "APIVERVE_CREDITS_EXHAUSTED",
        "The APIVerve account has no credits left",
      );
    case 429:
      return new AppError("RATE_LIMITED", "APIVerve rate limit reached");
    default:
      return new AppError(
        "UPSTREAM_UNAVAILABLE",
        `APIVerve ${path} failed with status ${status}`,
      );
  }
}
