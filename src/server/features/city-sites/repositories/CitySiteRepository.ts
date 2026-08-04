/**
 * Data access for `project_city_sites` — the per-project registry of city
 * subdomains.
 *
 * D1/Postgres only. Nothing here reaches a metered provider: importing,
 * listing and correcting city sites is bookkeeping over hosts the user already
 * owns, and must stay free to do at any scale (the whole point of the feature
 * is a 2,000-row list, which would be unusable if browsing it cost money).
 */
import { and, asc, count as countFn, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectCitySites } from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";
import { AppError } from "@/server/lib/errors";

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

const ROW_COLUMNS = {
  id: projectCitySites.id,
  host: projectCitySites.host,
  subdomainLabel: projectCitySites.subdomainLabel,
  cityName: projectCitySites.cityName,
  stateCode: projectCitySites.stateCode,
  locationCode: projectCitySites.locationCode,
  parentMetroCode: projectCitySites.parentMetroCode,
  matchStatus: projectCitySites.matchStatus,
  matchSource: projectCitySites.matchSource,
  createdAt: projectCitySites.createdAt,
} as const;

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
  const conditions = [eq(projectCitySites.projectId, input.projectId)];
  if (input.matchStatus) {
    conditions.push(eq(projectCitySites.matchStatus, input.matchStatus));
  }
  if (input.hosts) {
    // An explicit host set is how the caller pages through an ordering this
    // table cannot produce — clicks live in Search Console, not in D1. An
    // EMPTY set must therefore match nothing rather than being ignored, or a
    // "no cities have traffic" page would silently render the whole registry.
    conditions.push(
      input.hosts.length > 0
        ? inArray(projectCitySites.host, [...input.hosts])
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
      sql`lower(${projectCitySites.host}) LIKE ${pattern} ESCAPE '\\'`,
      sql`lower(${projectCitySites.cityName}) LIKE ${pattern} ESCAPE '\\'`,
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
      .select(ROW_COLUMNS)
      .from(projectCitySites)
      .where(where)
      .orderBy(asc(projectCitySites.host))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ value: countFn() }).from(projectCitySites).where(where),
  ]);
  return { rows, totalCount: total?.value ?? 0 };
}

/** Row counts per match status — the coverage summary, in one query. */
async function countsByStatus(
  projectId: string,
): Promise<Record<CitySiteMatchStatus, number>> {
  const rows = await db
    .select({
      matchStatus: projectCitySites.matchStatus,
      value: countFn(),
    })
    .from(projectCitySites)
    .where(eq(projectCitySites.projectId, projectId))
    .groupBy(projectCitySites.matchStatus);

  const counts: Record<CitySiteMatchStatus, number> = {
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
  };
  for (const row of rows) counts[row.matchStatus] = row.value;
  return counts;
}

/**
 * Every host this project holds, as a set.
 *
 * The one deliberately unpaginated read here, because its caller needs the
 * whole set to answer a set question: Search Console reports every host under
 * a Domain property — the apex, `www`, a staging subdomain — and only the ones
 * in this table are city sites. Without the full set, those extra hosts would
 * be counted into per-city totals.
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
    .select({ host: projectCitySites.host })
    .from(projectCitySites)
    .where(eq(projectCitySites.projectId, projectId))
    .limit(limit);
  return new Set(rows.map((row) => row.host));
}

/**
 * Which of `hosts` this project already holds — read by the importer so a
 * re-run can report "already imported" instead of failing on the unique index.
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
      .select({ host: projectCitySites.host })
      .from(projectCitySites)
      .where(
        and(
          eq(projectCitySites.projectId, projectId),
          inArray(projectCitySites.host, [...chunk]),
        ),
      );
    for (const row of rows) found.add(row.host);
  }
  return found;
}

/**
 * Inserts a chunk of city sites, skipping hosts the project already has.
 *
 * `onConflictDoNothing` rather than a read-then-write guard: the importer runs
 * as many sequential calls from the browser, and two tabs (or a double-clicked
 * button) re-importing the same list must not turn into a unique-constraint
 * error halfway through a 2,000-row run. The unique index is the arbiter.
 */
async function insertMany(
  projectId: string,
  rows: readonly CitySiteInsert[],
): Promise<void> {
  if (rows.length === 0) return;
  await executeInBatches([...rows], (tx, row) =>
    tx
      .insert(projectCitySites)
      .values({ id: crypto.randomUUID(), projectId, ...row })
      .onConflictDoNothing(),
  );
}

/**
 * Pins one row to a location an operator chose by hand.
 *
 * Writes `matchSource: "manual"` so a later automatic re-match can tell a
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
    .update(projectCitySites)
    .set({
      cityName: input.cityName,
      stateCode: input.stateCode,
      locationCode: input.locationCode,
      parentMetroCode: input.parentMetroCode,
      matchStatus: "matched",
      matchSource: "manual",
    })
    .where(
      and(
        eq(projectCitySites.id, input.citySiteId),
        eq(projectCitySites.projectId, input.projectId),
      ),
    )
    .returning({ id: projectCitySites.id });

  if (!row) throw new AppError("NOT_FOUND");
}

async function removeMany(
  projectId: string,
  citySiteIds: readonly string[],
): Promise<number> {
  if (citySiteIds.length === 0) return 0;
  let deleted = 0;
  const CHUNK = 80;
  for (let i = 0; i < citySiteIds.length; i += CHUNK) {
    const chunk = citySiteIds.slice(i, i + CHUNK);
    const rows = await db
      .delete(projectCitySites)
      .where(
        and(
          eq(projectCitySites.projectId, projectId),
          inArray(projectCitySites.id, [...chunk]),
        ),
      )
      .returning({ id: projectCitySites.id });
    deleted += rows.length;
  }
  return deleted;
}

export const CitySiteRepository = {
  listPage,
  countsByStatus,
  listAllHosts,
  findExistingHosts,
  insertMany,
  setLocation,
  removeMany,
} as const;
