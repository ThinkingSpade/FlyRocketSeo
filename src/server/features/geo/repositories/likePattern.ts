import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Turns a user-typed search string into a SQL LIKE prefix pattern that matches
 * literally, not as a wildcard. `%` and `_` are LIKE metacharacters — an
 * unescaped search for "50% off" or "Fort_Worth" (unlikely but real place-name
 * substrings) would silently widen or narrow the match in ways no one asked
 * for. Escaping them (and the escape character itself, so a literal `\` in
 * input doesn't start swallowing the next character) keeps every typed
 * character literal except the trailing `%` this function appends.
 *
 * Pairs with `LIKE <pattern> ESCAPE '\'` in `buildNamePrefixWhere` below:
 * SQLite's LIKE has no default escape character (unlike Postgres, which
 * defaults to backslash), so the ESCAPE clause must be explicit for identical
 * behaviour on both dialects.
 *
 * Pure and side-effect free on purpose — see the Task 7 plan's own note that
 * a helper like this should be extracted and unit-tested rather than inlined
 * into the repository, where it would be untestable under this repo's
 * environment: "node" / no-jsdom Vitest setup.
 */
export function buildNamePrefixPattern(query: string): string {
  return `${query.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;
}

/**
 * The full `lower(<column>) LIKE <prefix-pattern> ESCAPE '\'` condition every
 * prefix search in GeoLocationRepository shares. Kept here, beside
 * `buildNamePrefixPattern` (the other half of this same "safe LIKE prefix
 * search" concern), rather than inlined into GeoLocationRepository.search,
 * SPECIFICALLY so the ESCAPE clause itself can be compiled and executed
 * against a real SQLite engine in a unit test without ever importing
 * GeoLocationRepository's own `@/db` — which reaches a Worker-only `env`
 * read this repo's Vitest (`environment: "node"`) has no binding for. Taking
 * `nameColumn` as a bare `SQLWrapper` parameter (rather than importing the
 * `geoLocations` table here) keeps this function exactly as dependency-free
 * as `buildNamePrefixPattern` above: production passes `geoLocations.name`;
 * this file's own test passes a bare `sql.raw("name")`.
 *
 * Wrapping `name` in `lower(...)` and lowercasing the query in JS before
 * building the pattern, rather than bare `name LIKE pattern`, is required for
 * dialect parity: SQLite's LIKE is ASCII case-insensitive by default, but
 * PostgreSQL's is case-SENSITIVE, so a seeded Postgres row "Dallas" would
 * match `query: "dal"` on D1 and silently return zero rows on Postgres.
 * Matches KeywordResearchRepository.buildSavedKeywordWhere's identical
 * `lower(column) like <pre-lowercased literal>` convention (including that
 * file's own `escape '\\'`), used there for the exact same cross-dialect
 * reason, rather than relying on collation.
 *
 * IMPORTANT — this shipped broken in production (the location picker
 * returned zero results for every query: Dallas, Plano, anything). The SQL
 * text below reads `ESCAPE '\'` to a human, but this is a JS template
 * literal, so `'\\'` (TWO backslashes in the SOURCE) is what actually
 * PRODUCES that single-backslash SQL text at runtime. A source literal of
 * one backslash (`'\'`) parses as an escaped quote character, collapsing the
 * whole sequence into `''` — an EMPTY escape operand. SQLite (and D1, built
 * on it) requires the ESCAPE operand to be exactly one character and throws
 * `SQLITE_ERROR: ESCAPE expression must be a single character` for a
 * zero-length one, which failed this WHERE clause — and therefore the
 * entire search — on every single non-empty query. Confirmed against both a
 * standalone SQLite engine and a real local D1 instance seeded with real
 * production rows (Plano x2, the Dallas-Ft. Worth DMA): see this file's own
 * test, which fails on a one-backslash source and passes on this
 * two-backslash one.
 */
export function buildNamePrefixWhere(
  nameColumn: SQLWrapper,
  rawQuery: string,
): SQL {
  const pattern = buildNamePrefixPattern(rawQuery.toLocaleLowerCase());
  return sql`lower(${nameColumn}) LIKE ${pattern} ESCAPE '\\'`;
}
