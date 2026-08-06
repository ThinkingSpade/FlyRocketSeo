/**
 * Hosts to offer as targets for a project: its apex first, then its INCLUDED
 * subdomains in the order the server ranked them (strongest signal first).
 *
 * Split from the hook that feeds it so the rule is testable in the
 * node-environment Vitest run -- importing the hook would pull in React Query
 * and the server-function module with it.
 */
export function buildProjectHostOptions(
  apex: string | null,
  subdomains: ReadonlyArray<{ host: string; isActive: boolean }>,
): string[] {
  // No apex means no project site to suggest. The stored rows were classified
  // against a domain the project no longer has, so offering them would suggest
  // hosts nothing has confirmed still belong to it.
  if (!apex) return [];

  return [
    apex,
    ...subdomains
      .filter((subdomain) => subdomain.isActive)
      .map((subdomain) => subdomain.host),
  ];
}
