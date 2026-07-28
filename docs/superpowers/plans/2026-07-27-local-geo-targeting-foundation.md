# Local Geo Targeting — Foundation (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the geography foundation — provider routing, a per-metric geography resolver, a D1-backed geotarget table, and a smooth searchable city/metro picker — without changing any tab's current default.

**Architecture:** `getKeywordDataProvider` learns sub-country codes. A new pure `resolveGeo(need, area, country)` answers which geography and provider serve each data need. Geotargets live in D1 (never the Worker startup graph); US DMAs and states are bundled because they are tiny. A free, debounced server search backs an extended `LocationSelect`.

**Tech Stack:** TypeScript, React 19, TanStack Start + Router + Query, Drizzle (D1 + Postgres dual dialect), Vitest, Tailwind + daisyUI, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-07-27-local-geo-targeting-design.md`

## Scope of this plan

The spec splits into two plans. **This is Plan 1: steps 1–3 only** — the spike, the routing/resolver, and the picker. Nothing in this plan changes what any tab queries by default. A user could manually pick a metro when it lands; nothing auto-detects or auto-applies yet. That is Plan 2.

## Global Constraints

- **`pnpm ci:check` runs `prettier --check . && knip && tsc --noEmit && oxlint . --type-aware`.** All four must pass.
- **Dual-dialect schema.** Every new table MUST be added to BOTH `src/db/app.schema.ts` (SQLite/D1) and `src/db/pg/app.schema.ts` (Postgres). `src/db/schema-parity.test.ts` fails loudly otherwise. Generate migrations with `pnpm db:generate` (runs both dialects); apply locally with `pnpm db:migrate:local`.
- **Nothing may enter the Worker startup graph unnecessarily.** `src/shared/` is imported by server code. A large geotarget table there would inflate the startup chunk — the same class of problem that previously caused multi-second cold starts and required a 33-file lazy-loading refactor. Bulk geo data goes in D1; only the tiny bundled DMA/state tables are allowed in a client-only module.
- **Vitest collects only `src/**/\*.test.ts`** — `.ts`, not `.tsx`— and runs`environment: "node"`. Pure logic gets tests; React components get none. Do not add jsdom.
- **A module importing `serverFunctions` or anything reaching `cloudflare:workers` cannot load under `environment: "node"`.** Keep pure modules pure or their tests will not run.
- **oxlint `no-unsafe-type-assertion` is enabled.** Never `as`-narrow an `unknown`; use a type-predicate guard (`isRecord` in `handoffStore.ts` is the house pattern). `max-lines-per-function` is 320 and applies to `describe` blocks; several files also sit near a 400-line file cap — extract rather than disable.
- **knip fails on unused exports.** Test-only exports are tolerated (precedent: `quickWinClicks` in `opportunityModel.ts`).
- **No automatic metered spend.** `searchGeoLocations` reads D1 only. Nothing in this plan may call a paid provider at render time.
- Comments explain WHY, not what. Package manager is **pnpm**; run from the repo root.

---

## The blocker you cannot resolve yourself

Task 1 is a live-API spike. **There is no DataForSEO key in this environment** — it is a deployed Worker secret. A subagent must NOT attempt to obtain, guess, or enter one.

Write the script, verify it fails cleanly and informatively without a key, and stop. Running it is an operator step for the repo owner.

Everything after Task 1 is built regardless of the spike's outcome: the resolver's _structure_ is correct either way; only one routing rule inside it depends on the answer.

---

## File Structure

**Created:**

| File                                                            | Responsibility                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `scripts/verify-geo-support.ts`                                 | One-shot spike: does Google Ads / SERP / Labs accept a DMA code? |
| `src/shared/geo/types.ts`                                       | `GeoNeed`, `ResolvedGeo`, `TargetArea`, `GeoScope`               |
| `src/shared/geo/resolveGeo.ts`                                  | Pure: `(need, area, country) => ResolvedGeo`                     |
| `src/shared/geo/resolveGeo.test.ts`                             |                                                                  |
| `src/client/features/geo/usDmas.ts`                             | Bundled ~210 US DMAs (client-only)                               |
| `src/client/features/geo/usStates.ts`                           | Bundled 50 states (client-only)                                  |
| `src/client/features/geo/GeoLocationSelect.tsx`                 | Grouped, searchable picker                                       |
| `src/server/features/geo/repositories/GeoLocationRepository.ts` | D1 prefix search                                                 |
| `src/serverFunctions/geo.ts`                                    | `searchGeoLocations` (free, D1 only)                             |
| `scripts/seed-geo-locations.ts`                                 | Seeds `geo_locations` from DataForSEO                            |

**Modified:**

| File                              | Change                                             |
| --------------------------------- | -------------------------------------------------- |
| `src/shared/keyword-locations.ts` | `getKeywordDataProvider` handles sub-country codes |
| `src/db/app.schema.ts`            | `geoLocations` table (SQLite)                      |
| `src/db/pg/app.schema.ts`         | `geoLocations` table (Postgres) — parity required  |

---

## Task 1: The verification spike (script only — do not run)

**Files:**

- Create: `scripts/verify-geo-support.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: an operator-runnable script. No exports consumed by app code.

