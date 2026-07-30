/**
 * URL normalization and utility functions for the site audit crawler.
 */

/**
 * Normalize a URL for deduplication:
 * - Resolve relative URLs against a base
 * - Strip fragments (#...)
 * - Sort query parameters
 * - Lowercase the hostname
 * - Remove trailing slash (except for root path "/")
 */
export function normalizeUrl(url: string, base?: string): string | null {
  try {
    const parsed = new URL(url, base);

    // Only crawl HTTP(S)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    // Strip fragment
    parsed.hash = "";

    // Sort query params for consistent dedup
    parsed.searchParams.sort();

    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove trailing slash (but keep "/" for root)
    let normalized = parsed.toString();
    if (normalized.endsWith("/") && parsed.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return null;
  }
}

function getEffectivePort(parsed: URL): string {
  if (parsed.port) return parsed.port;
  return parsed.protocol === "https:" ? "443" : "80";
}

/** Strip at most ONE leading `www.`, so equivalence is a canonical comparison
 *  rather than a pair of prefix tests. */
function withoutWwwPrefix(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * Are these the same site, treating apex and `www` as one?
 *
 * Canonicalizes both sides instead of testing `a === "www." + b` in each
 * direction. Those prefix tests gave a `www.` origin THREE accepted hosts: with
 * `b = www.example.com`, the host `www.www.example.com` satisfied
 * `a === "www." + b` — an unrelated hostname that a redirect could reach and the
 * crawler would treat as inside the audit boundary. Now `www.www.example.com`
 * canonicalizes to `www.example.com`, which is not `example.com`, and is
 * correctly rejected.
 */
function areEquivalentHostnames(a: string, b: string): boolean {
  const hostA = a.toLowerCase();
  const hostB = b.toLowerCase();
  if (hostA === hostB) return true;
  return withoutWwwPrefix(hostA) === withoutWwwPrefix(hostB);
}

/**
 * Check if a URL belongs to the same crawl boundary as the crawl target.
 *
 * Rules:
 * - Hostname must match exactly.
 * - Same protocol/port is always allowed.
 * - http -> https upgrade on default ports is allowed.
 */
export function isSameOrigin(url: string, origin: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const parsedOrigin = new URL(origin);

    if (!areEquivalentHostnames(parsedUrl.hostname, parsedOrigin.hostname)) {
      return false;
    }

    const originProtocol = parsedOrigin.protocol.toLowerCase();
    const urlProtocol = parsedUrl.protocol.toLowerCase();

    const originPort = getEffectivePort(parsedOrigin);
    const urlPort = getEffectivePort(parsedUrl);

    if (originProtocol === urlProtocol) {
      return originPort === urlPort;
    }

    const isHttpToHttpsUpgrade =
      originProtocol === "http:" &&
      urlProtocol === "https:" &&
      originPort === "80" &&
      urlPort === "443";

    return isHttpToHttpsUpgrade;
  } catch {
    return false;
  }
}

/**
 * Detect a URL template pattern by replacing path segments that look like
 * dynamic values (IDs, slugs, dates) with `:param`.
 *
 * Examples:
 *   /blog/my-great-post      → /blog/:slug
 *   /products/12345           → /products/:id
 *   /users/john-doe/settings  → /users/:slug/settings
 */
export function detectUrlTemplate(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);

  const normalized = segments.map((segment) => {
    // Pure numeric IDs
    if (/^\d+$/.test(segment)) return ":id";
    // UUIDs
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        segment,
      )
    )
      return ":uuid";
    // Date-like segments (2024-01-15)
    if (/^\d{4}-\d{2}-\d{2}$/.test(segment)) return ":date";
    // Slug-like: contains hyphens and is more than 2 segments (to avoid short
    // path parts like "my-account" that are likely fixed routes)
    if (segment.includes("-") && segment.split("-").length > 2) return ":slug";

    return segment;
  });

  return "/" + normalized.join("/");
}

/**
 * Extract the origin (protocol + hostname + port) from a URL string.
 */
export function getOrigin(url: string): string {
  return new URL(url).origin;
}
