import { datesToHarvest } from "@/server/features/expired-domains/domainHarvest";
import type { HarvestReadiness } from "@/server/features/expired-domains/harvestReadiness";

const BACKFILL_DAYS = 7;
const SCHEDULE_SLOT_MS = 15 * 60 * 1_000;

export type ScheduledHarvestProjectState = {
  id: string;
  domain: string;
  completedDates: string[];
  readiness: HarvestReadiness["kind"];
};

export type ScheduledHarvestCandidate = {
  projectId: string;
  domain: string;
  droppedOn: string;
};

type ScheduledDraftCandidate = {
  projectId: string;
  domain: string;
};

/**
 * The tick that grades no matter what else is pending.
 *
 * Harvest-before-grade is the right order while every harvest completes, but a
 * harvest that cannot complete -- a feed outage, or a project with nothing to
 * match against -- stays pending, and the old policy then chose it on every
 * tick and graded nothing, ever. Reserving the last harvest tick of each hour
 * (:45, see cronDispatch) caps that failure at a third of the ticks instead of
 * all of them, while leaving two ticks an hour for harvesting, which needs
 * only one per project per day.
 */
export function isGradingReservedTick(scheduledAtMs: number): boolean {
  return new Date(scheduledAtMs).getUTCMinutes() >= 45;
}

/**
 * The tick that may spend on DataForSEO link metrics: :30, once nothing is
 * waiting to harvest. One tick an hour, not every tick, so a DataForSEO outage
 * or balance problem costs at most 24 failed attempts a day rather than 72.
 */
function isLinkMetricsTick(scheduledAtMs: number): boolean {
  const minutes = new Date(scheduledAtMs).getUTCMinutes();
  return minutes >= 30 && minutes < 45;
}

function rotate<T>(candidates: T[], scheduledAtMs: number): T | null {
  if (candidates.length === 0) return null;
  const slot = Math.floor(scheduledAtMs / SCHEDULE_SLOT_MS);
  return (
    candidates[
      ((slot % candidates.length) + candidates.length) % candidates.length
    ] ?? null
  );
}

export function selectScheduledHarvestCandidate(input: {
  projects: ScheduledHarvestProjectState[];
  publishedDate: string;
  scheduledAtMs: number;
}): ScheduledHarvestCandidate | null {
  const candidates = input.projects
    // A project with no vocabulary cannot complete a harvest, so it must not
    // be a candidate: it would be chosen, fail, and be chosen again.
    .filter((project) => project.readiness === "ready")
    .map((project) => {
      const pendingDates = datesToHarvest({
        today: input.publishedDate,
        already: project.completedDates,
        maxDays: BACKFILL_DAYS,
      });
      // Oldest first protects the date most likely to age out of the feed.
      const droppedOn = pendingDates.at(-1);
      return droppedOn
        ? { projectId: project.id, domain: project.domain, droppedOn }
        : null;
    })
    .filter((candidate): candidate is ScheduledHarvestCandidate =>
      Boolean(candidate),
    )
    .toSorted(
      (left, right) =>
        left.droppedOn.localeCompare(right.droppedOn) ||
        left.projectId.localeCompare(right.projectId),
    );

  return rotate(candidates, input.scheduledAtMs);
}

/** A project whose profile the cron should draft so it can start harvesting. */
function selectProfileDraftCandidate(input: {
  projects: ScheduledHarvestProjectState[];
  scheduledAtMs: number;
}): ScheduledDraftCandidate | null {
  const candidates = input.projects
    .filter((project) => project.readiness === "draft-due")
    .map((project) => ({ projectId: project.id, domain: project.domain }))
    .toSorted((left, right) => left.projectId.localeCompare(right.projectId));
  return rotate(candidates, input.scheduledAtMs);
}

export async function runScheduledDomainWork(
  input: {
    canHarvest: boolean;
    publishedDate: string;
    scheduledAtMs: number;
  },
  dependencies: {
    listProjectStates(): Promise<ScheduledHarvestProjectState[]>;
    harvestProject(candidate: ScheduledHarvestCandidate): Promise<void>;
    draftProfile(candidate: ScheduledDraftCandidate): Promise<void>;
    /** Resolves false when no project has unchecked domains. */
    refreshLinkMetrics(): Promise<boolean>;
    grade(): Promise<void>;
  },
): Promise<"harvest" | "links" | "draft" | "grade"> {
  if (!isGradingReservedTick(input.scheduledAtMs)) {
    const projects = input.canHarvest
      ? await dependencies.listProjectStates()
      : [];
    const selected = selectScheduledHarvestCandidate({
      projects,
      publishedDate: input.publishedDate,
      scheduledAtMs: input.scheduledAtMs,
    });
    if (selected) {
      await dependencies.harvestProject(selected);
      return "harvest";
    }

    // After the day's harvest, so a new day's rows are checked the same
    // morning. Independent of the feed key: rows already stored still deserve
    // metrics after the subscription ends.
    if (
      isLinkMetricsTick(input.scheduledAtMs) &&
      (await dependencies.refreshLinkMetrics())
    ) {
      return "links";
    }

    // Only once nothing is waiting to harvest: a draft is a one-off per new
    // project, while a pending date can age out of the feed.
    const draft = selectProfileDraftCandidate({
      projects,
      scheduledAtMs: input.scheduledAtMs,
    });
    if (draft) {
      await dependencies.draftProfile(draft);
      return "draft";
    }
  }

  await dependencies.grade();
  return "grade";
}
