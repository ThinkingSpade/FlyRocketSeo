import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rankCheckRuns } from "@/db/schema";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";

// ---------------------------------------------------------------------------
// Pure core (no I/O, no Date.now, no randomness — fully deterministic)
// ---------------------------------------------------------------------------

export interface RankMover {
  keyword: string;
  searchVolume: number | null;
  previousPosition: number | null;
  currentPosition: number | null;
  /** previousPosition - currentPosition; POSITIVE = moved up. null when a side
   *  is absent (added/lost), since you can't subtract through a missing rank. */
  delta: number | null;
}

export interface RankDigest {
  improved: RankMover[];
  declined: RankMover[];
  added: RankMover[];
  lost: RankMover[];
  improvedCount: number;
  declinedCount: number;
  addedCount: number;
  lostCount: number;
}

export interface RankDigestMeta {
  /** keyword -> search volume, used only to rank added/lost movers. */
  searchVolume?: Map<string, number | null>;
}

const byKeyword = (a: RankMover, b: RankMover) =>
  a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0;
const byVolumeDesc = (a: RankMover, b: RankMover) =>
  (b.searchVolume ?? -Infinity) - (a.searchVolume ?? -Infinity) ||
  byKeyword(a, b);

/**
 * Diff two runs' per-keyword positions into a mover digest. Positions are
 * keyed by keyword; LOWER position is better; `null` (or an absent key) means
 * the keyword did not rank within the tracked depth for that run.
 *
 * Classification (mirrors the 4-case null rules in rankTrackingScorecards):
 *   - both present & current < previous  -> improved (moved up)
 *   - both present & current > previous  -> declined (moved down)
 *   - previous null/absent & current set -> added
 *   - previous set & current null/absent -> lost
 *   - both null/absent, or unchanged     -> ignored
 *
 * Sorting: improved by largest positive delta, declined by largest negative
 * delta, added/lost by search volume desc. Ties break on keyword for stable,
 * deterministic output.
 */
export function computeRankDigest(
  previous: Map<string, number | null>,
  latest: Map<string, number | null>,
  meta?: RankDigestMeta,
): RankDigest {
  const improved: RankMover[] = [];
  const declined: RankMover[] = [];
  const added: RankMover[] = [];
  const lost: RankMover[] = [];

  // Absent key and an explicit null both mean "not ranking", so coalescing to
  // null lets classification treat them identically.
  const keywords = new Set<string>([...previous.keys(), ...latest.keys()]);
  for (const keyword of keywords) {
    const previousPosition = previous.get(keyword) ?? null;
    const currentPosition = latest.get(keyword) ?? null;
    const searchVolume = meta?.searchVolume?.get(keyword) ?? null;

    const base = { keyword, searchVolume, previousPosition, currentPosition };

    if (previousPosition !== null && currentPosition !== null) {
      const delta = previousPosition - currentPosition;
      if (delta > 0) improved.push({ ...base, delta });
      else if (delta < 0) declined.push({ ...base, delta });
      // delta === 0 -> unchanged, ignored
    } else if (previousPosition === null && currentPosition !== null) {
      added.push({ ...base, delta: null });
    } else if (previousPosition !== null && currentPosition === null) {
      lost.push({ ...base, delta: null });
    }
    // both null -> ignored
  }

  improved.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0) || byKeyword(a, b));
  declined.sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0) || byKeyword(a, b));
  added.sort(byVolumeDesc);
  lost.sort(byVolumeDesc);

  return {
    improved,
    declined,
    added,
    lost,
    improvedCount: improved.length,
    declinedCount: declined.length,
    addedCount: added.length,
    lostCount: lost.length,
  };
}

// ---------------------------------------------------------------------------
// Service (compute-on-read from existing snapshots — no writes, no migrations)
// ---------------------------------------------------------------------------

export interface ConfigRankDigest extends RankDigest {
  configId: string;
  domain: string;
  /** Timestamp of the latest completed run compared, or null when none. */
  latestRunAt: string | null;
}

// Diff desktop positions to match the dashboard's existing
// `computeScorecards(rows, "desktop")` choice, so the card and the digest tell
// the same story.
const DIGEST_DEVICE = "desktop" as const;

/**
 * The two most recent full (non-subset) completed runs for a config, newest
 * first. Subset runs re-check only a slice of keywords, so they'd read as mass
 * "lost" movers against a full run — excluded here, matching getConfigTrend /
 * getPositionMatrix.
 */
async function twoMostRecentCompletedRuns(configId: string) {
  return db
    .select({ id: rankCheckRuns.id, completedAt: rankCheckRuns.completedAt })
    .from(rankCheckRuns)
    .where(
      and(
        eq(rankCheckRuns.configId, configId),
        eq(rankCheckRuns.status, "completed"),
        eq(rankCheckRuns.isSubsetRun, false),
      ),
    )
    .orderBy(desc(rankCheckRuns.startedAt))
    .limit(2);
}

function positionsForRun(
  snapshots: Awaited<
    ReturnType<typeof RankTrackingRepository.getSnapshotsForRun>
  >,
): Map<string, number | null> {
  const positions = new Map<string, number | null>();
  for (const snapshot of snapshots) {
    if (snapshot.device !== DIGEST_DEVICE) continue;
    positions.set(snapshot.keyword, snapshot.position);
  }
  return positions;
}

async function digestForConfig(config: {
  id: string;
  domain: string;
}): Promise<ConfigRankDigest> {
  const runs = await twoMostRecentCompletedRuns(config.id);
  // Fewer than two completed runs -> nothing to compare yet. Include the config
  // with an empty digest (zero counts), surfacing the latest run time if any
  // so the card can say "compared after the next check".
  const latestRunAt = runs[0]?.completedAt ?? null;
  const empty = computeRankDigest(new Map(), new Map());
  if (runs.length < 2) {
    return {
      configId: config.id,
      domain: config.domain,
      latestRunAt,
      ...empty,
    };
  }

  const [latestRun, previousRun] = runs;
  const [latestSnapshots, previousSnapshots, keywords] = await Promise.all([
    RankTrackingRepository.getSnapshotsForRun(latestRun.id),
    RankTrackingRepository.getSnapshotsForRun(previousRun.id),
    RankTrackingRepository.getKeywordsForConfig(config.id),
  ]);

  const searchVolume = new Map<string, number | null>(
    keywords.map((kw) => [kw.keyword, kw.searchVolume]),
  );
  const digest = computeRankDigest(
    positionsForRun(previousSnapshots),
    positionsForRun(latestSnapshots),
    { searchVolume },
  );

  return { configId: config.id, domain: config.domain, latestRunAt, ...digest };
}

async function getRankChangeDigest(projectId: string): Promise<{
  configs: ConfigRankDigest[];
  latestRunAt: string | null;
}> {
  const configs = await RankTrackingRepository.getConfigsForProject(projectId);
  const digests = await Promise.all(configs.map(digestForConfig));

  // Most recent run time across all configs, for the card's freshness cue.
  const latestRunAt = digests.reduce<string | null>((latest, digest) => {
    if (!digest.latestRunAt) return latest;
    return !latest || digest.latestRunAt > latest ? digest.latestRunAt : latest;
  }, null);

  return { configs: digests, latestRunAt };
}

export const rankDigestService = {
  getRankChangeDigest,
};
