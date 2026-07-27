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

  const withoutScheme = trimmed.replace(URL_SCHEME_PATTERN, "");
  const bareHost = withoutScheme.replace(/\/+$/, "");
  if (!bareHost) return null;

  // A slash surviving the trailing-slash strip means there's a real path
  // segment (e.g. "/blog") left, not just a bare host with redundant
  // trailing slashes to collapse. Appending "/" to a bare host normalizes it
  // to the site root, which is correct and what the branch below still does;
  // appending it to a path instead can 404 on servers that don't redirect a
  // directory-less path to its slash form, so a path is re-schemed and
  // returned as given, with no slash added.
  return bareHost.includes("/")
    ? `https://${withoutScheme}`
    : `https://${bareHost}/`;
}
