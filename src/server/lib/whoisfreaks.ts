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
 *
 * The endpoint below was VERIFIED against the live API, not read off a docs
 * summary. The published documentation renders its example URLs via
 * JavaScript, and fetching that page yields an "inferred" endpoint on the
 * marketing host which answers every request with a Next.js 404 PAGE -- HTML,
 * not an API error, which is what makes the mistake easy to miss. The real
 * feed lives on a separate `files.` host under a different version segment.
 */
const ENDPOINT = "https://files.whoisfreaks.com/v3.1/download/domainer/dropped";
/** A day is ~2 MB gzipped / ~240k rows, so allow for a slow transfer. */
const FETCH_TIMEOUT_MS = 90_000;

export async function fetchDroppedDomains(input: {
  /** yyyy-MM-dd. Files for a day publish at 03:00 UTC the following day. */
  date: string;
  /** Kept client-side: the download is a whole-day file, not a filtered query. */
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
  // Names-only. Asking for WHOIS on this subscription returns 413 "Please
  // upgrade your plans" -- the API enforces the tier, so this is not optional.
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

  // The body is GZIPPED newline-delimited names, not JSON. DecompressionStream
  // is available in Workers and in Node 18+, so this needs no dependency.
  let text: string;
  try {
    const stream = response.body?.pipeThrough(new DecompressionStream("gzip"));
    if (!stream) throw new Error("empty body");
    text = await new Response(stream).text();
  } catch {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "WhoisFreaks returned a body that could not be decompressed",
    );
  }

  // Split on either line ending: the file is generated on an unknown platform
  // and a stray CR would otherwise ride along inside every domain name.
  const names = text.split(NEWLINE);

  // The download is a whole-day file across every TLD -- roughly 240k rows, of
  // which about a third are .com. There is no server-side TLD filter on this
  // endpoint, so narrowing happens here.
  const wanted = new Set(input.tlds.map((tld) => tld.toLowerCase()));
  return names
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .filter((name) => wanted.has(name.slice(name.lastIndexOf(".") + 1)));
}

/** `\r?\n`, built without an escape so it survives any tooling in between. */
const NEWLINE = new RegExp(
  String.fromCharCode(13) + "?" + String.fromCharCode(10),
);

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
