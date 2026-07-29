import type { ZodType } from "zod";
import { resolveGeo } from "@/shared/geo/resolveGeo";
import { getLanguageCode } from "@/shared/keyword-locations";
import type { GeoNeed, ResolvedGeo, TargetArea } from "@/shared/geo/types";
import type { StoredMetricGeo } from "@/types/schemas/geo";

/**
 * The ResolvedGeo for one metered run -- the single place every Task-6
 * affected tab turns "the header ScopeControl's active area" plus "whatever
 * country this particular run is actually going to" into what `resolveGeo`
 * should be asked.
 *
 * `area` is `TargetAreaScope.area` (`useTargetAreaScope.ts`) -- never null,
 * but a confirmed sub-country area only applies here when its own parent
 * country matches `sessionLocationCode`. Every one of the six tabs keeps a
 * pre-existing, independent country selector predating target areas
 * entirely (SERP Overview, Content Optimizer, Topic Clusters and Keyword
 * Research each still have their own "Location" field; Keyword Trends'
 * worldwide default plays the same role). Applying a Dallas-Ft-Worth metro
 * code while that selector sits on "Canada" would silently blend a metro
 * code into an unrelated country's request -- so a target area whose own
 * country doesn't match the session's is treated as ABSENT for this run,
 * falling back to exactly today's national behaviour for whatever country
 * the tab is actually running against. This is the one reconciliation point
 * between the two controls; every call site funnels through it rather than
 * re-deriving the check inline.
 *
 * This also sidesteps a staleness trap: before any area is confirmed,
 * `TargetAreaScope.area` is `resolveDefaultScopeArea(x)` for whatever `x`
 * was current when the SCOPE hook last resolved it -- not necessarily this
 * run's own `sessionLocationCode`, which the tab's own selector can change
 * independently. Nulling out every `kind: "country"` area unconditionally
 * (rather than trusting its embedded `locationCode`) means a stale default
 * can never leak into the request; `resolveGeo`'s own null-area branch
 * always falls back to the LIVE `sessionLocationCode` passed here instead.
 *
 * Language is always derived from `sessionLocationCode` via the shared
 * country table, matching every one of these tabs' pre-existing behaviour
 * (none of them expose their own language picker) -- `resolveGeo` then
 * overrides it with the area's own country's language when a compatible
 * area applies, exactly as it does for every other caller.
 */
export function resolveRunGeo(
  need: GeoNeed,
  area: TargetArea,
  sessionLocationCode: number,
): ResolvedGeo {
  const applicableArea: TargetArea | null =
    area.kind !== "country" && area.parentCountryCode === sessionLocationCode
      ? area
      : null;
  return resolveGeo(need, applicableArea, {
    locationCode: sessionLocationCode,
    languageCode: getLanguageCode(sessionLocationCode),
  });
}

/**
 * The geo for a stored code KNOWN to already be a country -- e.g. Topic
 * Clusters' `plan.locationCode`, which its own "Location" `<select>` only
 * ever fills from `LOCATION_OPTIONS` (that tab has no metro-capable data
 * source at all, so nothing ever writes a metro/DMA code there). For a tab
 * that CAN go local, do not call this on its bare stored `locationCode` --
 * a metro code is indistinguishable from an unrecognised country code here,
 * which is exactly the bug this function used to be misused for (see the
 * "cannot tell a metro from a country" test below). Restoring one of those
 * runs must instead read the persisted bundle via `parseStoredGeo` and the
 * feature's own `xGeoBundleSchema` -- never reconstruct from one bare code.
 *
 * Deliberately does NOT consult the live scope control: even for a
 * genuinely country-level stored code, re-applying whatever area happens to
 * be active *now* would reproduce the stale-label failure this whole task
 * exists to prevent (a since-changed scope control silently relabelling
 * data that was never fetched under it).
 */
export function resolveStoredGeo(
  need: GeoNeed,
  storedLocationCode: number,
  storedLanguageCode: string,
): ResolvedGeo {
  return resolveGeo(need, null, {
    locationCode: storedLocationCode,
    languageCode: storedLanguageCode,
  });
}

/**
 * Packages one CAPTURED `ResolvedGeo` for persistence in a run's
 * `paramsJson` (Defect 1 fix) -- see `types/schemas/geo.ts`'s own header
 * for why a bare `locationCode` isn't enough and `parentCountryCode` has to
 * ride along explicitly.
 *
 * `parentCountryCode` is always the single `sessionLocationCode` this run's
 * WHOLE bundle was captured against (`resolveRunGeo`'s own 3rd argument):
 * every metric `resolveRunGeo`/`resolveGeo` can produce for one capture
 * resolves to (or falls back to) that same country, whether or not an area
 * applied -- `resolveRunGeo`'s own gating requires `area.parentCountryCode
 * === sessionLocationCode` before an area is even considered, so the two
 * are never different. Callers pass the one session code captured
 * alongside every metric in the same run, not a per-metric re-derivation.
 */
export function toStoredMetricGeo(
  geo: ResolvedGeo,
  parentCountryCode: number,
): StoredMetricGeo {
  return {
    locationCode: geo.locationCode,
    parentCountryCode,
    languageCode: geo.languageCode,
    provider: geo.provider,
    scope: geo.scope,
    label: geo.label,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validates a run's OWN persisted geo bundle against `schema` (one of the
 * per-tab `xGeoBundleSchema`s in `types/schemas/*`), returning null for
 * anything that doesn't match: a run recorded before this bundle existed,
 * a version bump, a single corrupt metric. This is the ONLY way a restore
 * may recover a run's geography -- callers must treat a null return as
 * "geography unknown for this historical run" and render accordingly
 * (typically the same bare/no-suffix label an absent geo already renders
 * as elsewhere), never fall back to guessing via `resolveStoredGeo` or
 * assume it was national.
 *
 * `params` is a run's FULL restored params blob (`useAutoRestoredRun`'s own
 * `params: unknown`) -- e.g. `{ keyword, locationCode, languageCode, geo }`
 * -- not the bundle itself: every `record()` call site nests the bundle
 * under one `geo` key alongside the tab's other canonical inputs (see e.g.
 * TrendsService.ts's own `recordRun`), so this reads THAT key out before
 * validating against `schema`. An `isRecord` check (never `as`) is required
 * here because `params` is untrusted, already-parsed JSON -- a non-object
 * value (or a value with no `geo` key at all, e.g. a run recorded before
 * this bundle existed) degrades to null exactly like a schema mismatch
 * would.
 */
export function parseStoredGeo<T>(
  schema: ZodType<T>,
  params: unknown,
): T | null {
  if (!isRecord(params)) return null;
  const parsed = schema.safeParse(params.geo);
  return parsed.success ? parsed.data : null;
}
