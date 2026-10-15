/**
 * Turns a pasted block of hostnames into the normalized rows the city-site
 * importer writes.
 *
 * Pure and dependency-free on purpose: this is the half of the import that
 * has to be right for 2,000 rows at once, so it must be testable without a
 * database, a Worker binding, or a network call. Everything that needs the
 * seeded `geo_locations` table lives in `matchCity.ts` beside it.
 *
 * DELIBERATELY NOT a hostname validator in the RFC sense. The job is to tell
 * a real host apart from the other things that land in a paste — a header
 * row, a stray "City,State" column, a blank line — and to say WHY a line was
 * dropped, so the preview can show the user rather than silently importing
 * fewer rows than they pasted.
 */

/** One host that parsed cleanly, with everything the matcher needs. */
export type ParsedCityHost = {
  /** Lowercased hostname with scheme, port, path and trailing dot removed. */
  host: string;
  /** The part of `host` in front of the project's own domain, e.g. "austin"
   * from "austin.example.com", or "austin.tx" from "austin.tx.example.com". */
  subdomainLabel: string;
  /**
   * The label read as a city name: separators collapsed to single spaces, so
   * "san-antonio" becomes "san antonio". This is the FIRST interpretation the
   * matcher tries.
   */
  cityQuery: string;
  /**
   * The same label minus its final token, for labels that append a state
   * ("austin-tx", "portland-oregon"). Null when the label is a single token,
   * since there is nothing to split off.
   *
   * Only consulted when `cityQuery` matched no city at all — see matchCity.ts
   * for why that ordering is what keeps "san antonio" from being read as the
   * city "san" in the state "antonio".
   */
  fallbackCityQuery: string | null;
  /** The final token dropped to form `fallbackCityQuery` ("tx", "oregon"). */
  stateHint: string | null;
};

/** A line that produced no host, and the reason, so the UI can show it. */
export type SkippedLine = {
  /** The offending text, trimmed and length-capped for display. */
  value: string;
  reason: "not-a-hostname" | "no-subdomain" | "duplicate";
};

type ParseCityHostsResult = {
  hosts: ParsedCityHost[];
  skipped: SkippedLine[];
  /**
   * How many otherwise-valid hosts were dropped for exceeding `limit`. Never
   * folded into `skipped`: a truncated paste is a "your list is bigger than
   * one import" message, not a bad line, and it must be counted rather than
   * left to be inferred from a row count that looks complete.
   */
  truncatedCount: number;
};

/**
 * A host must have at least two dot-separated labels, each label being
 * alphanumerics/hyphens not starting or ending with a hyphen, and a final
 * label that is alphabetic (so "10.0.0.1" and a bare "Austin,TX" column are
 * both rejected rather than imported as sites).
 */
const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/u;

/** Longest raw value echoed back in a skipped-line report. */
const SKIPPED_VALUE_MAX_LENGTH = 120;

/**
 * Separators that mean "word break" inside a subdomain label. The dot is
 * included so "austin.tx.example.com" reads the same as "austin-tx.example.com"
 * once the project's own domain has been stripped off the end.
 */
const LABEL_SEPARATORS = /[.\-_+]+/gu;

function truncate(value: string): string {
  return value.length > SKIPPED_VALUE_MAX_LENGTH
    ? `${value.slice(0, SKIPPED_VALUE_MAX_LENGTH)}…`
    : value;
}

/**
 * Strips everything around the hostname itself: scheme, credentials, port,
 * path/query/fragment, surrounding quotes or angle brackets, and the trailing
 * root dot. Returns null when nothing hostname-shaped is left.
 */
