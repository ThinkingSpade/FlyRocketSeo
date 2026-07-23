/**
 * Generates the US state and city location tables consumed by
 * src/shared/keyword-locations.ts and src/server/lib/labs-location.ts.
 *
 * DataForSEO geotarget codes are not derivable from anything else -- a wrong
 * code silently returns SERP/Labs data for the wrong place -- so this script
 * fetches the authoritative table instead of anyone hand-typing rows.
 *
 * Source: DataForSEO's public SERP-locations CDN CSV (no auth required).
 * Columns: location_code,location_name,location_code_parent,country_iso_code,
 * location_type. `location_name` packs the parent chain into one comma-joined
 * string (e.g. "Dallas,Texas,United States") and is CSV-quoted specifically
 * because of those embedded commas -- this MUST be parsed with a quote-aware
 * reader (papaparse), never a naive `split(",")`, or every quoted row's
 * columns silently shift.
 *
 * Usage: npm run locations:generate
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";

// Pinned so a regeneration is reproducible. Bump both constants together if
// DataForSEO publishes a newer table (https://cdn.dataforseo.com/v3/locations/).
const CSV_URL =
  "https://cdn.dataforseo.com/v3/locations/locations_serp_google_2026_07_20.csv";
const CSV_DATE = "2026-07-20";

// Verified against this exact CSV (see .superpowers/sdd/task-8-brief.md): 51
// because the District of Columbia is a targetable "State" row, and 19,654
// with no population column to invent a "top N" cut from. A different count
// means the source file or the parse changed -- stop rather than guess.
const EXPECTED_STATE_COUNT = 51;
const EXPECTED_CITY_COUNT = 19654;

const SCRIPT_DIR = import.meta.dirname;
const STATES_OUTPUT = path.resolve(
  SCRIPT_DIR,
  "../src/shared/us-states.generated.ts",
);
const CITIES_OUTPUT = path.resolve(
  SCRIPT_DIR,
  "../src/shared/us-cities.generated.ts",
);

type CsvRow = {
  location_code: string;
  location_name: string;
  location_code_parent: string;
  country_iso_code: string;
  location_type: string;
};

type StateRow = { code: number; name: string; parentCode: number };
type CityRow = {
  code: number;
  name: string;
  state: string;
  parentCode: number;
};

async function main(): Promise<void> {
  console.log(`Downloading ${CSV_URL} ...`);
  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to download locations CSV: HTTP ${response.status} ${response.statusText}`,
    );
  }
  const csvText = await response.text();
  console.log(`Downloaded ${csvText.length.toLocaleString()} characters.`);

  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors (first 5):", parsed.errors.slice(0, 5));
    throw new Error(`CSV parse failed with ${parsed.errors.length} error(s).`);
  }
  console.log(`Parsed ${parsed.data.length.toLocaleString()} total rows.`);

  const usRows = parsed.data.filter((row) => row.country_iso_code === "US");
  console.log(`Found ${usRows.length.toLocaleString()} US rows.`);
  logLocationTypeBreakdown(usRows);

  const states = usRows
    .filter((row) => row.location_type === "State")
    .map(toStateRow)
    .toSorted((a, b) => a.name.localeCompare(b.name));

  const cities = usRows
    .filter((row) => row.location_type === "City")
    .map(toCityRow)
    .toSorted(
      (a, b) => a.name.localeCompare(b.name) || a.state.localeCompare(b.state),
    );

  console.log(
    `Parsed ${states.length.toLocaleString()} US State rows and ${cities.length.toLocaleString()} US City rows.`,
  );

  // Guard rails: a silently-empty or truncated parse must never reach a
  // commit, and the exact counts below are the ones verified against this
  // CSV -- never hand-edit/invent rows to force a mismatch to pass.
  if (states.length === 0 || cities.length === 0) {
    throw new Error(
      `Parse produced ${states.length} states and ${cities.length} cities -- ` +
        "at least one is empty. Stopping without writing any file.",
    );
  }
  if (states.length !== EXPECTED_STATE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_STATE_COUNT} US State rows, got ${states.length}. ` +
        "Stopping without writing any file.",
    );
  }
  if (cities.length !== EXPECTED_CITY_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_CITY_COUNT} US City rows, got ${cities.length}. ` +
        "Stopping without writing any file.",
    );
  }

  await writeFile(STATES_OUTPUT, renderStatesModule(states), "utf8");
  await writeFile(CITIES_OUTPUT, renderCitiesModule(cities), "utf8");

  console.log(`Wrote ${states.length} states -> ${STATES_OUTPUT}`);
  console.log(`Wrote ${cities.length} cities -> ${CITIES_OUTPUT}`);
}

/** Visibility into which non-{State,City} location_type rows exist for US,
 * so an unexpected shift in the source file shows up in the log instead of
 * silently changing which rows get filtered in. */
