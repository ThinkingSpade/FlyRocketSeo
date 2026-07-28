/**
 * Turns a stored `geo_locations.name` — DataForSEO's full location hierarchy,
 * e.g. `"Anchorage,Alaska,United States"` — into what a picker row should
 * actually show. Verified live against production D1 for City, County,
 * Postal Code and DMA Region; do not extend this to a type never checked
 * that way (see this function's own test file for the confirmed formats).
 *
 * The comma spacing in the stored hierarchy is inconsistent — a DMA Region's
 * own name already embeds ", <ST>" (Nielsen's convention) with a space, but
 * the segments the seed script appends after it (state, country) have none
 * — so segments are trimmed and rejoined with a canonical ", " rather than
 * split on one exact literal separator.
 */

/**
 * How many TRAILING comma-segments to drop for a given `geo_locations.type`.
 *
 * DMA Region is the one type whose own name already embeds the state
 * abbreviation (e.g. "Dallas-Ft. Worth, TX"), so the seeded hierarchy's
 * trailing ",<StateFullName>,<Country>" is fully redundant — drop both.
 * Every other seeded type (City, County, Postal Code, State, ...) keeps its
 * state and drops only the trailing country: the state is what disambiguates
 * two same-named places in different states, and once the country is
 * stripped nothing else in the stored string carries that information.
 */
const HIERARCHY_SEGMENTS_TO_DROP: Readonly<Record<string, number>> = {
  "DMA Region": 2,
};
const DEFAULT_SEGMENTS_TO_DROP = 1;

export function toGeoDisplayName(storedName: string, type: string): string {
  // Empty input: return as-is rather than throw. Covers the unseeded/no-match
  // picker state, where there is no name to trim in the first place.
  if (!storedName) return storedName;

  const segments = storedName.split(",").map((segment) => segment.trim());
  // No commas at all (e.g. a bare "United States" Country row) -- nothing to
  // trim, so the stored name already IS the display name.
  if (segments.length <= 1) return storedName;

  const dropCount =
    HIERARCHY_SEGMENTS_TO_DROP[type] ?? DEFAULT_SEGMENTS_TO_DROP;
  // Would strip every segment (a shorter-than-expected hierarchy) -- keep the
  // raw value rather than collapse it to "".
  if (segments.length <= dropCount) return storedName;

  return segments.slice(0, segments.length - dropCount).join(", ");
}
