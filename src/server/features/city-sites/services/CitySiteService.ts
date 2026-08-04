/**
 * The city-subdomain registry: importing a site's per-city hostnames, keeping
 * each one pinned to the right DataForSEO city code, and listing them back.
 *
 * WHY THIS IS ONE PROJECT AND NOT MANY
 * A site with a subdomain per US city is one property with 500-2,000
 * locations, not 500-2,000 properties. Modelling each city as its own project
 * would multiply everything that is per-project — the switcher, the portfolio
 * fan-out, and above all the metered analyses — by the city count, to answer
 * questions that are really about one site. So a city subdomain is a ROW here,
 * and the project stays one project.
 *
 * NO METERED SPEND, EVER. Import, re-match, listing and correction read the
 * seeded `geo_locations` D1 table and write `project_city_sites`. Nothing in
 * this file may import a paid provider client: adding 2,000 hosts must cost
 * nothing, or the feature is unusable at the scale it exists for. The per-city
 * paid lookups stay where they already are — explicit, one analysis at a time,
 * on a control that says it will spend.
 *
 * WHY THE IMPORT IS CHUNKED
 * This deployment is on the Cloudflare Workers Free plan, whose per-invocation
 * CPU ceiling is tight and fixed (the same ceiling that forces site-audit
 * crawls into batches of two and the geo seed into ~48 resumable chunks). A
 * 2,000-row import in one request would exceed it. `importChunk` therefore
 * does one bounded slice and returns, and the caller loops — the same shape
 * `GeoLocationSeedService.seedChunk` already uses.
 */
import {
  CitySiteRepository,
  type CitySiteInsert,
  type CitySiteMatchStatus,
  type CitySiteRow,
} from "@/server/features/city-sites/repositories/CitySiteRepository";
import { GeoLocationRepository } from "@/server/features/geo/repositories/GeoLocationRepository";
import { AppError } from "@/server/lib/errors";
import {
  lookupNamesFor,
  matchCity,
  type CityCandidate,
} from "@/shared/city-subdomains/matchCity";
import {
  parseCityHosts,
  toBaseDomain,
  type ParsedCityHost,
  type SkippedLine,
} from "@/shared/city-subdomains/parseCityHosts";
import { DEFAULT_LOCATION_CODE } from "@/shared/keyword-locations";

/**
 * Hosts resolved and written per `importChunk` call.
 *
 * Sized against the Free plan's limits rather than picked round: one chunk
 * runs at most a handful of `geo_locations` reads (names are batched 40 to a
 * statement inside the repository) plus one 100-row D1 write batch. 2,000
 * hosts is then ~40 calls — the same order as the geo seed's own ~48, which
 * this deployment already runs to completion in production.
 */
const CITY_SITE_IMPORT_CHUNK_SIZE = 50;

/**
 * Ceiling on one paste. Not a storage limit — it bounds the string a single
 * server function accepts and the preview it has to build in one invocation.
 * A larger list is imported by pasting it in parts; `parseCityHosts` reports
 * what it dropped so that is visible rather than silent.
 */
export const CITY_SITE_IMPORT_MAX_HOSTS = 2000;

/** `geo_locations` is seeded US-only; see GeoLocationSeedService. */
const US_COUNTRY_CODE = DEFAULT_LOCATION_CODE;

export type CitySitePreviewRow = {
  host: string;
  subdomainLabel: string;
  cityName: string | null;
  stateCode: string | null;
  locationCode: number | null;
  parentMetroCode: number | null;
  matchStatus: CitySiteMatchStatus;
  /** True when the project already holds this host, so the import is a no-op. */
  alreadyImported: boolean;
};

export type CitySitePreview = {
  rows: CitySitePreviewRow[];
  skipped: SkippedLine[];
  truncatedCount: number;
  counts: Record<CitySiteMatchStatus, number>;
  alreadyImportedCount: number;
  /**
   * True when `geo_locations` holds no rows at all. Without it every host
   * would come back "unmatched" and look like a parsing failure, when the real
   * cause is that nobody has run the location seed on this deployment yet.
   */
  geoTableEmpty: boolean;
};

