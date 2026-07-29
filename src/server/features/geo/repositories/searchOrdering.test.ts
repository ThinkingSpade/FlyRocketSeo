import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { buildTypePriorityOrder } from "./searchOrdering";

function readName(row: Record<string, SQLOutputValue>): string {
  const value = row.name;
  if (typeof value !== "string") {
    throw new Error(`Expected a string "name" column, got ${String(value)}`);
  }
  return value;
}

/**
 * Regression coverage for Bug B: `geo_locations.population` is NEVER
 * populated (see this module's own header), so ordering by it was a
 * complete no-op and the real order was pure alphabetical -- which buries a
 * "dallas" search's own Dallas-Ft. Worth DMA metro and Dallas, TX city under
 * an alphabetically-earlier "Dallas Center, Iowa" and a run of "Dallas
 * County" rows. These rows and this exact ordering complaint are the
 * incident's own evidence.
 *
 * Compiles `buildTypePriorityOrder`'s CASE expression through the real
 * `drizzle-orm` SQLite dialect and runs it against a real, standalone SQLite
 * engine (Node's built-in `node:sqlite`) so this proves the actual ordering
 * a query executes with, not just a plausible-looking SQL string.
 */
describe("buildTypePriorityOrder", () => {
  function seedDatabase(): DatabaseSync {
    const database = new DatabaseSync(":memory:");
    database.exec(
      "CREATE TABLE geo_locations (code INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, population INTEGER)",
    );
    const insert = database.prepare(
      "INSERT INTO geo_locations (code, name, type, population) VALUES (?, ?, ?, NULL)",
    );
    // The real "dallas" prefix's real production result set (see the
    // geo-picker incident's own evidence) -- every row's population is NULL,
    // exactly as in production.
    insert.run(9004, "Dallas Center,Iowa,United States", "City");
    insert.run(9001, "Dallas County,Texas,United States", "County");
    insert.run(9002, "Dallas County,Alabama,United States", "County");
    insert.run(9003, "Dallas County,Iowa,United States", "County");
    insert.run(1026696, "Dallas,Georgia,United States", "City");
    insert.run(1026694, "Dallas,Texas,United States", "City");
    insert.run(
      200623,
      "Dallas-Ft. Worth, TX,Texas,United States",
      "DMA Region",
    );
    return database;
  }

  function orderedNamesForDallasPrefix(database: DatabaseSync): string[] {
    const orderExpr = buildTypePriorityOrder(sql.raw("type"));
    const compiled = new SQLiteSyncDialect().sqlToQuery(orderExpr);
    const rows = database
      .prepare(
        `SELECT name FROM geo_locations WHERE lower(name) LIKE 'dallas%' ORDER BY ${compiled.sql}, name`,
      )
      .all();
    return rows.map(readName);
  }

  it("ranks every City and DMA Region row ahead of every County row", () => {
    const names = orderedNamesForDallasPrefix(seedDatabase());
    const countyIndexes = names
      .map((name, index) => ({ name, index }))
      .filter(({ name }) => name.includes("County"))
      .map(({ index }) => index);
    const nonCountyIndexes = names
      .map((name, index) => ({ name, index }))
      .filter(({ name }) => !name.includes("County"))
      .map(({ index }) => index);

    expect(Math.max(...nonCountyIndexes)).toBeLessThan(
      Math.min(...countyIndexes),
    );
  });

  it("puts the Dallas-Ft. Worth metro and Dallas, TX ahead of Dallas County, Alabama", () => {
    const names = orderedNamesForDallasPrefix(seedDatabase());
    const metroIndex = names.indexOf(
      "Dallas-Ft. Worth, TX,Texas,United States",
    );
    const dallasTxIndex = names.indexOf("Dallas,Texas,United States");
    const dallasCountyAlabamaIndex = names.indexOf(
      "Dallas County,Alabama,United States",
    );

    expect(metroIndex).toBeGreaterThanOrEqual(0);
    expect(dallasTxIndex).toBeGreaterThanOrEqual(0);
    expect(dallasCountyAlabamaIndex).toBeGreaterThanOrEqual(0);
    expect(metroIndex).toBeLessThan(dallasCountyAlabamaIndex);
    expect(dallasTxIndex).toBeLessThan(dallasCountyAlabamaIndex);
  });

  it("breaks ties within the same priority tier alphabetically by name", () => {
    const names = orderedNamesForDallasPrefix(seedDatabase());
    const countyNames = names.filter((name) => name.includes("County"));
    expect(countyNames).toEqual(
      countyNames.toSorted((a, b) => a.localeCompare(b)),
    );
  });
});
