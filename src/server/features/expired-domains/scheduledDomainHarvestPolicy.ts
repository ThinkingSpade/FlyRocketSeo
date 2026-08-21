import { datesToHarvest } from "@/server/features/expired-domains/domainHarvest";

const BACKFILL_DAYS = 7;
const SCHEDULE_SLOT_MS = 15 * 60 * 1_000;

export type ScheduledHarvestProjectState = {
  id: string;
  domain: string;
  completedDates: string[];
};

export type ScheduledHarvestCandidate = {
  projectId: string;
  domain: string;
  droppedOn: string;
};

export function selectScheduledHarvestCandidate(input: {
  projects: ScheduledHarvestProjectState[];
  publishedDate: string;
  scheduledAtMs: number;
}): ScheduledHarvestCandidate | null {
  const candidates = input.projects
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

  if (candidates.length === 0) return null;
  const slot = Math.floor(input.scheduledAtMs / SCHEDULE_SLOT_MS);
  return (
    candidates[
      ((slot % candidates.length) + candidates.length) % candidates.length
    ] ?? null
  );
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
    grade(): Promise<void>;
  },
): Promise<"harvest" | "grade"> {
  if (input.canHarvest) {
    const projects = await dependencies.listProjectStates();
    const selected = selectScheduledHarvestCandidate({
      projects,
      publishedDate: input.publishedDate,
      scheduledAtMs: input.scheduledAtMs,
    });
    if (selected) {
      await dependencies.harvestProject(selected);
      return "harvest";
    }
  }

  await dependencies.grade();
  return "grade";
}
