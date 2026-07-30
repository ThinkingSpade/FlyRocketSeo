import { getDatabaseProvider } from "@/db/provider";

/**
 * The D1 text format, matching `sql`(current_timestamp)``: "YYYY-MM-DD HH:MM:SS".
 *
 * Use this only where the D1 format is specifically what is meant. For anything
 * compared against a stored column, use `toStoredTimestamp`.
 */
export function toSqliteTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Format an instant the way the ACTIVE backend stores timestamps.
 *
 * The two schemas store timestamps as `text` in DIFFERENT formats, and the app
 * compares them as strings:
 *
 *   D1        `sql`(current_timestamp)``   ->  "2026-07-22 10:00:00"
 *   Postgres  `isoNow`                     ->  "2026-07-22T10:00:00.000Z"
 *
 * Both sort correctly on their own. Mixing them does not: character comparison
 * puts "T" (0x54) above a space (0x20), so a SQLite-shaped cutoff compared
 * against ISO rows excludes every row on the cutoff date regardless of its time.
 * On Postgres that made rank comparisons silently read an older snapshot and
 * report the wrong delta — a wrong number, not an error.
 *
 * Formatting per provider is deliberately preferred over migrating D1's stored
 * values to ISO. The migration is the tidier end state, but it rewrites live
 * rank-tracking history in production to fix a defect that only ever affected
 * the Postgres path, which nothing currently runs on. Reformatting the
 * comparison is behaviour-preserving on D1 and correct on Postgres.
 *
 * Consequence to respect: any NEW string comparison against a timestamp column
 * must go through here. `schema-parity.test.ts` guards the divergence so it
 * cannot be forgotten silently.
 */
export function toStoredTimestamp(date: Date): string {
  return getDatabaseProvider() === "postgres"
    ? date.toISOString()
    : toSqliteTimestamp(date);
}
