/**
 * Decides which seeded `geo_locations` city (if any) a parsed subdomain names.
 *
 * Pure: the caller does the D1 read and hands the candidate rows in, so the
 * whole decision — including the two cases that must NOT resolve to a code —
 * is testable without a database.
 *
 * The rule this module exists to enforce: a host only gets a `locationCode`
 * when exactly one city can be it. There are six US cities called Dallas and
 * dozens called Springfield, so "pick the first row" would quietly pin a
 * project's Springfield host to Illinois when it meant Missouri, and nothing
 * downstream could tell. Ambiguity is therefore a stored, visible state, not
 * something resolved by tie-break.
 */

/** The shape `GeoLocationRepository` returns for a candidate city row. */
export type CityCandidate = {
  code: number;
  /** DataForSEO's full hierarchy, e.g. "Austin,Texas,United States". */
  name: string;
  /** Derived when the table was seeded; authoritative where `name` is not. */
  stateCode: string | null;
  parentMetroCode: number | null;
};

type CityMatch =
  | {
      status: "matched";
      cityName: string;
      stateCode: string | null;
      locationCode: number;
      parentMetroCode: number | null;
    }
  | {
      status: "ambiguous";
      /** The cities that tied, so the UI can offer them as the fix. */
      candidates: CityCandidate[];
    }
  | { status: "unmatched" };

/**
 * The bare city name from a stored hierarchy: "Austin,Texas,United States" ->
 * "Austin". `toCityLabel` (src/shared/geo/geoDisplayName.ts) makes the same
 * cut for display; this one is for comparison, so it stays lowercase.
 */
export function bareCityName(storedName: string): string {
  return (storedName.split(",")[0] ?? "").trim();
}

