import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { buildNamePrefixPattern, buildNamePrefixWhere } from "./likePattern";

// Drizzle's compiled query params are typed as `unknown[]` (they come from a
// generic SQL AST, not this specific engine), but node:sqlite's Statement
// wants its own `SQLInputValue` union -- narrowed here with a real type
// predicate (never `as`) since this repo's oxlint --type-aware run rejects
// unsafe type assertions.
function isSqlInputValue(value: unknown): value is SQLInputValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    ArrayBuffer.isView(value)
  );
}

describe("buildNamePrefixPattern", () => {
  it("appends a trailing wildcard for a plain query", () => {
    expect(buildNamePrefixPattern("dal")).toBe("dal%");
  });

  it("escapes a literal percent sign so it matches literally, not as a wildcard", () => {
    expect(buildNamePrefixPattern("50%")).toBe("50\\%%");
  });

  it("escapes a literal underscore so it matches literally, not as a single-char wildcard", () => {
    expect(buildNamePrefixPattern("fort_worth")).toBe("fort\\_worth%");
  });

  it("escapes a literal backslash so it doesn't swallow the next character", () => {
    expect(buildNamePrefixPattern("a\\b")).toBe("a\\\\b%");
  });

  it("leaves ordinary punctuation and spacing untouched", () => {
    expect(buildNamePrefixPattern("st. louis")).toBe("st. louis%");
  });
});

/**
 * Regression coverage for a shipped production bug: `buildNamePrefixWhere`'s
 * `ESCAPE '\'` clause looked correct to a human reader but was, at the time,
 * written as a JS template literal with only ONE backslash in source. JS
 * collapses that into an EMPTY escape operand (`ESCAPE ''`), which SQLite —
 * and D1, built on it — rejects with `SQLITE_ERROR: ESCAPE expression must
 * be a single character`. That failed GeoLocationRepository.search on every
 * single non-empty query, which is why the location picker returned zero
 * results for Dallas, Plano, or anything at all, despite the seeded data
 * being present and correct.
 *
 * A pure string assertion on the compiled SQL (e.g. `toContain("ESCAPE")`)
 * would NOT have caught this: the buggy and fixed SQL strings differ by a
 * single, easy-to-miss character, and a shape-only check can't tell whether
 * that character makes the statement executable. These tests instead
 * compile the condition through the real `drizzle-orm` SQLite dialect (the
 * same compiler D1 uses) and then RUN the exact resulting SQL text against a
 * real, standalone SQLite engine — Node's own built-in `node:sqlite`, which
 * has no relation to `@/db` or Cloudflare's `env`, so it stays importable
 * under this repo's plain `environment: "node"` Vitest setup — and assert on
 * what comes back. Verified to reproduce the exact same
 * `SQLITE_ERROR: ESCAPE expression must be a single character` against a
 * real local D1 instance (`wrangler d1 execute --local`) seeded with the
 * real production rows used below.
 */
describe("buildNamePrefixWhere", () => {
  function seedDatabase(): DatabaseSync {
    const database = new DatabaseSync(":memory:");
    database.exec(
      "CREATE TABLE geo_locations (code INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL)",
    );
    const insert = database.prepare(
      "INSERT INTO geo_locations (code, name, type) VALUES (?, ?, ?)",
    );
    // Real seeded production rows (see the geo-picker incident's own
    // evidence): both Plano, Illinois and Plano, Texas share the "plano"
    // prefix, and the Dallas-Ft. Worth DMA is a real seeded metro row.
    insert.run(1016775, "Plano,Illinois,United States", "City");
    insert.run(1026695, "Plano,Texas,United States", "City");
    insert.run(
      200623,
      "Dallas-Ft. Worth, TX,Texas,United States",
      "DMA Region",
    );
    // Negative control: shares no prefix with any query below, so it proves
    // this is a genuine prefix filter rather than a broken clause that
    // (harmlessly, coincidentally) got skipped/ignored some other way.
    insert.run(9999, "Reno,Nevada,United States", "City");
    return database;
  }

  // Compiles `buildNamePrefixWhere`'s condition with the real SQLite dialect
  // and runs the exact resulting SQL text against the real engine — no
  // reimplementation of the repository's own query-building on the test's
  // side, so this can only pass if the actual production condition runs.
  function runSearch(database: DatabaseSync, query: string): unknown[] {
    const condition = buildNamePrefixWhere(sql.raw("name"), query);
    const compiled = new SQLiteSyncDialect().sqlToQuery(condition);
    if (!compiled.params.every(isSqlInputValue)) {
      throw new Error(
        `Unexpected non-primitive SQL parameter in ${JSON.stringify(compiled.params)}`,
      );
    }
    return database
      .prepare(
        `SELECT code, name, type FROM geo_locations WHERE ${compiled.sql} ORDER BY name`,
      )
      .all(...compiled.params);
  }

  it("returns the seeded prefix matches instead of throwing", () => {
    const database = seedDatabase();
    expect(runSearch(database, "plano")).toEqual([
      { code: 1016775, name: "Plano,Illinois,United States", type: "City" },
      { code: 1026695, name: "Plano,Texas,United States", type: "City" },
    ]);
  });

  it("finds a seeded metro (DMA Region) by its own name prefix", () => {
    const database = seedDatabase();
    expect(runSearch(database, "dallas-ft")).toEqual([
      {
        code: 200623,
        name: "Dallas-Ft. Worth, TX,Texas,United States",
        type: "DMA Region",
      },
    ]);
  });

  it("is case-insensitive, matching dialect parity with Postgres's lower(column) form", () => {
    const database = seedDatabase();
    expect(runSearch(database, "PLANO")).toHaveLength(2);
  });

  it("does not match a place whose name shares no prefix with the query", () => {
    const database = seedDatabase();
    const rows = runSearch(database, "plano");
    expect(rows).not.toContainEqual(
      expect.objectContaining({ name: "Reno,Nevada,United States" }),
    );
  });
});
