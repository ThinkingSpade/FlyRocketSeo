import { getDomain } from "tldts";
import { AppError } from "@/server/lib/errors";
import { isValidDomainHost } from "@/types/schemas/domain";

export function toRelativePath(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return null;
  }
}

export function normalizeDomainInput(
  input: string,
  includeSubdomains: boolean,
): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new AppError("VALIDATION_ERROR", "Domain is required");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    throw new AppError("VALIDATION_ERROR", "Domain is invalid");
  }

  if (!host) {
    throw new AppError("VALIDATION_ERROR", "Domain is invalid");
  }

  // Reject fake TLDs / non-registrable hosts (e.g. "example.por") before they
  // reach DataForSEO and come back as an opaque "Invalid Field: 'target'".
  if (!isValidDomainHost(host)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enter a valid domain like example.com",
    );
  }

  if (includeSubdomains) {
    return host;
  }

  return getDomain(host) ?? host;
}

/**
 * Best-effort domain normalization for values that already arrive as bare
 * hostnames from a provider response (e.g. DataForSEO's `domain` field on a
 * competitor/discovery item) rather than as user-typed strings.
 *
 * Deliberately non-throwing and skips `normalizeDomainInput`'s URL parsing
 * and `isValidDomainHost` check: one malformed item in a page of discovery
 * results must not fail the whole request the way a bad user-typed domain
 * should. What it keeps is the same lowercase + strip-leading-"www."
 * transform `normalizeDomainInput(domain, true)` applies to its hostname, so
 * a row discovered as "WWW.Example.com" and an override saved through
 * `ProjectCompetitorRepository` (which normalizes via `normalizeDomainInput`)
 * compare equal with plain string equality.
 *
 * Known gap: unlike `normalizeDomainInput`, this does not run the value
 * through `URL`, so it will not punycode-encode IDN/Unicode hosts (e.g.
 * "café.com" stays as-is instead of becoming "xn--caf-dma.com") and will not
 * strip a port if one is somehow present. DataForSEO's `domain` fields are
 * plain ASCII hostnames with no port in practice, so this has not been a
 * problem; a future caller feeding it anything else should reconsider.
 * (A trailing dot is NOT actually a divergence, despite an earlier version of
 * this comment claiming otherwise: `new URL(...).hostname` does not strip
 * one either, so both functions agree here -- verified directly, not assumed.)
 */
export function normalizeDiscoveredDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}