/**
 * Input shared by the two import entry points. `projectDomain` is passed in
 * from the middleware's already-authorized project row rather than re-read
 * here: it is what tells "austin.tx.example.com" that its city label is
 * "austin.tx" and not just "austin", and a second lookup for a value the
 * caller already holds is a round trip this deployment's CPU budget does not
 * need to spend.
 */
type ImportInput = {
  projectId: string;
  projectDomain: string | null;
  text: string;
};

/**
 * Resolves a batch of parsed hosts against the seeded city table.
 *
 * One database read for the whole batch, then a pure decision per host. The
 * candidate rows are grouped by their own bare name so `matchCity` is handed
 * only the rows that could plausibly be its city, rather than the whole batch.
 */
async function resolveHosts(
  hosts: readonly ParsedCityHost[],
): Promise<Map<string, CityCandidate[]>> {
  const names = lookupNamesFor(hosts);
  const rows = await GeoLocationRepository.searchCitiesByNames({
    names,
    countryCode: US_COUNTRY_CODE,
  });

  const byName = new Map<string, CityCandidate[]>();
  for (const row of rows) {
    const key = (row.name.split(",")[0] ?? "").trim().toLowerCase();
    const existing = byName.get(key);
    const candidate: CityCandidate = {
      code: row.code,
      name: row.name,
      stateCode: row.stateCode,
      parentMetroCode: row.parentMetroCode,
    };
    if (existing) existing.push(candidate);
    else byName.set(key, [candidate]);
  }
  return byName;
}

/**
 * The candidate rows relevant to one host: every group whose name could be
 * either reading of its label. Passing the whole batch's rows would still be
 * correct (`matchCity` filters by name itself) but would make the ambiguity
 * count meaningless to debug.
 */
function candidatesFor(
  host: ParsedCityHost,
  byName: Map<string, CityCandidate[]>,
): CityCandidate[] {
  const keys = lookupNamesFor([host]);
  const out: CityCandidate[] = [];
  for (const key of keys) {
    const group = byName.get(key.toLowerCase());
    if (group) out.push(...group);
  }
  return out;
}

function toPreviewRow(
  host: ParsedCityHost,
  byName: Map<string, CityCandidate[]>,
  alreadyImported: boolean,
): CitySitePreviewRow {
  const match = matchCity(host, candidatesFor(host, byName));
  const base = {
    host: host.host,
    subdomainLabel: host.subdomainLabel,
    alreadyImported,
  };

  if (match.status === "matched") {
    return {
      ...base,
      cityName: match.cityName,
      stateCode: match.stateCode,
      locationCode: match.locationCode,
      parentMetroCode: match.parentMetroCode,
      matchStatus: "matched",
    };
  }

  // Ambiguous and unmatched both store NO location code. An ambiguous row
  // knows its city name but not WHICH one, so even the name is left off here
  // rather than showing one of several as though it had been chosen.
  return {
    ...base,
    cityName: null,
    stateCode: null,
    locationCode: null,
    parentMetroCode: null,
    matchStatus: match.status,
  };
}

function tally(
  rows: readonly { matchStatus: CitySiteMatchStatus }[],
): Record<CitySiteMatchStatus, number> {
  const counts: Record<CitySiteMatchStatus, number> = {
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
  };
  for (const row of rows) counts[row.matchStatus] += 1;
  return counts;
}

/**
 * What an import WOULD do, without writing anything.
 *
 * Exists because the alternative — import first, inspect afterwards — means
 * discovering that 400 hosts resolved to the wrong city only once they are
 * already rows. The preview is capped at the same host ceiling as the import
 * so what is shown is exactly what will be written.
 */
async function previewImport(input: ImportInput): Promise<CitySitePreview> {
  const parsed = parseCityHosts(input.text, {
    baseDomain: toBaseDomain(input.projectDomain),
    limit: CITY_SITE_IMPORT_MAX_HOSTS,
  });

  const [byName, existing, geoRowCount] = await Promise.all([
    resolveHosts(parsed.hosts),
    CitySiteRepository.findExistingHosts(
      input.projectId,
      parsed.hosts.map((host) => host.host),
    ),
    GeoLocationRepository.count(),
  ]);

  const rows = parsed.hosts.map((host) =>
    toPreviewRow(host, byName, existing.has(host.host)),
  );

  return {
    rows,
    skipped: parsed.skipped,
    truncatedCount: parsed.truncatedCount,
    counts: tally(rows),
    alreadyImportedCount: rows.filter((row) => row.alreadyImported).length,
    geoTableEmpty: geoRowCount === 0,
  };
}