function normalizeForCompare(value: string): string {
  return value
    .replace(/'/gu, "")
    .replace(/[.\-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * Abbreviations that appear in US city names with a period the subdomain
 * cannot carry: "st-louis" has to reach "St. Louis", "mt-pleasant" has to
 * reach "Mt. Pleasant".
 *
 * Deliberately only these three. They are the abbreviations Google's own
 * location names actually use in US city rows, and each is unambiguous as a
 * FIRST token (a city whose name begins with the standalone word "st" or "mt"
 * does not exist). Adding speculative entries here would trade a visible
 * unmatched row — which the UI already lets an operator fix in one click —
 * for a silently wrong location code, which is the one outcome this whole
 * module is built to avoid.
 */
const PERIOD_ABBREVIATIONS = new Set(["st", "ft", "mt"]);

/**
 * The stored spellings a city query could plausibly have, lowercased, for use
 * as SQL prefix patterns and as the JS comparison set.
 *
 * Three forms, because a subdomain flattens punctuation the stored name keeps:
 *
 *  - the space-separated query itself ("fort worth");
 *  - a hyphenated form ("winston-salem"), since a genuinely hyphenated city
 *    name is stored WITH the hyphen and a subdomain cannot tell that hyphen
 *    apart from the one it uses as a word separator;
 *  - a period form ("st. louis") when the first token is an abbreviation.
 *
 * `matchCity`'s own comparison normalizes both sides, so these extra spellings
 * exist mainly for the two places that CANNOT normalize: the SQL prefix
 * patterns, which match the stored column verbatim, and the by-name grouping
 * the caller builds from it. A variant that matches nothing simply returns no
 * rows, so over-generating here is cheap and under-generating is a miss.
 */
export function cityNameVariants(cityQuery: string): string[] {
  const normalized = normalizeForCompare(cityQuery);
  if (!normalized) return [];

  const variants = [normalized];
  const [first, ...rest] = normalized.split(" ");
  if (rest.length > 0) {
    variants.push(normalized.replace(/ /gu, "-"));
  }
  if (first && rest.length > 0 && PERIOD_ABBREVIATIONS.has(first)) {
    variants.push([`${first}.`, ...rest].join(" "));
  }
  return variants;
}

/** True when `candidate`'s bare name is one of `cityQuery`'s spellings. */
function isNameMatch(candidate: CityCandidate, variants: string[]): boolean {
  const bare = normalizeForCompare(bareCityName(candidate.name));
  return variants.some((variant) => normalizeForCompare(variant) === bare);
}

/**
 * Does `hint` name this candidate's state? Checked against the derived
 * `stateCode` ("tx") and against the state segment of the stored hierarchy
 * ("texas"), so both "austin-tx" and "austin-texas" resolve without this
 * module carrying its own copy of the US state table — the seeded rows
 * already hold both forms.
 */
function matchesStateHint(candidate: CityCandidate, hint: string): boolean {
  const normalizedHint = normalizeForCompare(hint);
  if (!normalizedHint) return false;

  if (
    candidate.stateCode &&
    candidate.stateCode.toLowerCase() === normalizedHint
  ) {
    return true;
  }

  // Segment 0 is the city itself; the state is one of the segments after it.
  return candidate.name
    .split(",")
    .slice(1)
    .some((segment) => normalizeForCompare(segment) === normalizedHint);
}

function toMatched(candidate: CityCandidate): CityMatch {
  return {
    status: "matched",
    cityName: bareCityName(candidate.name),
    stateCode: candidate.stateCode,
    locationCode: candidate.code,
    parentMetroCode: candidate.parentMetroCode,
  };
}

/**
 * Resolves one parsed host against the candidate rows a batch lookup returned.
 *
 * Order matters and is the point: the FULL label is tried as a city name
 * first, and the "city + trailing state" reading is only consulted when the
 * full label matched nothing. Without that ordering "san-antonio" would be
 * read as the city "San" in a state called "Antonio" — and there is a real
 * city called San Antonio, so the wrong reading would win on a tie-break.
 */
export function matchCity(
  parsed: {
    cityQuery: string;
    fallbackCityQuery: string | null;
    stateHint: string | null;
  },
  candidates: readonly CityCandidate[],
): CityMatch {
  const primaryVariants = cityNameVariants(parsed.cityQuery);
  const primary = candidates.filter((candidate) =>
    isNameMatch(candidate, primaryVariants),
  );

  if (primary.length === 1 && primary[0]) return toMatched(primary[0]);
  // Several real cities share the full label and nothing in the host says
  // which state — the host itself carries no more information, so stop here.
  if (primary.length > 1) return { status: "ambiguous", candidates: primary };

  if (!parsed.fallbackCityQuery || !parsed.stateHint) {
    return { status: "unmatched" };
  }

  const fallbackVariants = cityNameVariants(parsed.fallbackCityQuery);
  const fallback = candidates.filter((candidate) =>
    isNameMatch(candidate, fallbackVariants),
  );
  if (fallback.length === 0) return { status: "unmatched" };
  if (fallback.length === 1 && fallback[0]) {
    // One city carries the name, but the host also named a state. Honour the
    // disagreement rather than overriding it: "austin-ca" must not resolve to
    // Austin, Texas just because that is the only Austin in the table.
    return matchesStateHint(fallback[0], parsed.stateHint)
      ? toMatched(fallback[0])
      : { status: "unmatched" };
  }

  const stateHint = parsed.stateHint;
  const narrowed = fallback.filter((candidate) =>
    matchesStateHint(candidate, stateHint),
  );
  if (narrowed.length === 1 && narrowed[0]) return toMatched(narrowed[0]);
  return {
    status: "ambiguous",
    candidates: narrowed.length > 0 ? narrowed : fallback,
  };
}

/**
 * Every stored spelling a batch lookup must ask the database for, to be able
 * to decide `matchCity` for these hosts. Deduplicated, because a 2,000-host
 * import of one state's cities repeats plenty of names.
 */
export function lookupNamesFor(
  hosts: readonly {
    cityQuery: string;
    fallbackCityQuery: string | null;
  }[],
): string[] {
  const names = new Set<string>();
  for (const host of hosts) {
    for (const variant of cityNameVariants(host.cityQuery)) names.add(variant);
    if (host.fallbackCityQuery) {
      for (const variant of cityNameVariants(host.fallbackCityQuery)) {
        names.add(variant);
      }
    }
  }
  return [...names];
}
