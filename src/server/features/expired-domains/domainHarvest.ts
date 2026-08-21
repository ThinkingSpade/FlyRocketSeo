import { createVocabularyMatcher } from "@/shared/domainVocabularyMatch";

/**
 * Pulls daily dropped-domain feeds and fans each date out to every interested
 * project without materializing the feed. All I/O is injected so Node tests do
 * not import the Worker runtime.
 */

/** Per-project ceiling on rows one day may add. */
export const MAX_MATCHES_PER_DAY = 300;

/**
 * Longer than the 15-minute cron interval so a legitimate overlapping tick
 * cannot steal an in-flight run. Known failures release immediately; this
 * expiry is only the crash recovery path.
 */
const HARVEST_LEASE_MS = 30 * 60 * 1000;

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Which dates still need pulling, newest first. */
export function datesToHarvest(input: {
  today: string;
  already: string[];
  maxDays: number;
}): string[] {
  const alreadyHarvested = new Set(input.already);
  const todayMs = Date.parse(`${input.today}T00:00:00Z`);
  const dates: string[] = [];

  for (let back = 1; back <= input.maxDays; back += 1) {
    const date = toIsoDate(todayMs - back * 86_400_000);
    if (!alreadyHarvested.has(date)) dates.push(date);
  }

  return dates;
}

type ProjectHarvest = {
  projectId: string;
  droppedOn: string;
  terms: string[];
  exclude: string[];
};

type HarvestRunRef = Pick<ProjectHarvest, "projectId" | "droppedOn">;

type HarvestResult = {
  harvestedRuns: HarvestRunRef[];
  failedRuns: HarvestRunRef[];
  matched: number;
};

type ClaimedHarvest = {
  project: ProjectHarvest;
  claimId: string;
  matcher: ReturnType<typeof createVocabularyMatcher>;
  active: boolean;
};

export async function harvestDroppedDomains(input: {
  projects: ProjectHarvest[];
  now: () => Date;
  /** Atomically claims a project/date, returning its fencing token. */
  claimRun: (input: {
    projectId: string;
    droppedOn: string;
    claimedAtIso: string;
    leaseExpiresAtIso: string;
  }) => Promise<string | null>;
  /** Completes only when `claimId` still owns the row. */
  completeRun: (input: {
    claimId: string;
    matched: number;
    completedAtIso: string;
  }) => Promise<boolean>;
  /** Releases only the row still owned by this fencing token. */
  releaseRun: (claimId: string) => Promise<void>;
  /** Streams a date once; false cancels only when every matcher is full. */
  streamDropped: (
    date: string,
    onDomain: (domain: string) => boolean,
  ) => Promise<void>;
  insertMatches: (
    rows: Array<{
      id: string;
      projectId: string;
      domain: string;
      matchedTerm: string;
      droppedOn: string;
    }>,
  ) => Promise<void>;
}): Promise<HarvestResult> {
  const harvestedRuns: HarvestRunRef[] = [];
  const failedRuns: HarvestRunRef[] = [];
  let matched = 0;

  const projectsByDate = new Map<string, ProjectHarvest[]>();
  for (const project of input.projects) {
    if (project.terms.length === 0) continue;
    const projects = projectsByDate.get(project.droppedOn) ?? [];
    projects.push(project);
    projectsByDate.set(project.droppedOn, projects);
  }

  const releaseQuietly = async (claimId: string): Promise<void> => {
    try {
      await input.releaseRun(claimId);
    } catch {
      // A failed release leaves an expiring lease, never a permanently wedged row.
    }
  };

  for (const [date, projects] of projectsByDate) {
    // Claim immediately before this date's stream. Claiming every backlog date
    // up front could let later claims expire while earlier files download.
    const claimedAt = input.now();
    const claimedAtIso = claimedAt.toISOString();
    const leaseExpiresAtIso = new Date(
      claimedAt.getTime() + HARVEST_LEASE_MS,
    ).toISOString();
    const claimed: ClaimedHarvest[] = [];

    for (const project of projects) {
      const runRef = {
        projectId: project.projectId,
        droppedOn: project.droppedOn,
      };
      let claimId: string | null;
      try {
        claimId = await input.claimRun({
          ...runRef,
          claimedAtIso,
          leaseExpiresAtIso,
        });
      } catch {
        failedRuns.push(runRef);
        continue;
      }
      // Another tick owns it, or it completed after this tick's earlier read.
      if (!claimId) continue;

      try {
        claimed.push({
          project,
          claimId,
          matcher: createVocabularyMatcher({
            terms: project.terms,
            exclude: project.exclude,
            limit: MAX_MATCHES_PER_DAY,
          }),
          active: true,
        });
      } catch {
        await releaseQuietly(claimId);
        failedRuns.push(runRef);
      }
    }

    if (claimed.length === 0) continue;

    try {
      await input.streamDropped(date, (domain) => {
        let anyActive = false;
        for (const run of claimed) {
          if (!run.active) continue;
          run.active = run.matcher.accept(domain);
          if (run.active) anyActive = true;
        }
        return anyActive;
      });
    } catch {
      await Promise.allSettled(
        claimed.map((run) => input.releaseRun(run.claimId)),
      );
      failedRuns.push(
        ...claimed.map(({ project }) => ({
          projectId: project.projectId,
          droppedOn: project.droppedOn,
        })),
      );
      continue;
    }

    for (const run of claimed) {
      const runRef = {
        projectId: run.project.projectId,
        droppedOn: run.project.droppedOn,
      };
      const matches = run.matcher.matches;
      try {
        await input.insertMatches(
          matches.map((match) => ({
            id: crypto.randomUUID(),
            projectId: run.project.projectId,
            domain: match.domain,
            matchedTerm: match.matchedTerm,
            droppedOn: date,
          })),
        );
        const completed = await input.completeRun({
          claimId: run.claimId,
          matched: matches.length,
          completedAtIso: input.now().toISOString(),
        });
        if (!completed) throw new Error("HARVEST_CLAIM_LOST");
      } catch {
        await releaseQuietly(run.claimId);
        failedRuns.push(runRef);
        continue;
      }

      harvestedRuns.push(runRef);
      matched += matches.length;
    }
  }

  return { harvestedRuns, failedRuns, matched };
}