- [ ] **Step 1: Read how existing scripts authenticate**

Run: `ls scripts/ && grep -rn "DATAFORSEO_API_KEY" scripts/ | head -5`

Match whatever pattern you find for reading the key. Do NOT invent a new credential path, and do NOT hardcode or prompt for a key.

- [ ] **Step 2: Write the script**

It must probe three things against the Dallas–Fort Worth DMA and print a clear verdict for each:

1. `POST /v3/keywords_data/google_ads/search_volume/live` with `location_code` set to the DFW DMA code and one keyword. **Expected: data returns.** This is the load-bearing assumption of the whole design.
2. `POST /v3/serp/google/organic/live/advanced` with the same `location_code`. **Expected: data returns.**
3. `POST /v3/dataforseo_labs/google/keyword_overview/live` with the same `location_code`. **Expected: an error.** This proves the routing split is necessary rather than cargo-culted.

Also fetch `POST /v3/keywords_data/google_ads/locations` and print how many entries have a DMA/metro `location_type`, plus the DFW row, so the operator can confirm the code used is real rather than guessed.

Requirements:

- If the key is absent, print exactly what to do (add `DATAFORSEO_API_KEY` to `.dev.vars`) and exit non-zero. It must NOT throw an unhandled error.
- Print the estimated cost before making any call, and require an explicit `--confirm` flag to proceed. A spike that spends silently is exactly what this codebase forbids.
- Print each response's `status_code`/`status_message` verbatim; do not summarise away the failure reason.

- [ ] **Step 3: Verify it fails cleanly with no key**

Run: `pnpm tsx scripts/verify-geo-support.ts`
Expected: a clear "no DATAFORSEO_API_KEY found — add it to .dev.vars" message and a non-zero exit. No stack trace.

- [ ] **Step 4: Verify the confirm gate**

Run: `pnpm tsx scripts/verify-geo-support.ts --confirm`
Expected: still the missing-key message (no key present), NOT an attempted call.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-geo-support.ts
git commit -m "Add the geo-support verification spike

The local-volume half of the geo design rests on Google Ads endpoints
accepting a DMA code, which is documented but unexecuted. This settles it
in three calls. Gated behind --confirm and an explicit cost print, because
a spike that spends silently is the thing this codebase forbids."
```

---

## Task 2: Route sub-country codes to Google Ads

**Files:**

- Modify: `src/shared/keyword-locations.ts:736-743`
- Test: `src/shared/keyword-locations.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `getKeywordDataProvider(locationCode)` returns `"google_ads"` for any code that is not a known country, instead of falling through to `"labs"`.

- [ ] **Step 1: Read the current function and its test**

Run: `sed -n '730,745p' src/shared/keyword-locations.ts && sed -n '1,40p' src/shared/keyword-locations.test.ts`

Current behaviour:

```ts
export function getKeywordDataProvider(
  locationCode: number,
): KeywordDataProvider {
  return LOCATION_CODES.has(locationCode) &&
    !LABS_LOCATION_CODES.has(locationCode)
    ? "google_ads"
    : "labs";
}
```

An unknown code (which is what every metro code is, since `LOCATION_CODES` holds only countries) returns `"labs"`, and Labs rejects it.

