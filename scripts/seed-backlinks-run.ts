/**
 * Seed a complete Backlinks profile into local D1 + R2 so the whole tab can be
 * exercised offline. Fully offline — no DataForSEO key, no network, no spend.
 *
 * This exists because two states could not be reached locally at all: the
 * restored-run card (needs a stored `analysis_runs` row plus its R2 payload)
 * and the breakdown drill-downs (each sends a filtered request that would
 * otherwise hit the paid API). Both now resolve from seeded cache.
 *
 * What it creates:
 *   - An `analysis_runs` row + `analysis-runs/<key>` payload, so the tab
 *     auto-restores with no target in the URL.
 *   - Cached overview, plus rows (both grouping modes), referring domains,
 *     top pages and anchors.
 *   - One cached rows page per selectable breakdown value, so every drill-down
 *     is a cache hit.
 *
 * Usage:
 *   pnpm db:migrate:local                    # once — creates the local D1
 *   pnpm seed:backlinks-run                  # seed demo data
 *   pnpm seed:backlinks-run --target=acme.com
 *   pnpm seed:backlinks-run --projectId=<uuid>
 *   pnpm seed:backlinks-run --reset          # remove what a previous run wrote
 *
 * Then view it:
 *   env AUTH_MODE=local_noauth pnpm dev      # open Backlinks with no target
 */

import process from "node:process";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { sortBy } from "remeda";
// The schema barrel pulls in ./provider, which imports `cloudflare:workers` --
// a scheme Node's ESM loader cannot resolve. Import the SQLite tables directly;
// local dev is D1 anyway.
import * as schema from "../src/db/app.schema";
import { parseArgs } from "./cli-utils";
import { RUN_FEATURES } from "../src/shared/analysis-run-features";
import {
  backlinksOverviewCacheSchema,
  backlinksRowsPageResultSchema,
  referringDomainsPageResultSchema,
  topPagesPageResultSchema,
  anchorsPageResultSchema,
} from "../src/types/schemas/backlinks-results";
import { normalizeBacklinksTarget } from "../src/server/lib/dataforseoBacklinksTarget";
import {
  buildBreakdowns,
  buildSeedLinks,
  buildTrends,
  type SeedLink,
} from "./backlinksSeedFixture";

const LOCAL_ADMIN_USER_ID = "local-admin";
const LOCAL_ORG_ID = `delegated-${LOCAL_ADMIN_USER_ID}`;
const CACHE_PREFIX = "dataforseo-cache/";
const RUN_PAYLOAD_PREFIX = "analysis-runs/";
const PAGE_SIZE = 100;
const FETCHED_AT = "2026-08-10T12:43:00.000Z";
/** Far future: `getCached` returns null once this instant has passed. */
const EXPIRES_AT = "2030-01-01T00:00:00.000Z";

/** The six drill-down dimensions, and how each maps onto a seeded link. */
const CATEGORY_DIMENSIONS = [
  { key: "sourceCountry", of: (l: SeedLink) => l.country },
  { key: "sourceTld", of: (l: SeedLink) => l.tld },
  { key: "itemType", of: (l: SeedLink) => l.itemType },
  { key: "linkAttribute", of: (l: SeedLink) => l.relAttributes[0] ?? "" },
  { key: "sourcePlatformType", of: (l: SeedLink) => l.platformType },
  { key: "semanticLocation", of: (l: SeedLink) => l.semanticLocation },
] as const;

