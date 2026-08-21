import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm";
import type * as AppSchema from "@/db/app.schema";

type HarvestedDomainRow = typeof AppSchema.harvestedDomains.$inferSelect;
const DOMAIN_RATING_LEASE_MS = 2 * 60 * 1_000;

/**
 * Load provider-bound storage at the call boundary. Keeping these imports
 * dynamic prevents Node Vitest consumers of this repository from statically
 * pulling in `cloudflare:workers` through the D1 client.
 */
async function getStorage() {
  const [{ db }, { harvestedDomains }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  return { db, harvestedDomains };
}

type HarvestedDomainsTable = Awaited<
  ReturnType<typeof getStorage>
>["harvestedDomains"];

function candidateFilter(
  harvestedDomains: HarvestedDomainsTable,
  projectId: string | null,
  maxAttempts: number,
  nowIso: string,
  domains: string[] | null,
) {
  return and(
    isNull(harvestedDomains.domainRating),
    lt(harvestedDomains.domainRatingAttempts, maxAttempts),
    or(
      isNull(harvestedDomains.domainRatingClaimId),
      lte(harvestedDomains.domainRatingLeaseExpiresAt, nowIso),
    ),
    projectId === null ? undefined : eq(harvestedDomains.projectId, projectId),
    domains && domains.length > 0
      ? inArray(harvestedDomains.domain, domains)
      : undefined,
  );
}

/** Retryable rows still awaiting a DR grade, newest first. */
async function listCandidates(
  projectId: string | null,
  limit: number,
  maxAttempts: number,
  nowIso = new Date().toISOString(),
  domains: string[] | null = null,
): Promise<HarvestedDomainRow[]> {
  const { db, harvestedDomains } = await getStorage();
  return db
    .select()
    .from(harvestedDomains)
    .where(
      candidateFilter(
        harvestedDomains,
        projectId,
        maxAttempts,
        nowIso,
        domains,
      ),
    )
    .orderBy(desc(harvestedDomains.createdAt))
    .limit(limit);
}

/** Count every unknown row in the action scope, including exhausted attempts. */
async function countUngraded(
  projectId: string | null,
  domains: string[] | null,
): Promise<number> {
  const { db, harvestedDomains } = await getStorage();
  const [row] = await db
    .select({ value: count() })
    .from(harvestedDomains)
    .where(
      and(
        isNull(harvestedDomains.domainRating),
        projectId === null
          ? undefined
          : eq(harvestedDomains.projectId, projectId),
        domains && domains.length > 0
          ? inArray(harvestedDomains.domain, domains)
          : undefined,
      ),
    );
  return row?.value ?? 0;
}

/**
 * Compare-and-swap one DR attempt.
 *
 * The expected count and expired/unowned lease come from the queue read. The
 * token fences completion and release, so a crashed invocation cannot mutate a
 * later owner's result after its lease has been replaced.
 */
async function claimAttempt(
  candidate: Pick<HarvestedDomainRow, "id" | "domainRatingAttempts">,
  maxAttempts: number,
  claimedAtIso = new Date().toISOString(),
  claimId: string = crypto.randomUUID(),
): Promise<string | null> {
  const { db, harvestedDomains } = await getStorage();
  const leaseExpiresAtIso = new Date(
    Date.parse(claimedAtIso) + DOMAIN_RATING_LEASE_MS,
  ).toISOString();
  const [claimed] = await db
    .update(harvestedDomains)
    .set({
      domainRatingAttempts: candidate.domainRatingAttempts + 1,
      domainRatingClaimId: claimId,
      domainRatingLeaseExpiresAt: leaseExpiresAtIso,
    })
    .where(
      and(
        eq(harvestedDomains.id, candidate.id),
        isNull(harvestedDomains.domainRating),
        eq(
          harvestedDomains.domainRatingAttempts,
          candidate.domainRatingAttempts,
        ),
        lt(harvestedDomains.domainRatingAttempts, maxAttempts),
        or(
          isNull(harvestedDomains.domainRatingClaimId),
          lte(harvestedDomains.domainRatingLeaseExpiresAt, claimedAtIso),
        ),
      ),
    )
    .returning({ id: harvestedDomains.id });

  return claimed ? claimId : null;
}

/** Store a known rating only while the caller still owns the fencing token. */
async function completeAttempt(input: {
  id: string;
  claimId: string;
  rating: number;
}): Promise<boolean> {
  const { db, harvestedDomains } = await getStorage();
  const [completed] = await db
    .update(harvestedDomains)
    .set({
      domainRating: input.rating,
      domainRatingClaimId: null,
      domainRatingLeaseExpiresAt: null,
    })
    .where(
      and(
        eq(harvestedDomains.id, input.id),
        isNull(harvestedDomains.domainRating),
        eq(harvestedDomains.domainRatingClaimId, input.claimId),
      ),
    )
    .returning({ id: harvestedDomains.id });
  return Boolean(completed);
}

/** Release a failed lookup without refunding its already-consumed attempt. */
async function releaseAttempt(input: {
  id: string;
  claimId: string;
}): Promise<boolean> {
  const { db, harvestedDomains } = await getStorage();
  const [released] = await db
    .update(harvestedDomains)
    .set({
      domainRatingClaimId: null,
      domainRatingLeaseExpiresAt: null,
    })
    .where(
      and(
        eq(harvestedDomains.id, input.id),
        isNull(harvestedDomains.domainRating),
        eq(harvestedDomains.domainRatingClaimId, input.claimId),
      ),
    )
    .returning({ id: harvestedDomains.id });
  return Boolean(released);
}

export const DomainRatingQueueRepository = {
  listCandidates,
  countUngraded,
  claimAttempt,
  completeAttempt,
  releaseAttempt,
} as const;