- [ ] **Step 2: Write the failing test**

Add to `src/shared/keyword-locations.test.ts`, matching the file's existing style:

```ts
describe("getKeywordDataProvider", () => {
  it("routes a Labs-supported country to Labs", () => {
    expect(getKeywordDataProvider(2840)).toBe("labs");
  });

  it("routes a Google-Ads-only country to Google Ads", () => {
    // Iceland: outside Labs' 94-country coverage.
    expect(getKeywordDataProvider(2352)).toBe("google_ads");
  });

  it("routes a sub-country code to Google Ads", () => {
    // Metro/city geotargets are not in LOCATION_CODES at all. Labs is
    // country-only and rejects them, so they must go to Google Ads rather
    // than falling through to a provider that cannot serve them.
    expect(getKeywordDataProvider(1026339)).toBe("google_ads");
  });
});
```

Confirm 2352 really is a `googleAdsOnly` row before relying on it; if not, pick one that is and say which.

- [ ] **Step 3: Run the test and watch the third case fail**

Run: `pnpm vitest run src/shared/keyword-locations.test.ts`
Expected: the sub-country case FAILS with `expected 'labs' to be 'google_ads'`. The first two pass.

- [ ] **Step 4: Implement**

```ts
/**
 * Country codes are 4-digit (2xxx); every geotarget below country level has a
 * larger code. Labs is country-only and rejects sub-country codes outright, so
 * anything unrecognised here must go to Google Ads, whose geotarget coverage
 * includes metros and cities. Falling through to Labs — the previous
 * behaviour — turned a supported metro into a hard API error.
 */
export function getKeywordDataProvider(
  locationCode: number,
): KeywordDataProvider {
  if (LABS_LOCATION_CODES.has(locationCode)) return "labs";
  return "google_ads";
}
```

Check this against the existing tests: a known Labs country still returns `labs`; a `googleAdsOnly` country still returns `google_ads`; an unknown code now returns `google_ads` rather than `labs`.

**If any pre-existing test breaks, STOP and report it** — the old fall-through may be load-bearing somewhere, and that is worth knowing before overriding it.

- [ ] **Step 5: Run the full suite**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/keyword-locations.ts src/shared/keyword-locations.test.ts
git commit -m "Route sub-country location codes to Google Ads

Labs is country-only and rejects metro codes. The old fall-through sent
every unrecognised code to Labs, so passing a real, supported metro
geotarget produced a hard API error instead of data."
```

---

## Task 3: The geography resolver

**Files:**

- Create: `src/shared/geo/types.ts`, `src/shared/geo/resolveGeo.ts`
- Test: `src/shared/geo/resolveGeo.test.ts`

**Interfaces:**

- Consumes: `getKeywordDataProvider` from `@/shared/keyword-locations`.
- Produces: `resolveGeo(need: GeoNeed, area: TargetArea | null, country: { locationCode: number; languageCode: string }): ResolvedGeo`, plus the types below.

- [ ] **Step 1: Write the types**

`src/shared/geo/types.ts`:

```ts
/**
 * Which geography answers which question.
 *
 * Splitting by NEED rather than by project is the whole point: a local
 * business wants local search volume, but keyword difficulty only exists at
 * country level, so one project legitimately reads from two geographies at
 * once. Every resolved value therefore carries the scope it describes, so the
 * UI can label it rather than implying one number means both.
 */

export type GeoNeed =
  | "keyword-volume"
  | "keyword-difficulty"
  | "search-intent"
  | "serp"
  | "rank-tracking"
  | "domain-analytics"
  | "local-pack";

export type GeoScope = "local" | "national";

export type TargetAreaKind = "metro" | "city" | "region" | "country";

export type TargetArea = {
  kind: TargetAreaKind;
  locationCode: number;
  label: string;
  parentCountryCode: number;
};

export type ResolvedGeo = {
  locationCode: number;
  languageCode: string;
  provider: "labs" | "google_ads" | "serp" | "business";
  /** What the resulting figure actually describes. Drives the UI label. */
  scope: GeoScope;
  /** Human label for that geography, e.g. "Dallas-Fort Worth TX". */
  label: string;
};
```

- [ ] **Step 2: Write the failing tests**

`src/shared/geo/resolveGeo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveGeo } from "./resolveGeo";
import type { TargetArea } from "./types";

