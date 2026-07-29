/**
 * One-shot verification spike for the local geo-targeting design
 * (docs/superpowers/specs/2026-07-27-local-geo-targeting-design.md).
 *
 * The local-volume half of that design rests on an assumption nobody has ever
 * executed against the live API: that the Google Ads keyword-data and SERP
 * endpoints accept a DMA/metro `location_code`, while DataForSEO Labs — which
 * the app already uses for keyword difficulty and search intent — rejects it.
 * `getKeywordDataProvider()` being wrong about this would mean the whole
 * routing split (see keyword-locations.ts) is unnecessary. This settles it in
 * four calls against the Dallas-Fort Worth DMA, the plan's own running example:
 *
 *   1. Google Ads search volume   -> expected: data returns (load-bearing —
 *      if this fails, the local-volume half of the design is wrong)
 *   2. SERP organic live advanced -> expected: data returns
 *   3. Labs keyword overview      -> expected: an error (proves the routing
 *      split is necessary rather than cargo-culted)
 *   4. Google Ads locations list  -> reference only: confirms the DFW code
 *      used above is real rather than guessed, and counts DMA/metro rows
 *
 * Safety: calls 1-3 are live and billable. Nothing fires without both the key
 * AND an explicit --confirm — see printCostNotice(). No dollar estimate is
 * printed (see src/shared/analysis-costs.ts: an invented cost figure is worse
 * than none); each call's own DataForSEO-reported `cost` prints as it returns.
 *
 * Usage:
 *   pnpm tsx scripts/verify-geo-support.ts            # missing-key / cost notice only
 *   pnpm tsx scripts/verify-geo-support.ts --confirm  # makes the 4 calls
 */
import process from "node:process";
import { loadLocalEnv, parseArgs } from "./cli-utils";

const API_BASE = "https://api.dataforseo.com";

// The real Dallas-Ft. Worth DMA code, read from the seeded `geo_locations`
// table in production (`type = 'DMA Region'`) rather than assumed.
//
// This was 1_026_339 until it was checked: that code is the CITY of Dallas,
// not the DMA. Both are valid sub-country geotargets that route to Google
// Ads, so nothing failed loudly -- the probe simply verified metro support
// using a city, and every "DFW" label in the test suite named the wrong
// place. Matches resolveGeo.test.ts's DFW fixture.
const DFW_LOCATION_CODE = 200_623;
const PROBE_LANGUAGE_CODE = "en";
// The design doc's own running example (deliotx.com, a DFW coffee/water service).
const PROBE_KEYWORD = "office coffee service";

loadLocalEnv();
const args = parseArgs(process.argv.slice(2));

await main();

async function main(): Promise<void> {
  const apiKey = process.env.DATAFORSEO_API_KEY;
  if (!apiKey) {
    printMissingKeyAndExit();
  }

  printCostNotice();

  if (args.confirm !== "true") {
    console.error(
      "Dry run only — no calls made. Re-run with --confirm to make the 4 calls above.",
    );
    process.exit(1);
  }

  console.log("Running...\n");

  await probeGoogleAdsSearchVolume(apiKey);
  await probeSerpOrganic(apiKey);
  await probeLabsKeywordOverview(apiKey);
  await probeGoogleAdsLocations(apiKey);

  console.log(
    "Done. Re-read each verdict above before building anything on it.",
  );
}

function printMissingKeyAndExit(): never {
  console.error("no DATAFORSEO_API_KEY found — add it to .dev.vars");
  console.error(
    "(this script reads it via scripts/cli-utils.ts's loadLocalEnv(), which checks " +
      ".env.local / .env, not .dev.vars directly — that file is what wrangler reads for " +
      "the deployed Worker. Copy the same value into .env.local to run this script.)",
  );
  process.exit(1);
}

/**
 * Deliberately prints no dollar figure. src/shared/analysis-costs.ts's own rule
 * is that an invented cost is worse than none — this repo has been burned by
 * numbers nobody measured before. What IS knowable up front is the bounded
 * *shape* of the spend, so print that; each call's real `cost` field prints
 * below as it returns, which is the only honest number available before this
 * script has actually been run once with a key.
 */
