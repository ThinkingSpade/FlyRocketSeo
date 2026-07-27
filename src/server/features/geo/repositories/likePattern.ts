/**
 * Turns a user-typed search string into a SQL LIKE prefix pattern that matches
 * literally, not as a wildcard. `%` and `_` are LIKE metacharacters — an
 * unescaped search for "50% off" or "Fort_Worth" (unlikely but real place-name
 * substrings) would silently widen or narrow the match in ways no one asked
 * for. Escaping them (and the escape character itself, so a literal `\` in
 * input doesn't start swallowing the next character) keeps every typed
 * character literal except the trailing `%` this function appends.
 *
 * Pairs with `LIKE <pattern> ESCAPE '\'` in GeoLocationRepository: SQLite's
 * LIKE has no default escape character (unlike Postgres, which defaults to
 * backslash), so the ESCAPE clause must be explicit for identical behaviour
 * on both dialects.
 *
 * Pure and side-effect free on purpose — see the Task 7 plan's own note that
 * a helper like this should be extracted and unit-tested rather than inlined
 * into the repository, where it would be untestable under this repo's
 * environment: "node" / no-jsdom Vitest setup.
 */
export function buildNamePrefixPattern(query: string): string {
  return `${query.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;
}