type ImportChunkResult = {
  /** Hosts consumed so far, for the caller's progress display and next offset. */
  processed: number;
  imported: number;
  counts: Record<CitySiteMatchStatus, number>;
  done: boolean;
};

/**
 * Imports one bounded slice of a paste and reports where the caller should
 * resume.
 *
 * Takes the raw text plus an offset rather than a pre-parsed array so a
 * resumed run re-derives its rows from the same input — the caller cannot
 * hand back a doctored slice, and a chunk boundary cannot lose a host to a
 * mid-paste re-parse. Re-parsing is cheap next to the database work.
 */
async function importChunk(
  input: ImportInput & { offset: number },
): Promise<ImportChunkResult> {
  const parsed = parseCityHosts(input.text, {
    baseDomain: toBaseDomain(input.projectDomain),
    limit: CITY_SITE_IMPORT_MAX_HOSTS,
  });

  const slice = parsed.hosts.slice(
    input.offset,
    input.offset + CITY_SITE_IMPORT_CHUNK_SIZE,
  );
  if (slice.length === 0) {
    return {
      processed: parsed.hosts.length,
      imported: 0,
      counts: { matched: 0, ambiguous: 0, unmatched: 0 },
      done: true,
    };
  }

  const byName = await resolveHosts(slice);
  const inserts: CitySiteInsert[] = slice.map((host) => {
    const row = toPreviewRow(host, byName, false);
    return {
      host: row.host,
      subdomainLabel: row.subdomainLabel,
      cityName: row.cityName,
      stateCode: row.stateCode,
      locationCode: row.locationCode,
      parentMetroCode: row.parentMetroCode,
      matchStatus: row.matchStatus,
    };
  });

  await CitySiteRepository.insertMany(input.projectId, inserts);

  const processed = input.offset + slice.length;
  return {
    processed,
    imported: inserts.length,
    counts: tally(inserts),
    done: processed >= parsed.hosts.length,
  };
}

type CitySiteListResult = {
  rows: CitySiteRow[];
  totalCount: number;
  counts: Record<CitySiteMatchStatus, number>;
};

async function list(input: {
  projectId: string;
  search?: string;
  matchStatus?: CitySiteMatchStatus;
  page: number;
  pageSize: number;
}): Promise<CitySiteListResult> {
  const [page, counts] = await Promise.all([
    CitySiteRepository.listPage({
      projectId: input.projectId,
      search: input.search,
      matchStatus: input.matchStatus,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    }),
    CitySiteRepository.countsByStatus(input.projectId),
  ]);
  return { ...page, counts };
}

/**
 * Pins a row to a city an operator picked from the geo picker.
 *
 * The location code is re-read from `geo_locations` rather than trusted from
 * the client: this column is what every per-city question will be asked with,
 * so it must be a real seeded city, not an arbitrary integer that happens to
 * pass validation.
 */
async function assignLocation(input: {
  projectId: string;
  citySiteId: string;
  locationCode: number;
}): Promise<void> {
  const location = await GeoLocationRepository.getByCode(input.locationCode);
  if (!location) {
    throw new AppError(
      "NOT_FOUND",
      "That location is not in the seeded location table.",
    );
  }

  await CitySiteRepository.setLocation({
    projectId: input.projectId,
    citySiteId: input.citySiteId,
    cityName: (location.name.split(",")[0] ?? location.name).trim(),
    stateCode: location.stateCode,
    locationCode: location.code,
    parentMetroCode: location.parentMetroCode,
  });
}

async function remove(input: {
  projectId: string;
  citySiteIds: string[];
}): Promise<{ deletedCount: number }> {
  const deletedCount = await CitySiteRepository.removeMany(
    input.projectId,
    input.citySiteIds,
  );
  return { deletedCount };
}

export const CitySiteService = {
  previewImport,
  importChunk,
  list,
  assignLocation,
  remove,
} as const;