type Env = { DB: D1Database; R2: R2Bucket };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Normalize exactly as the server does. The cache key is built from
  // apiTarget, so seeding the raw input would write keys the app never reads
  // for anything with a protocol, a www. prefix, or capitals -- and the failure
  // is silent: the page just says there is no restored run.
  const normalized = normalizeBacklinksTarget(
    args.target ?? "americavending.com",
    {
      scope: "domain",
    },
  );
  const target = normalized.apiTarget;
  const scope = normalized.scope;

  console.log("Setting up local D1 + R2 connections...");
  const { env, dispose } = await getPlatformProxy<Env>();
  const db = drizzle(env.DB, { schema });

  try {
    const { projectId, organizationId } = await resolveProject(
      db,
      args.projectId,
    );
    console.log(`Using project ${projectId} (org ${organizationId})`);

    if (args.reset !== undefined) {
      const removed = await db
        .delete(schema.analysisRuns)
        .where(
          and(
            eq(schema.analysisRuns.projectId, projectId),
            eq(schema.analysisRuns.feature, RUN_FEATURES.backlinks),
          ),
        )
        .returning({ id: schema.analysisRuns.id });
      console.log(`Reset: removed ${removed.length} stored backlinks run(s).`);
      console.log("(Cached R2 objects are left in place; they are harmless.)");
      return;
    }

    const links = buildSeedLinks(target);
    const breakdowns = buildBreakdowns(links);
    const { trends, newLostTrends } = buildTrends();
    const domains = collectDomains(links);

    const overview = {
      target,
      displayTarget: target,
      scope,
      summary: {
        rank: 0,
        backlinks: links.length,
        referringPages: links.length,
        referringDomains: domains.length,
        brokenBacklinks: 0,
        brokenPages: 0,
        backlinksSpamScore: 53,
        targetSpamScore: 0,
        newBacklinks: 2,
        lostBacklinks: 1,
        newReferringDomains: 2,
        lostReferringDomains: 1,
        ...breakdowns,
        referringDomainsNofollow: countNofollowDomains(links),
        referringPagesNofollow: links.filter((l) => !l.isDofollow).length,
      },
      trends,
      newLostTrends,
      fetchedAt: FETCHED_AT,
    };

    // Validate against the real schemas before writing. A drifted fixture fails
    // silently at runtime as "no restored run", which is the exact bug this
    // script exists to prevent.
    const runPayload = backlinksOverviewCacheSchema.parse({ overview });

    // Must be the project's real organization: the server builds every cache
    // key from billingCustomer.organizationId, so assuming the local_noauth org
    // would write keys the app never looks up.
    const targetParams = { organizationId, target, scope };
    const overviewKey = await buildCacheKey("backlinks:overview", targetParams);

    let written = 0;
    const put = async (key: string, value: unknown) => {
      await env.R2.put(`${CACHE_PREFIX}${key}`, JSON.stringify(value), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { expiresAt: EXPIRES_AT },
      });
      written += 1;
    };

    await put(overviewKey, runPayload);
    await env.R2.put(
      `${RUN_PAYLOAD_PREFIX}${overviewKey}`,
      JSON.stringify(runPayload),
    );

    // Both grouping modes: the page defaults to one_per_domain, and every
    // drill-down forces as_is.
    await put(
      await rowsKey(targetParams, {}, "one_per_domain"),
      backlinksRowsPageResultSchema.parse(
        pageResult(onePerDomain(links).map(toRow)),
      ),
    );
    await put(
      await rowsKey(targetParams, {}, "as_is"),
      backlinksRowsPageResultSchema.parse(pageResult(links.map(toRow))),
    );

    await put(
      await pageKey("backlinks:referring-domains-page", targetParams, {
        sortField: "backlinks",
      }),
      referringDomainsPageResultSchema.parse(pageResult(domains)),
    );
    await put(
      await pageKey("backlinks:top-pages-page", targetParams, {
        sortField: "backlinks",
      }),
      topPagesPageResultSchema.parse(pageResult(collectTopPages(links))),
    );
    await put(
      await pageKey("backlinks:anchors-page", targetParams, {
        sortField: "backlinks",
      }),
      anchorsPageResultSchema.parse(pageResult(collectAnchors(links))),
    );

    // One entry per selectable breakdown value, so every drill-down is a hit.
    let drillDowns = 0;
    for (const dimension of CATEGORY_DIMENSIONS) {
      const values = new Set(
        links.map(dimension.of).filter((value) => value.trim() !== ""),
      );
      for (const value of values) {
        const matching = links.filter((link) => dimension.of(link) === value);
        await put(
          await rowsKey(targetParams, { [dimension.key]: value }, "as_is"),
          backlinksRowsPageResultSchema.parse(pageResult(matching.map(toRow))),
        );
        drillDowns += 1;
      }
    }

    const now = new Date().toISOString();
    await db
      .insert(schema.analysisRuns)
      .values({
        id: crypto.randomUUID(),
        projectId,
        feature: RUN_FEATURES.backlinks,
        paramsJson: JSON.stringify({ target, scope }),
        cacheKey: overviewKey,
        label: target,
        ranBy: LOCAL_ADMIN_USER_ID,
        runCount: 1,
        createdAt: now,
        lastRanAt: now,
      })
      .onConflictDoNothing();

    console.log(
      `Seeded ${target}: ${links.length} links across ${domains.length} domains.`,
    );
    console.log(
      `Wrote ${written} cache objects (${drillDowns} drill-down slices) + 1 run payload.`,
    );
    console.log("Open Backlinks with no target to see the restored run.");
  } finally {
    await dispose();
  }
}

/**
 * Must match `buildCacheKey` in src/server/lib/r2-cache.ts exactly — same
 * sorted-entries JSON, same digest — or the app looks up keys that do not exist
 * and the seed silently does nothing.
 */
