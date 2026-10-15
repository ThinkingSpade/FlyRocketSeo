/**
 * Data access for city sites: the hosts in `project_subdomains` that are
 * registered as cities (`city_match_status` non-null).
 *
 * There is no separate city table. A city site is a project subdomain with a
 * city attached, so a host found by discovery and a host pasted into the city
 * importer are the same row, and the settings list and City Sites can never
 * disagree about what a project owns. Every read here filters to city rows;
 * every write touches only the city columns, except an import that adds a
 * host the project did not have yet.
 *
 * D1/Postgres only. Nothing here reaches a metered provider: importing,
 * listing and correcting city sites is bookkeeping over hosts the user already
 * owns, and must stay free at any scale (the feature exists for a 2,000-row
 * list, which would be unusable if browsing it cost money).
 */
import {
  and,
  asc,
  count as countFn,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { projectSubdomains } from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";
import { AppError } from "@/server/lib/errors";
import { MAX_SUBDOMAINS_PER_PROJECT } from "@/shared/project-subdomains";

export type CitySiteMatchStatus = "matched" | "ambiguous" | "unmatched";

export type CitySiteRow = {
  id: string;
  host: string;
  subdomainLabel: string;
  cityName: string | null;
  stateCode: string | null;
  locationCode: number | null;
  parentMetroCode: number | null;
  matchStatus: CitySiteMatchStatus;
  matchSource: "auto" | "manual";
  createdAt: string;
};

export type CitySiteInsert = {
  host: string;
  subdomainLabel: string;
  cityName: string | null;
  stateCode: string | null;
  locationCode: number | null;
  parentMetroCode: number | null;
  matchStatus: CitySiteMatchStatus;
};

const SELECT_COLUMNS = {
  id: projectSubdomains.id,
  host: projectSubdomains.host,
  cityLabel: projectSubdomains.cityLabel,
  cityName: projectSubdomains.cityName,
  stateCode: projectSubdomains.stateCode,
  locationCode: projectSubdomains.locationCode,
  parentMetroCode: projectSubdomains.parentMetroCode,
  cityMatchStatus: projectSubdomains.cityMatchStatus,
  cityMatchSource: projectSubdomains.cityMatchSource,
  createdAt: projectSubdomains.createdAt,
} as const;

type SelectedRow = {
  id: string;
  host: string;
  cityLabel: string | null;
  cityName: string | null;
  stateCode: string | null;
  locationCode: number | null;
  parentMetroCode: number | null;
  cityMatchStatus: CitySiteMatchStatus | null;
  cityMatchSource: "auto" | "manual" | null;
  createdAt: string;
};

/** Null only for a row the city filter already excluded; see `isCitySite`. */
function toCitySiteRow(row: SelectedRow): CitySiteRow | null {
  if (row.cityMatchStatus === null) return null;
  return {
    id: row.id,
    host: row.host,
    subdomainLabel: row.cityLabel ?? row.host.split(".")[0] ?? row.host,
    cityName: row.cityName,
    stateCode: row.stateCode,
    locationCode: row.locationCode,
    parentMetroCode: row.parentMetroCode,
    matchStatus: row.cityMatchStatus,
    matchSource: row.cityMatchSource ?? "auto",
    createdAt: row.createdAt,
  };
}

function toCitySiteRows(rows: readonly SelectedRow[]): CitySiteRow[] {
  return rows.flatMap((row) => {
    const city = toCitySiteRow(row);
    return city ? [city] : [];
  });
}

const isCitySite = isNotNull(projectSubdomains.cityMatchStatus);

/**
 * A `%…%` LIKE pattern with the metacharacters escaped. `_` matters
 * especially here: it is a single-character wildcard, and underscore-separated
 * subdomain labels are common, so an unescaped search for "fort_worth" would
 * quietly match "fortaworth" too. Pairs with the explicit `ESCAPE '\\'` below
 * — SQLite has no default escape character, so it must be spelled out for the
 * two dialects to behave identically (see likePattern.ts, where this repo
 * already paid for getting that exact detail wrong).
 */
function containsPattern(query: string): string {
  return `%${query.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;
}

function buildWhere(input: {
  projectId: string;
  search?: string;
  matchStatus?: CitySiteMatchStatus;
  hosts?: readonly string[];
}) {
  const conditions = [eq(projectSubdomains.projectId, input.projectId)];
  conditions.push(
    input.matchStatus
      ? eq(projectSubdomains.cityMatchStatus, input.matchStatus)
      : isCitySite,
  );
  if (input.hosts) {
    // An explicit host set is how the caller pages through an ordering this
    // table cannot produce — clicks live in Search Console, not in D1. An
    // EMPTY set must therefore match nothing rather than being ignored, or a
    // "no cities have traffic" page would silently render the whole registry.
    conditions.push(
      input.hosts.length > 0
        ? inArray(projectSubdomains.host, [...input.hosts])
        : sql`1 = 0`,
    );
  }
  const search = input.search?.trim().toLowerCase();
  if (search) {
    const pattern = containsPattern(search);
    // `lower(column) LIKE <pre-lowercased pattern>` rather than a bare LIKE:
    // SQLite's LIKE is ASCII case-insensitive but PostgreSQL's is not, so a
    // stored "St. Louis" would match a search for "louis" on D1 and silently
    // return nothing on Postgres. Same convention as
    // buildNamePrefixWhere/KeywordResearchRepository, for the same reason.
    //
    // Host and city are both searched because a matched row's city name is
    // often not a substring of its host ("st-louis" -> "St. Louis").
    const searchCondition = or(
      sql`lower(${projectSubdomains.host}) LIKE ${pattern} ESCAPE '\\'`,
      sql`lower(${projectSubdomains.cityName}) LIKE ${pattern} ESCAPE '\\'`,
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  return and(...conditions);
}

/**
 * One page of a project's city sites, plus the total for that same filter so
 * the UI can page without a second round trip.
 *
 * Always paginated — never a "list them all" read. A project on this feature
 * holds hundreds to a couple of thousand rows by design, and an unbounded
 * select would put every one of them through the Worker's response
 * serialization on each render.
 */
async function listPage(input: {
  projectId: string;
  search?: string;
  matchStatus?: CitySiteMatchStatus;
  /** Restrict to exactly these hosts; see buildWhere for why empty means none. */
  hosts?: readonly string[];
  limit: number;
  offset: number;
}): Promise<{ rows: CitySiteRow[]; totalCount: number }> {
  const where = buildWhere(input);
  const [rows, [total]] = await Promise.all([
    db
      .select(SELECT_COLUMNS)
      .from(projectSubdomains)
      .where(where)
      .orderBy(asc(projectSubdomains.host))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ value: countFn() }).from(projectSubdomains).where(where),
  ]);
  return { rows: toCitySiteRows(rows), totalCount: total?.value ?? 0 };
}

/** Row counts per match status — the coverage summary, in one query. */
async function countsByStatus(
  projectId: string,
): Promise<Record<CitySiteMatchStatus, number>> {
  const rows = await db
    .select({
      matchStatus: projectSubdomains.cityMatchStatus,
      value: countFn(),
    })
    .from(projectSubdomains)
    .where(and(eq(projectSubdomains.projectId, projectId), isCitySite))
    .groupBy(projectSubdomains.cityMatchStatus);

  const counts: Record<CitySiteMatchStatus, number> = {
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
  };
  for (const row of rows) {
    if (row.matchStatus) counts[row.matchStatus] = row.value;
  }
  return counts;
}

/**
 * Full city rows for an explicit set of ids, project-scoped.
 *
 * Project-scoped rather than a bare id lookup so a foreign id simply returns
 * nothing instead of leaking another project's registry — the same scoping
 * every other read here applies. A host that is not a city site is likewise
 * not returned, so rank setup can never be pointed at one.
 */
async function getByIds(
  projectId: string,
  ids: readonly string[],
): Promise<CitySiteRow[]> {
  if (ids.length === 0) return [];
  const rows: CitySiteRow[] = [];
  // Each id is a bound parameter; D1 caps them per statement.
  const CHUNK = 80;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const chunkRows = await db
      .select(SELECT_COLUMNS)
      .from(projectSubdomains)
      .where(
        and(
          eq(projectSubdomains.projectId, projectId),
          isCitySite,
          inArray(projectSubdomains.id, [...chunk]),
        ),
      )
      .orderBy(asc(projectSubdomains.host));
    rows.push(...toCitySiteRows(chunkRows));
  }
  return rows;
}

/**
 * Every city host this project holds, as a set.
 *
 * The one deliberately unpaginated read here, because its caller needs the
 * whole set to answer a set question: Search Console reports every host under
 * a Domain property — the apex, `www`, a staging subdomain — and only the city
 * sites belong in per-city totals. Without the full set, those other hosts
 * would be counted in.
 *
 * Cheap enough to justify the exception: one indexed column, one short string
 * per row, at the scale this feature is built for. `limit` is a backstop
 * against a pathological registry rather than an expected path.
 */
async function listAllHosts(
  projectId: string,
  limit: number,
): Promise<Set<string>> {
  const rows = await db
    .select({ host: projectSubdomains.host })
    .from(projectSubdomains)
    .where(and(eq(projectSubdomains.projectId, projectId), isCitySite))
    .limit(limit);
  return new Set(rows.map((row) => row.host));
}

/**
 * Which of `hosts` are already city sites — read by the import preview so a
 * re-run can say "already imported". A host the project holds but has not
 * registered as a city is NOT already imported: importing it is what makes it
 * one.
 */
async function findExistingHosts(
  projectId: string,
  hosts: readonly string[],
): Promise<Set<string>> {
  if (hosts.length === 0) return new Set();
  const found = new Set<string>();
  // Each host is a bound parameter; D1 caps them per statement.
  const CHUNK = 80;
  for (let i = 0; i < hosts.length; i += CHUNK) {
    const chunk = hosts.slice(i, i + CHUNK);
    const rows = await db
      .select({ host: projectSubdomains.host })
      .from(projectSubdomains)
      .where(
        and(
          eq(projectSubdomains.projectId, projectId),
          isCitySite,
          inArray(projectSubdomains.host, [...chunk]),
        ),
      );
    for (const row of rows) found.add(row.host);
  }
  return found;
}

/** Every host the project holds, city or not, among `hosts`. */
async function findHeldHosts(
  projectId: string,
  hosts: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  const CHUNK = 80;
  for (let i = 0; i < hosts.length; i += CHUNK) {
    const chunk = hosts.slice(i, i + CHUNK);
    const rows = await db
      .select({ host: projectSubdomains.host })
      .from(projectSubdomains)
      .where(
        and(
          eq(projectSubdomains.projectId, projectId),
          inArray(projectSubdomains.host, [...chunk]),
        ),
      );
    for (const row of rows) found.add(row.host);
  }
  return found;
}

function cityColumns(row: CitySiteInsert) {
  return {
    cityLabel: row.subdomainLabel,
    cityName: row.cityName,
    stateCode: row.stateCode,
    locationCode: row.locationCode,
    parentMetroCode: row.parentMetroCode,
    cityMatchStatus: row.matchStatus,
    cityMatchSource: "auto" as const,
  };
}

/**
 * Registers a chunk of hosts as city sites.
 *
 * Three cases per host, decided by the row the project already has:
 * - no row: inserted as a new subdomain (source `manual` — the user supplied
 *   it), but only while the project is under `MAX_SUBDOMAINS_PER_PROJECT`;
 *   the rest are counted in `skippedForCap`, never dropped silently.
 * - a row that is not a city site yet (e.g. found by discovery): its city
 *   columns are filled in. It already counts toward the cap.
 * - a row that is already a city site: left alone, so a re-import never
 *   overwrites an operator's manual correction.
 *
 * The last two are one upsert whose UPDATE only applies while
 * `city_match_status` is still null, so two tabs re-importing the same list
 * converge instead of racing.
 *
 * The cap is a soft ceiling: it is counted before the write, so two imports
 * running at the same moment can overshoot it by the rows they each add. It
 * bounds list size, not spend, and D1 has no cheap atomic count-and-insert,
 * so that is accepted rather than engineered around.
 */
async function insertMany(
  projectId: string,
  rows: readonly CitySiteInsert[],
): Promise<{ imported: number; skippedForCap: number }> {
  if (rows.length === 0) return { imported: 0, skippedForCap: 0 };

  const [held, [total]] = await Promise.all([
    findHeldHosts(
      projectId,
      rows.map((row) => row.host),
    ),
    db
      .select({ value: countFn() })
      .from(projectSubdomains)
      .where(eq(projectSubdomains.projectId, projectId)),
  ]);
  let capacity = Math.max(0, MAX_SUBDOMAINS_PER_PROJECT - (total?.value ?? 0));
  const writable: CitySiteInsert[] = [];
  let skippedForCap = 0;
  for (const row of rows) {
    if (held.has(row.host)) writable.push(row);
    else if (capacity > 0) {
      capacity -= 1;
      writable.push(row);
    } else skippedForCap += 1;
  }

  await executeInBatches(writable, (tx, row) =>
    tx
      .insert(projectSubdomains)
      .values({
        id: crypto.randomUUID(),
        projectId,
        host: row.host,
        source: "manual",
        ...cityColumns(row),
      })
      .onConflictDoUpdate({
        target: [projectSubdomains.projectId, projectSubdomains.host],
        set: cityColumns(row),
        setWhere: isNull(projectSubdomains.cityMatchStatus),
      }),
  );
  return { imported: writable.length, skippedForCap };
}

/**
 * Pins one city site to a location an operator chose by hand.
 *
 * Writes `cityMatchSource: "manual"` so a later automatic re-match can tell a
 * human's decision from its own guess and leave it alone.
 */
async function setLocation(input: {
  projectId: string;
  citySiteId: string;
  cityName: string;
  stateCode: string | null;
  locationCode: number;
  parentMetroCode: number | null;
}): Promise<void> {
  const [row] = await db
    .update(projectSubdomains)
    .set({
      cityName: input.cityName,
      stateCode: input.stateCode,
      locationCode: input.locationCode,
      parentMetroCode: input.parentMetroCode,
      cityMatchStatus: "matched",
      cityMatchSource: "manual",
    })
    .where(
      and(
        eq(projectSubdomains.id, input.citySiteId),
        eq(projectSubdomains.projectId, input.projectId),
        isCitySite,
      ),
    )
    .returning({ id: projectSubdomains.id });

  if (!row) throw new AppError("NOT_FOUND");
}

/**
 * Takes hosts off City Sites by clearing their city columns.
 *
 * The host itself stays in the project's subdomain list: it is still a host
 * the project owns, and deleting it is a decision made where that list is
 * managed (Project settings), not a side effect of no longer tracking it as a
 * city.
 */
async function removeMany(
  projectId: string,
  citySiteIds: readonly string[],
): Promise<number> {
  if (citySiteIds.length === 0) return 0;
  let removed = 0;
  const CHUNK = 80;
  for (let i = 0; i < citySiteIds.length; i += CHUNK) {
    const chunk = citySiteIds.slice(i, i + CHUNK);
    const rows = await db
      .update(projectSubdomains)
      .set({
        cityLabel: null,
        cityName: null,
        stateCode: null,
        locationCode: null,
        parentMetroCode: null,
        cityMatchStatus: null,
        cityMatchSource: null,
      })
      .where(
        and(
          eq(projectSubdomains.projectId, projectId),
          isCitySite,
          inArray(projectSubdomains.id, [...chunk]),
        ),
      )
      .returning({ id: projectSubdomains.id });
    removed += rows.length;
  }
  return removed;
}

export const CitySiteRepository = {
  listPage,
  countsByStatus,
  getByIds,
  listAllHosts,
  findExistingHosts,
  insertMany,
  setLocation,
  removeMany,
} as const;