function printCostNotice(): void {
  console.log(
    "This script makes up to 4 DataForSEO calls against the Dallas-Fort Worth DMA:",
  );
  console.log(
    "  1. POST /v3/keywords_data/google_ads/search_volume/live   (1 keyword)",
  );
  console.log(
    "  2. POST /v3/serp/google/organic/live/advanced              (depth 10, the minimum billable)",
  );
  console.log(
    "  3. POST /v3/dataforseo_labs/google/keyword_overview/live   (1 keyword, expected to fail)",
  );
  console.log(
    "  4. GET  /v3/keywords_data/google_ads/locations              (static reference data, normally free)",
  );
  console.log("");
  console.log(
    "Calls 1-3 are live and billable, each kept to the smallest possible size. This",
  );
  console.log(
    "script prints no dollar estimate (see src/shared/analysis-costs.ts) — each call's",
  );
  console.log(
    "actual DataForSEO-reported cost prints below as it returns. Check",
  );
  console.log("https://dataforseo.com/pricing before proceeding.\n");
}

// ---------------------------------------------------------------------------
// Minimal, dependency-free response parsing. Hand-rolled rather than importing
// the app's dataforseo-client/envelope machinery: this is a standalone spike
// script (see the task brief's "Consumes: nothing"), and type-predicate guards
// keep it honest about `unknown` per this repo's no-unsafe-type-assertion rule.
// ---------------------------------------------------------------------------

type DataforseoTaskShape = {
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: unknown[];
};

type DataforseoResponseShape = {
  status_code?: number;
  status_message?: string;
  tasks?: DataforseoTaskShape[];
};

type LocationRow = {
  location_code?: number;
  location_name?: string;
  location_type?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toTaskShape(value: unknown): DataforseoTaskShape {
  if (!isRecord(value)) return {};
  return {
    status_code: readNumber(value.status_code),
    status_message: readString(value.status_message),
    cost: readNumber(value.cost),
    result: Array.isArray(value.result) ? value.result : undefined,
  };
}

function toResponseShape(value: unknown): DataforseoResponseShape {
  if (!isRecord(value)) return {};
  const tasksRaw = value.tasks;
  return {
    status_code: readNumber(value.status_code),
    status_message: readString(value.status_message),
    tasks: Array.isArray(tasksRaw) ? tasksRaw.map(toTaskShape) : undefined,
  };
}

function toLocationRow(value: unknown): LocationRow {
  if (!isRecord(value)) return {};
  return {
    location_code: readNumber(value.location_code),
    location_name: readString(value.location_name),
    location_type: readString(value.location_type),
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
): Promise<DataforseoResponseShape> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([body]),
  });
  const json: unknown = await response.json();
  return toResponseShape(json);
}

/** Prints status_code/status_message/cost verbatim — never summarised away. */
function printTaskResult(
  response: DataforseoResponseShape,
): DataforseoTaskShape | undefined {
  console.log(
    `   top-level: status_code=${response.status_code ?? "?"} status_message=${JSON.stringify(response.status_message ?? null)}`,
  );
  const task = response.tasks?.[0];
  if (!task) {
    console.log("   task:      (none returned)");
    return undefined;
  }
  console.log(
    `   task:      status_code=${task.status_code ?? "?"} status_message=${JSON.stringify(task.status_message ?? null)} cost=${task.cost ?? "?"} result_rows=${task.result?.length ?? 0}`,
  );
  return task;
}

async function probeGoogleAdsSearchVolume(apiKey: string): Promise<void> {
  console.log("1. Google Ads search volume (load-bearing) ...");
  try {
    const response = await postJson(
      "/v3/keywords_data/google_ads/search_volume/live",
      {
        keywords: [PROBE_KEYWORD],
        location_code: DFW_LOCATION_CODE,
        language_code: PROBE_LANGUAGE_CODE,
      },
      apiKey,
    );
    const task = printTaskResult(response);
    if (task?.status_code === 20000 && (task.result?.length ?? 0) > 0) {
      console.log("   EXPECTED: data returned for the DFW DMA code.\n");
    } else {
      console.log(
        "   UNEXPECTED — this is the load-bearing assumption. If it failed, the local-volume half of the design is wrong: stop and re-plan rather than build on it.\n",
      );
    }
  } catch (error) {
    console.log(`   REQUEST FAILED: ${describeError(error)}\n`);
  }
}