function logLocationTypeBreakdown(rows: readonly CsvRow[]): void {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.location_type, (counts.get(row.location_type) ?? 0) + 1);
  }
  const summary = [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}=${count}`)
    .join(", ");
  console.log(`US rows by location_type: ${summary}`);
}

// location_name packs the parent chain into one comma-joined, CSV-quoted
// string ("Texas,United States" / "Dallas,Texas,United States"); the row's
// own bare name is always the first segment.
function bareName(locationName: string): string {
  const [first] = locationName.split(",");
  return (first ?? locationName).trim();
}

function toStateRow(row: CsvRow): StateRow {
  return {
    code: Number(row.location_code),
    name: bareName(row.location_name),
    parentCode: Number(row.location_code_parent),
  };
}

function toCityRow(row: CsvRow): CityRow {
  // Six US cities are named "Dallas" alone; the state segment is kept
  // alongside the city (not just its numeric parentCode) so the picker label
  // can disambiguate them without a second lookup at render time.
  const [cityName, stateName] = row.location_name.split(",");
  return {
    code: Number(row.location_code),
    name: (cityName ?? row.location_name).trim(),
    state: (stateName ?? "").trim(),
    parentCode: Number(row.location_code_parent),
  };
}

function fileHeader(rowCount: number, rowKind: string): string {
  return `/**
 * GENERATED FILE -- DO NOT EDIT BY HAND.
 *
 * Produced by scripts/generate-us-locations.ts from DataForSEO's public SERP
 * locations table:
 *   ${CSV_URL}
 * (CSV dated ${CSV_DATE}.) Regenerate with \`npm run locations:generate\`.
 *
 * DataForSEO geotarget codes are not derivable from anything else -- a wrong
 * one silently returns data for the wrong place -- so these ${rowCount}
 * ${rowKind} rows are fetched from the source table, never hand-typed.
 */
`;
}

function renderStatesModule(states: readonly StateRow[]): string {
  const rows = states
    .map(
      (s) =>
        `  { code: ${s.code}, name: ${JSON.stringify(s.name)}, parentCode: ${s.parentCode} },`,
    )
    .join("\n");
  return `${fileHeader(states.length, "US State")}
// Not exported: nothing outside this file needs the type by name -- callers
// destructure the array elements directly and TypeScript infers the shape.
type UsStateRow = {
  readonly code: number;
  readonly name: string;
  readonly parentCode: number;
};

export const US_STATES: readonly UsStateRow[] = [
${rows}
];
`;
}

function renderCitiesModule(cities: readonly CityRow[]): string {
  const rows = cities
    .map(
      (c) =>
        `  { code: ${c.code}, name: ${JSON.stringify(c.name)}, state: ${JSON.stringify(c.state)}, parentCode: ${c.parentCode} },`,
    )
    .join("\n");
  // One data row per line comfortably clears oxlint's 400-line file cap;
  // disabling it here matches the same disable already on the hand-written
  // country table in keyword-locations.ts.
  return `${fileHeader(cities.length, "US City")}
/* eslint-disable max-lines -- generated location data table, see header above */

// Not exported: nothing outside this file needs the type by name -- callers
// destructure the array elements directly and TypeScript infers the shape.
type UsCityRow = {
  readonly code: number;
  readonly name: string;
  readonly state: string;
  readonly parentCode: number;
};

export const US_CITIES: readonly UsCityRow[] = [
${rows}
];
`;
}

await main();
