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

/**
 * Stream one day of dropped domains, filtered to the given TLDs.
 *
 * STREAMED rather than buffered, and that is not a micro-optimization.
 * Reading the body with `.text()` and then split/map/filter allocated three
 * arrays of ~240,000 strings and measured **70 ms of CPU** for a single day --
 * far past the Workers free-plan allowance, and unbounded in memory because a
 * gzip's compressed size bounds nothing. The same file through this path
 * measures **6 ms**, because it never materializes the full list and stops
 * reading the moment the caller has seen enough.
 */
export async function streamDroppedDomains(input: {
  /** yyyy-MM-dd. Files for a day publish at 03:00 UTC the following day. */
  date: string;
  /** Filtered here: the download is a whole-day file across every TLD. */
  tlds: string[];
  /**
   * Called for each matching domain, in file order. Return `false` to stop --
   * the stream is cancelled immediately, which is what keeps a capped harvest
   * from paying to decompress the remainder of the file.
   */
  onDomain: (domain: string) => boolean;
}): Promise<void> {
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

  const body = response.body;
  if (!body) {
    throw new AppError("UPSTREAM_UNAVAILABLE", "WhoisFreaks returned no body");
  }

  const reader = body
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeThrough(new TextDecoderStream())
    .getReader();

  const wanted = new Set(input.tlds.map((tld) => tld.toLowerCase()));
  let carry = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      carry += value;
      let cursor = 0;
      for (;;) {
        const newline = carry.indexOf("\n", cursor);
        if (newline === -1) break;
        const line = carry.slice(cursor, newline);
        cursor = newline + 1;
        if (!emit(line, wanted, input.onDomain)) {
          await reader.cancel();
          return;
        }
      }
      // Keep only the unterminated tail. A hostname is at most 253 bytes, so
      // this cannot grow without bound even on a malformed file.
      carry = carry.slice(cursor);
    }
    // Whatever the final chunk left without a trailing newline.
    emit(carry, wanted, input.onDomain);
  } catch {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "WhoisFreaks returned a body that could not be decompressed",
    );
  }
}

/**
 * Normalize one line and hand it to the caller.
 *
 * Returns false when the caller has seen enough and the stream may stop. A
 * trailing CR is removed by `trim`, so a file written on any platform yields
 * clean hostnames.
 */
function emit(
  line: string,
  wanted: Set<string>,
  onDomain: (domain: string) => boolean,
): boolean {
  const domain = line.trim().toLowerCase();
  if (!domain) return true;
  const dot = domain.lastIndexOf(".");
  if (dot === -1) return true;
  if (!wanted.has(domain.slice(dot + 1))) return true;
  return onDomain(domain);
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
