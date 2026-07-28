import type { GeoLocationSeedChunkResult } from "@/server/features/geo/services/GeoLocationSeedService";

/**
 * `seedGeoLocationsChunk`'s declared return type promises a real
 * `GeoLocationSeedChunkResult` -- but that promise only holds for a normal
 * application-level response. It says nothing about what a caller actually
 * gets back if the Worker invocation behind it fails in some way that never
 * reaches the handler's own return statement or the shared error middleware
 * (see GeoLocationSeedService.ts's own header for the redesign a production
 * incident here prompted: every chunk call used to re-fetch and re-derive
 * DataForSEO's entire ~95k-row location list, which is very likely to have
 * exceeded the Workers Free plan's CPU ceiling on literally the first call).
 * Without this guard, `GeoLocationSeedSection.tsx`'s loop crashed on
 * `result.writtenSoFar` with a raw, non-actionable TypeError instead of a
 * message a user can act on. The redesign makes that dramatically less
 * likely, but does not make the TypeScript type an actual runtime guarantee
 * -- this stays as defense in depth regardless of why a future response
 * might still not be a real result.
 */
export function isGeoLocationSeedChunkResult(
  value: unknown,
): value is GeoLocationSeedChunkResult {
  return (
    isRecord(value) &&
    typeof value.totalRows === "number" &&
    typeof value.skippedRows === "number" &&
    typeof value.writtenSoFar === "number" &&
    typeof value.done === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * True once a chunk call has stopped making forward progress without
 * reporting `done` -- the other way this loop could spin forever besides an
 * outright malformed result (e.g. a future bug that always reports the same
 * `writtenSoFar` back). Compares against the offset the CALLER already had
 * before this chunk ran, not against anything derived from `result` itself.
 */
export function isStuckWithoutProgress(
  previousOffset: number,
  result: GeoLocationSeedChunkResult,
): boolean {
  return !result.done && result.writtenSoFar <= previousOffset;
}