async function buildCacheKey(
  prefix: string,
  params: Record<string, unknown>,
): Promise<string> {
  const raw = JSON.stringify(
    Object.fromEntries(sortBy(Object.entries(params), ([key]) => key)),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}:${hex}`;
}

type TargetParams = { organizationId: string; target: string; scope: string };

/**
 * `hideSpam` is always "false" here: the web page passes
 * WEB_SPAM_OPTIONS = { hideSpam: false }, and `spamThreshold` only joins the
 * key when hiding is on. Seeding the service default instead would produce
 * keys the app never asks for.
 */
async function pageKey(
  prefix: string,
  target: TargetParams,
  options: {
    sortField: string;
    filters?: Record<string, string>;
    mode?: string;
  },
): Promise<string> {
  return buildCacheKey(prefix, {
    ...target,
    page: 1,
    pageSize: PAGE_SIZE,
    sortField: options.sortField,
    sortOrder: "desc",
    filters: options.filters ?? {},
    ...(options.mode ? { mode: options.mode } : {}),
    hideSpam: "false",
  });
}

function rowsKey(
  target: TargetParams,
  filters: Record<string, string>,
  mode: string,
) {
  return pageKey("backlinks:rows-page", target, {
    sortField: "rank",
    filters,
    mode,
  });
}

function pageResult<T>(rows: T[]) {
  return {
    rows,
    totalCount: rows.length,
    hasMore: false,
    page: 1,
    pageSize: PAGE_SIZE,
    fetchedAt: FETCHED_AT,
  };
}

function toRow(link: SeedLink) {
  return {
    domainFrom: link.domainFrom,
    urlFrom: link.urlFrom,
    urlTo: link.urlTo,
    anchor: link.anchor,
    itemType: link.itemType,
    isDofollow: link.isDofollow,
    relAttributes: link.relAttributes,
    rank: link.rank,
    domainFromRank: link.domainFromRank,
    pageFromRank: link.pageFromRank,
    spamScore: link.spamScore,
    firstSeen: link.firstSeen,
    lastSeen: link.lastSeen,
    isLost: link.isLost,
    isBroken: link.isBroken,
    linksCount: link.linksCount,
  };
}

/** The strongest link per domain, which is what `one_per_domain` returns. */
function onePerDomain(links: SeedLink[]): SeedLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.domainFrom)) return false;
    seen.add(link.domainFrom);
    return true;
  });
}

function collectDomains(links: SeedLink[]) {
  const byDomain = new Map<string, SeedLink[]>();
  for (const link of links) {
    byDomain.set(link.domainFrom, [
      ...(byDomain.get(link.domainFrom) ?? []),
      link,
    ]);
  }
  return [...byDomain.entries()].map(([domain, domainLinks]) => ({
    domain,
    backlinks: domainLinks.length,
    referringPages: domainLinks.length,
    rank: 0,
    spamScore: domainLinks[0]?.spamScore ?? 0,
    firstSeen: domainLinks[0]?.firstSeen ?? null,
    brokenBacklinks: 0,
    brokenPages: 0,
  }));
}

function collectTopPages(links: SeedLink[]) {
  const byPage = new Map<string, SeedLink[]>();
  for (const link of links) {
    byPage.set(link.urlTo, [...(byPage.get(link.urlTo) ?? []), link]);
  }
  return [...byPage.entries()].map(([page, pageLinks]) => ({
    page,
    backlinks: pageLinks.length,
    referringDomains: new Set(pageLinks.map((l) => l.domainFrom)).size,
    rank: 0,
    brokenBacklinks: 0,
  }));
}

function collectAnchors(links: SeedLink[]) {
  const byAnchor = new Map<string, SeedLink[]>();
  for (const link of links) {
    byAnchor.set(link.anchor, [...(byAnchor.get(link.anchor) ?? []), link]);
  }
  return [...byAnchor.entries()].map(([anchor, anchorLinks]) => ({
    anchor,
    backlinks: anchorLinks.length,
    referringDomains: new Set(anchorLinks.map((l) => l.domainFrom)).size,
    rank: 0,
    spamScore: anchorLinks[0]?.spamScore ?? 0,
    firstSeen: anchorLinks[0]?.firstSeen ?? null,
  }));
}

function countNofollowDomains(links: SeedLink[]): number {
  return new Set(
    links.filter((link) => !link.isDofollow).map((link) => link.domainFrom),
  ).size;
}

async function resolveProject(
  db: ReturnType<typeof drizzle<typeof schema>>,
  projectIdArg: string | undefined,
): Promise<{ projectId: string; organizationId: string }> {
  if (projectIdArg) {
    const existing = await db.query.projects.findFirst({
      where: eq(schema.projects.id, projectIdArg),
    });
    if (!existing) {
      console.error(`Project ${projectIdArg} not found in local DB.`);
      process.exit(1);
    }
    return {
      projectId: existing.id,
      organizationId: existing.organizationId,
    };
  }

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.organizationId, LOCAL_ORG_ID),
  });
  if (!project) {
    console.error(
      "No local project found. Run `pnpm seed:rank-tracking` first (it bootstraps\n" +
        "the local_noauth user/org/Default project), or pass --projectId=<uuid>.",
    );
    process.exit(1);
  }
  return { projectId: project.id, organizationId: project.organizationId };
}

await main();