const US = { locationCode: 2840, languageCode: "en" };

const DFW: TargetArea = {
  kind: "metro",
  locationCode: 1026339,
  label: "Dallas-Fort Worth TX",
  parentCountryCode: 2840,
};

describe("resolveGeo without a target area", () => {
  it("keeps keyword volume national", () => {
    const geo = resolveGeo("keyword-volume", null, US);
    expect(geo.locationCode).toBe(2840);
    expect(geo.scope).toBe("national");
  });

  it("keeps the SERP national", () => {
    const geo = resolveGeo("serp", null, US);
    expect(geo).toMatchObject({
      locationCode: 2840,
      provider: "serp",
      scope: "national",
    });
  });
});

describe("resolveGeo with a metro target area", () => {
  it("takes keyword volume local, via Google Ads", () => {
    expect(resolveGeo("keyword-volume", DFW, US)).toMatchObject({
      locationCode: 1026339,
      provider: "google_ads",
      scope: "local",
      label: "Dallas-Fort Worth TX",
    });
  });

  it("keeps difficulty national, because Labs is country-only", () => {
    expect(resolveGeo("keyword-difficulty", DFW, US)).toMatchObject({
      locationCode: 2840,
      provider: "labs",
      scope: "national",
    });
  });

  it("keeps intent national for the same reason", () => {
    expect(resolveGeo("search-intent", DFW, US).scope).toBe("national");
  });

  it("takes the SERP local", () => {
    expect(resolveGeo("serp", DFW, US)).toMatchObject({
      locationCode: 1026339,
      provider: "serp",
      scope: "local",
    });
  });

  it("takes rank tracking local", () => {
    expect(resolveGeo("rank-tracking", DFW, US).locationCode).toBe(1026339);
  });

  it("keeps domain analytics national", () => {
    expect(resolveGeo("domain-analytics", DFW, US)).toMatchObject({
      locationCode: 2840,
      provider: "labs",
      scope: "national",
    });
  });

  it("routes the local pack to the business provider", () => {
    expect(resolveGeo("local-pack", DFW, US).provider).toBe("business");
  });

  it("resolves the parent country, not the session country, for national needs", () => {
    const ukMetro: TargetArea = {
      kind: "metro",
      locationCode: 9041110,
      label: "Greater London",
      parentCountryCode: 2826,
    };
    expect(resolveGeo("keyword-difficulty", ukMetro, US).locationCode).toBe(
      2826,
    );
  });
});