function toHostname(rawToken: string): string | null {
  let value = rawToken.trim().toLowerCase();
  if (!value) return null;

  value = value.replace(/^["'<(]+/u, "").replace(/["'>)]+$/u, "");
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//u, "");
  // Credentials, then everything from the first path/query/fragment onward.
  value = value.replace(/^[^/@]*@/u, "");
  value = value.split(/[/?#]/u)[0] ?? "";
  // Port.
  value = value.replace(/:\d+$/u, "");
  // Trailing root dot ("austin.example.com.").
  value = value.replace(/\.+$/u, "");

  if (!value || !HOST_PATTERN.test(value)) return null;
  return value;
}

/**
 * Collapses a subdomain label into a space-separated city query.
 * "st-louis" -> "st louis", "SanAntonio" is left alone (there is no reliable
 * way to split a run-together label without a dictionary, and guessing would
 * produce confident nonsense).
 */
export function labelToCityQuery(label: string): string {
  return label
    .replace(LABEL_SEPARATORS, " ")
    .replace(/'/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * The part of `host` that names the city — everything in front of the
 * project's own domain.
 *
 * `baseDomain` is what makes this correct rather than a guess: without it,
 * "austin.tx.example.com" and "austin.example.co.uk" cannot be split without a
 * public-suffix list. When the caller knows the project's domain, the label is
 * simply whatever precedes it. Falls back to the first DNS label only when the
 * host does not sit under the given domain (or none was supplied), which is
 * right for the ordinary "city.example.com" shape and honest about the rest.
 */
function toSubdomainLabel(
  host: string,
  baseDomain: string | null,
): string | null {
  if (baseDomain) {
    const suffix = `.${baseDomain}`;
    if (host === baseDomain) return null;
    if (host.endsWith(suffix)) {
      const label = host.slice(0, -suffix.length);
      return label || null;
    }
  }

  const firstDot = host.indexOf(".");
  if (firstDot <= 0) return null;
  // A bare "example.com" has a first label, but it is the site itself rather
  // than a city under it. Only treat it as a city label when a registrable
  // domain plausibly follows (i.e. at least three labels total).
  if (host.split(".").length < 3) return null;
  return host.slice(0, firstDot);
}

function toParsedHost(
  host: string,
  baseDomain: string | null,
): ParsedCityHost | null {
  const subdomainLabel = toSubdomainLabel(host, baseDomain);
  if (!subdomainLabel) return null;

  const cityQuery = labelToCityQuery(subdomainLabel);
  if (!cityQuery) return null;

  const tokens = cityQuery.split(" ");
  const hasStateCandidate = tokens.length > 1;

  return {
    host,
    subdomainLabel,
    cityQuery,
    fallbackCityQuery: hasStateCandidate ? tokens.slice(0, -1).join(" ") : null,
    stateHint: hasStateCandidate ? (tokens.at(-1) ?? null) : null,
  };
}

/**
 * Normalizes a project's stored domain for use as `baseDomain`: the domain
 * column is free text ("https://example.com/", "www.example.com"), and a
 * mis-stripped suffix would put the whole domain into the city label.
 */
export function toBaseDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const host = toHostname(domain);
  if (!host) return null;
  // A site whose canonical host is "www.example.com" still publishes its city
  // subdomains as "austin.example.com", so the www prefix must not become part
  // of the suffix being stripped.
  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * Parses pasted text into hosts.
 *
 * Accepts the three shapes people actually paste: one host per line, a
 * comma/tab-separated list, and a CSV export whose first column is the host
 * (extra columns are ignored — the city is derived from the host itself, so a
 * "City,State" column carries no information this does not already have).
 * Lines starting with `#` are comments.
 *
 * Duplicates are reported rather than merged silently, because a duplicate in
 * a 2,000-line paste usually means two generated lists were concatenated, and
 * that is worth seeing before the import runs.
 */
export function parseCityHosts(
  input: string,
  options: { baseDomain?: string | null; limit: number },
): ParseCityHostsResult {
  const hosts: ParsedCityHost[] = [];
  const skipped: SkippedLine[] = [];
  const seen = new Set<string>();
  const baseDomain = options.baseDomain ?? null;
  let truncatedCount = 0;

  for (const rawLine of input.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const tokens = line.split(/[\s,;|]+/u).filter(Boolean);
    const lineHosts: string[] = [];
    for (const token of tokens) {
      const host = toHostname(token);
      if (host) lineHosts.push(host);
    }

    if (lineHosts.length === 0) {
      skipped.push({ value: truncate(line), reason: "not-a-hostname" });
      continue;
    }

    for (const host of lineHosts) {
      if (seen.has(host)) {
        skipped.push({ value: host, reason: "duplicate" });
        continue;
      }
      seen.add(host);

      const parsed = toParsedHost(host, baseDomain);
      if (!parsed) {
        skipped.push({ value: host, reason: "no-subdomain" });
        continue;
      }

      if (hosts.length < options.limit) hosts.push(parsed);
      else truncatedCount += 1;
    }
  }

  return { hosts, skipped, truncatedCount };
}