async function probeSerpOrganic(apiKey: string): Promise<void> {
  console.log("2. SERP organic live advanced ...");
  try {
    const response = await postJson(
      "/v3/serp/google/organic/live/advanced",
      {
        keyword: PROBE_KEYWORD,
        location_code: DFW_LOCATION_CODE,
        language_code: PROBE_LANGUAGE_CODE,
        device: "desktop",
        os: "windows",
        depth: 10, // the minimum billable depth (see serp.ts's clampSerpDepth) — cheapest possible probe
      },
      apiKey,
    );
    const task = printTaskResult(response);
    if (task?.status_code === 20000 && (task.result?.length ?? 0) > 0) {
      console.log("   EXPECTED: data returned for the DFW DMA code.\n");
    } else {
      console.log(
        "   UNEXPECTED: the SERP API rejected or emptied the DFW DMA code — re-examine the design's assumption before relying on it.\n",
      );
    }
  } catch (error) {
    console.log(`   REQUEST FAILED: ${describeError(error)}\n`);
  }
}

async function probeLabsKeywordOverview(apiKey: string): Promise<void> {
  console.log("3. Labs keyword overview (expected to fail) ...");
  try {
    const response = await postJson(
      "/v3/dataforseo_labs/google/keyword_overview/live",
      {
        keywords: [PROBE_KEYWORD],
        location_code: DFW_LOCATION_CODE,
        language_code: PROBE_LANGUAGE_CODE,
      },
      apiKey,
    );
    const task = printTaskResult(response);
    if (task?.status_code != null && task.status_code !== 20000) {
      console.log(
        "   EXPECTED: Labs rejected the metro code — confirms the routing split is necessary.\n",
      );
    } else if ((task?.result?.length ?? 0) === 0) {
      console.log(
        "   PARTIALLY UNEXPECTED: Labs returned success with no rows rather than an explicit error. The split is probably still necessary (no usable data either way), but this is not the clean rejection the design assumed — confirm before relying on an error path specifically.\n",
      );
    } else {
      console.log(
        "   UNEXPECTED: Labs returned real data for a sub-country code. This contradicts the country-only assumption this whole design rests on — investigate before building on it.\n",
      );
    }
  } catch (error) {
    console.log(`   REQUEST FAILED: ${describeError(error)}\n`);
  }
}

async function probeGoogleAdsLocations(apiKey: string): Promise<void> {
  console.log("4. Google Ads locations reference list ...");
  const path = "/v3/keywords_data/google_ads/locations";
  try {
    // GET, not POST: this is static reference data (the full location list),
    // not a billable "live" task — same pattern as core.ts's dataforseoGetJson
    // for other appendix/reference endpoints.
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Basic ${apiKey}` },
    });
    const json: unknown = await response.json();
    const parsed = toResponseShape(json);
    const rows = (parsed.tasks?.[0]?.result ?? []).map(toLocationRow);
    const dmaRows = rows.filter((row) => row.location_type === "DMA Region");
    const dfwRow = rows.find((row) => row.location_code === DFW_LOCATION_CODE);
    console.log(
      `   top-level: status_code=${parsed.status_code ?? "?"} status_message=${JSON.stringify(parsed.status_message ?? null)}`,
    );
    console.log(
      `   total locations: ${rows.length}, DMA/metro rows: ${dmaRows.length}`,
    );
    console.log(
      dfwRow
        ? `   DFW row: ${JSON.stringify(dfwRow)}`
        : `   DFW row for code ${DFW_LOCATION_CODE}: NOT FOUND — the code used above may be wrong.`,
    );
    console.log("");
  } catch (error) {
    console.log(`   REQUEST FAILED: ${describeError(error)}\n`);
  }
}