describe("resolveGeo with a country target area", () => {
  it("treats an explicit country area as national, not local", () => {
    const area: TargetArea = {
      kind: "country",
      locationCode: 2840,
      label: "United States",
      parentCountryCode: 2840,
    };
    expect(resolveGeo("keyword-volume", area, US).scope).toBe("national");
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `pnpm vitest run src/shared/geo/resolveGeo.test.ts`
Expected: FAIL, cannot find module `./resolveGeo`.

- [ ] **Step 4: Implement**

```ts
import { getKeywordDataProvider } from "@/shared/keyword-locations";
import type { GeoNeed, ResolvedGeo, TargetArea } from "./types";

/**
 * Decides which geography and provider answer a given question.
 *
 * Pure and total. The asymmetry it encodes is not arbitrary: DataForSEO Labs
 * carries keyword difficulty and search intent but only at country level,
 * while the Google Ads endpoints cover metros but carry neither. So a local
 * project reads volume locally and difficulty nationally, and every result
 * says which it is.
 */

/** Needs that only exist at country level, whatever the target area. */
const NATIONAL_ONLY: ReadonlySet<GeoNeed> = new Set([
  "keyword-difficulty",
  "search-intent",
  "domain-analytics",
]);

function isSubCountry(area: TargetArea): boolean {
  return area.kind !== "country";
}

export function resolveGeo(
  need: GeoNeed,
  area: TargetArea | null,
  country: { locationCode: number; languageCode: string },
): ResolvedGeo {
  const national = (label: string, provider: ResolvedGeo["provider"]) => ({
    locationCode: area?.parentCountryCode ?? country.locationCode,
    languageCode: country.languageCode,
    provider,
    scope: "national" as const,
    label,
  });

  if (need === "local-pack") {
    return {
      locationCode: area?.locationCode ?? country.locationCode,
      languageCode: country.languageCode,
      provider: "business",
      scope: area && isSubCountry(area) ? "local" : "national",
      label: area?.label ?? "United States",
    };
  }

  if (NATIONAL_ONLY.has(need)) {
    return national(
      area && isSubCountry(area) ? countryLabel(area) : (area?.label ?? ""),
      "labs",
    );
  }

  const isSerpNeed = need === "serp" || need === "rank-tracking";

  if (area && isSubCountry(area)) {
    return {
      locationCode: area.locationCode,
      languageCode: country.languageCode,
      provider: isSerpNeed ? "serp" : "google_ads",
      scope: "local",
      label: area.label,
    };
  }

  const locationCode = area?.locationCode ?? country.locationCode;
  return {
    locationCode,
    languageCode: country.languageCode,
    provider: isSerpNeed ? "serp" : getKeywordDataProvider(locationCode),
    scope: "national",
    label: area?.label ?? "",
  };
}
```

`countryLabel` is not defined above on purpose — the national label needs a country NAME, which lives in `LOCATION_OPTIONS`. Implement it as a small local helper that looks up `parentCountryCode` in `LOCATION_OPTIONS` and returns its `label`, falling back to an empty string. Do not invent a second country table.

- [ ] **Step 5: Run and iterate to green**

Run: `pnpm vitest run src/shared/geo/resolveGeo.test.ts`
Expected: PASS, 11 tests (2 without an area, 8 with a metro, 1 with a country area).

Do NOT weaken a test to reach green. If a test looks wrong, stop and report which and why.

- [ ] **Step 6: Verify**

Run: `pnpm tsc --noEmit && pnpm exec oxlint . --type-aware`
Expected: clean. knip will flag the new exports until Task 7 imports them — expected at this boundary, do not delete them.

- [ ] **Step 7: Commit**

```bash
git add src/shared/geo
git commit -m "Add the geography resolver

Splits by data need rather than by project, because Labs carries keyword
difficulty only at country level while Google Ads covers metros and carries
none. A local project therefore reads volume locally and difficulty
nationally, and each result records which it is so the UI can say so."
```

---

## Task 4: The `geo_locations` table

**Files:**

- Modify: `src/db/app.schema.ts`, `src/db/pg/app.schema.ts`
- Generated: a migration under `drizzle/`

**Interfaces:**

- Produces: `geoLocations` table exported from both schemas.

- [ ] **Step 1: Read an existing table in BOTH dialects**

Run: `grep -n "analysisRuns" -A25 src/db/app.schema.ts | head -30 && grep -n "analysisRuns" -A25 src/db/pg/app.schema.ts | head -30`

Match the conventions you find exactly — column naming, index naming, timestamp defaults.

- [ ] **Step 2: Add the table to the SQLite schema**

```ts
// Google geotargets (countries, regions, metros/DMAs, cities). Lives in D1
// rather than a bundled table because the full list is large and `src/shared`
// is in the Worker's startup graph — the same graph whose size previously
// caused multi-second cold starts. Seeded by scripts/seed-geo-locations.ts.
export const geoLocations = sqliteTable(
  "geo_locations",
  {
    code: integer("code").primaryKey(),
    name: text("name").notNull(),
    /** DataForSEO location_type, e.g. "Country", "DMA Region", "City". */
    type: text("type").notNull(),
    /** Two-letter state/region code where applicable, e.g. "TX". */
    stateCode: text("state_code"),
    /** The metro this place rolls up into, when it has one. */
    parentMetroCode: integer("parent_metro_code"),
    countryCode: integer("country_code").notNull(),
    /** Drives search ranking so "dal" surfaces Dallas before Dalton. */
    population: integer("population"),
  },
  (table) => [
    // The picker searches by name prefix within a country, ordered by
    // population. Without this the search is a full scan on every keystroke.
    index("geo_locations_country_name_idx").on(table.countryCode, table.name),
    index("geo_locations_type_idx").on(table.type),
  ],
);
```

- [ ] **Step 3: Mirror it in the Postgres schema**

Add the structurally identical table to `src/db/pg/app.schema.ts` using that file's pg-core imports. Same table name, same column names, same indexes.

- [ ] **Step 4: Run the parity test**

Run: `pnpm vitest run src/db/schema-parity.test.ts`
Expected: PASS. If it fails, the two dialects have drifted — fix the mismatch it names rather than editing the test.

- [ ] **Step 5: Generate and apply the migration**

```bash
pnpm db:generate
pnpm db:migrate:local
```

Expected: a new file under `drizzle/`, applied without error. Commit the generated migration.

- [ ] **Step 6: Commit**

```bash
git add src/db drizzle
git commit -m "Add the geo_locations table in both dialects

Geotargets live in D1 rather than a bundled module: the full list is large
and src/shared is in the Worker startup graph, which is exactly where this
codebase has been burned by size before."
```

---

## Task 5: Bundled DMA and state tables

**Files:**

- Create: `src/client/features/geo/usDmas.ts`, `src/client/features/geo/usStates.ts`

**Interfaces:**

- Produces: `US_DMAS` and `US_STATES`, each `ReadonlyArray<{ code: number; name: string; stateCode?: string }>`.

- [ ] **Step 1: Source the data honestly**

These are client-only modules — they must NOT be imported from `src/shared` or any server module, or they re-enter the Worker startup graph.

**Do not invent geotarget codes.** If you cannot obtain the real DMA codes without an API key, create the module with the correct SHAPE, a documented handful of verified entries, and a comment stating that the full set is populated by the seed script's output. Then say so in your report. A file full of plausible-looking wrong codes is worse than an obviously incomplete one, because it fails silently at query time.

- [ ] **Step 2: Verify the bundle boundary**

Run: `grep -rn "features/geo/usDmas\|features/geo/usStates" src/shared src/server || echo "clean: no server import"`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/client/features/geo
git commit -m "Add bundled US DMA and state tables

Client-only by design: small enough to bundle, and bundling keeps metro and
state selection instant, but they must never be imported from src/shared or
src/server or they land in the Worker startup graph."
```

---

## Task 6: The seed script

**Files:**

- Create: `scripts/seed-geo-locations.ts`

- [ ] **Step 1: Read an existing script for conventions**

Run: `ls scripts/ && sed -n '1,40p' scripts/$(ls scripts | head -1)`

- [ ] **Step 2: Write it**

It fetches `POST /v3/keywords_data/google_ads/locations`, maps rows to the `geo_locations` shape, and upserts into D1 via wrangler.

Requirements:

- Missing key ⇒ clear message naming `.dev.vars`, non-zero exit, no stack trace.
- Idempotent: re-running replaces rather than duplicating (the primary key is `code`).
- Print counts by `type` at the end, so the operator can see what landed.
- Document it as a setup step in the script's own header comment, including that self-hosted deployments must run it.

- [ ] **Step 3: Verify it fails cleanly with no key**

Run: `pnpm tsx scripts/seed-geo-locations.ts`
Expected: clear missing-key message, non-zero exit.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-geo-locations.ts
git commit -m "Add the geo_locations seed script"
```

---

## Task 7: `searchGeoLocations`

**Files:**

- Create: `src/server/features/geo/repositories/GeoLocationRepository.ts`, `src/serverFunctions/geo.ts`

**Interfaces:**

- Produces: `searchGeoLocations({ data: { query, countryCode?, limit? } })` returning `Array<{ code, name, type, stateCode, countryCode }>`.

- [ ] **Step 1: Read a sibling server function and repository for conventions**

Run: `sed -n '1,40p' src/serverFunctions/analysisRuns.ts && ls src/server/features/*/repositories | head`

- [ ] **Step 2: Write the repository**

A prefix search: `WHERE name LIKE ? || '%'`, optionally filtered by `countryCode`, ordered by `population DESC NULLS LAST` then `name`, with `LIMIT`. Use Drizzle, not raw SQL, matching sibling repositories.

- [ ] **Step 3: Write the server function**

```ts
const searchGeoLocationsSchema = z.object({
  query: z.string().trim().min(1).max(64),
  countryCode: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
```

Use `requireProjectContext` if a sibling free lookup does; otherwise `requireAuthenticatedContext`. Read a sibling and match.

**This function reads D1 only. It must not import or reach any metered provider.** Browsing the picker cannot spend.

- [ ] **Step 4: Verify**

Run: `pnpm tsc --noEmit && pnpm exec oxlint . --type-aware`

Then prove the no-spend property:
Run: `grep -rn "dataforseo\|serverFunctions/keywords\|serverFunctions/domain" src/server/features/geo src/serverFunctions/geo.ts || echo "clean: no metered reach"`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/server/features/geo src/serverFunctions/geo.ts
git commit -m "Add the free geo-location search

Reads D1 only, so browsing the picker cannot trigger a metered call."
```

---

## Task 8: The picker

**Files:**

- Create: `src/client/features/geo/GeoLocationSelect.tsx`

**Interfaces:**

- Consumes: `US_DMAS`, `US_STATES`, `searchGeoLocations`, `LOCATION_OPTIONS`.
- Produces: `<GeoLocationSelect value onChange className? />` where `value` is a `TargetArea | null`.

- [ ] **Step 1: Read the component you are extending**

Run: `cat src/client/components/LocationSelect.tsx`

It already has open/close, a query input, filtering, and `activeIndex` keyboard navigation. Reuse that structure and its class names; do not invent a second interaction model.

- [ ] **Step 2: Build it**

Behaviour required by the spec:

- Results grouped **Metros → Cities → States → Countries**, each with a muted group heading.
- Metros and states come from the bundled tables and filter **synchronously** — no network, no spinner.
- Cities come from `searchGeoLocations`, debounced 150ms, `LIMIT 20`.
- Rows disambiguate: `Springfield, IL` vs `Springfield, MO`. A bare US city name is ambiguous more often than not.
- The typed query stays put while results reload — never clear the input or the selection on a response.
- Keyboard: ↑/↓ across the flattened result list, Enter selects, Esc closes. Preserve the existing behaviour.
- ICON RULE: bare muted lucide glyphs, no chip/pill backgrounds.

Use `useQuery` for the city search, keyed on the debounced query, with `enabled` false for an empty query so an open-and-close costs nothing.

- [ ] **Step 3: Verify**

Run: `pnpm ci:check`
Expected: all four clean. React components get no unit test here — there is no React test infrastructure and adding it is out of scope.

- [ ] **Step 4: Add it to the visual spec**

`e2e/insights-visual.spec.ts` already drives a real browser across viewports. Add a case that opens the picker and asserts it renders and is keyboard-navigable. Run:
`PLAYWRIGHT_CHANNEL=chromium pnpm exec playwright test e2e/insights-visual.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add src/client/features/geo e2e
git commit -m "Add the grouped geo location picker

Metros and states resolve from bundled tables so the common case never
touches the network; cities come from a debounced, free D1 search, which
covers every US place without shipping a large table to either bundle."
```

---

## Final verification

- [ ] **Full check**

Run: `pnpm ci:check && pnpm vitest run --no-file-parallelism`
Expected: four clean checks; test total up by the new resolver and routing tests.

Note: plain `pnpm vitest run` flakes under this machine's 24-thread pool (pre-existing GscService/RankTrackingService timeouts, unrelated to this work). Use `--no-file-parallelism`.

- [ ] **Confirm nothing changed by default**

Run: `git diff main --stat -- src/client/features/serp src/client/features/keywords src/client/features/content`
Expected: **no changes.** This plan must not alter any tab's behaviour. If a tab file changed, something leaked out of scope.

- [ ] **Confirm the no-spend boundary**

Run: `grep -rn "serverFunctions/" src/client/features/geo/`
Expected: only `serverFunctions/geo`.

- [ ] **Hand the spike back to the operator**

Report that `scripts/verify-geo-support.ts` is ready and needs a `DATAFORSEO_API_KEY` in `.dev.vars` plus `--confirm` to run, and that Plan 2 (detection, confirmation banner, tab wiring) should not start until its first probe passes.
