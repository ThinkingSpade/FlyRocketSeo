const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

/**
 * The project's `domain` column is meant to hold a bare host, but a few rows
 * predate that convention and still carry a scheme. `AnalyzeProjectCard`'s
 * one-click "analyze everything" flow builds `https://${domain}/` assuming a
 * bare host -- doing that blindly here would double the scheme on those rows
 * (`https://https://...`). Stripping any existing scheme and trailing
 * slash(es) first, then reapplying exactly one of each, lands every stored
 * shape on the same normalized result instead.
 *
 * Pulled into its own pure module (rather than living inline in
 * `useLaunchController.ts`) so it can be unit-tested from a node-environment
 * Vitest run: the controller transitively imports `src/serverFunctions/audit.ts`,
 * which imports `cloudflare:workers` and cannot be loaded outside a Workers
 * runtime.
 */
export function buildProjectStartUrl(domain: string | null): string | null {
  if (!domain) return null;
  const trimmed = domain.trim();
  if (!trimmed) return null;
  const host = trimmed.replace(URL_SCHEME_PATTERN, "").replace(/\/+$/, "");
  if (!host) return null;
  return `https://${host}/`;
}
