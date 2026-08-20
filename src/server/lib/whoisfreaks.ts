import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * The daily deleted-domains feed.
 *
 * These are domains that have already dropped and are registerable at
 * registration price right now -- not the "expiring" feed, which lists domains
 * still in redemption or pending-delete that nobody can register yet.
 *
 * The subscription behind this is expected to be temporary: it is a tap that
 * gets turned off after a harvest window. Nothing downstream may depend on it
 * still being live, which is why matches are persisted rather than re-fetched.
 *
 * No `cloudflare:workers` import, so the transport and its error mapping stay
 * reachable from the node-environment test suite.
 */
const ENDPOINT = "https://whoisfreaks.com/api/v3/dropped-domains";
const FETCH_TIMEOUT_MS = 30_000;

/**
 * The documented shape is a bare array of names. A wrapped object is a common
 * drift for feeds like this, so both are accepted -- failing a whole day's
 * harvest over an envelope would be a poor trade.
 */
const payloadSchema = z.union([
  z.array(z.string()),
  z.object({ domains: z.array(z.string()) }),
  z.object({ domain_names: z.array(z.string()) }),
]);

export async function fetchDroppedDomains(input: {
  /** yyyy-MM-dd. Files for a day publish at 03:00 UTC the following day. */
  date: string;
  /** Restricts the payload server-side; we only ever want a couple of TLDs. */
  tlds: string[];
}): Promise<string[]> {
  const key = await getOptionalEnvValue("WHOISFREAKS_API_KEY");
  if (!key) {
    throw new AppError(
      "WHOISFREAKS_NOT_CONFIGURED",
      "WHOISFREAKS_API_KEY is not set",
    );
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("apiKey", key);
  url.searchParams.set("date", input.date);
  url.searchParams.set("tlds", input.tlds.join(","));
  // Names-only: the subscribed plan carries no WHOIS, and asking for it would
  // be a different (and more expensive) product.
  url.searchParams.set("whois", "false");

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "WhoisFreaks did not respond in time",
    );
  }

  if (!response.ok) throw errorForStatus(response.status);

  let parsed;
  try {
    parsed = payloadSchema.safeParse(await response.json());
  } catch {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "WhoisFreaks returned a body that is not JSON",
    );
  }
  if (!parsed.success) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "WhoisFreaks returned an unexpected payload shape",
    );
  }

  const names = Array.isArray(parsed.data)
    ? parsed.data
    : "domains" in parsed.data
      ? parsed.data.domains
      : parsed.data.domain_names;

  return names.map((name) => name.trim().toLowerCase()).filter(Boolean);
}

function errorForStatus(status: number): AppError {
  switch (status) {
    // 403 is auth here, not credits: this is a flat subscription with no
    // per-call balance to run out of.
    case 401:
    case 403:
      return new AppError(
        "WHOISFREAKS_AUTH_FAILED",
        "WhoisFreaks rejected the API key",
      );
    case 429:
      return new AppError("RATE_LIMITED", "WhoisFreaks rate limit reached");
    default:
      return new AppError(
        "UPSTREAM_UNAVAILABLE",
        `WhoisFreaks failed with status ${status}`,
      );
  }
}
