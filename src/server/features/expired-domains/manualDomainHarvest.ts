import { datesToHarvest } from "@/server/features/expired-domains/domainHarvest";

type HarvestRun = {
  projectId: string;
  droppedOn: string;
};

type ManualHarvestProject = HarvestRun & {
  terms: () => Promise<string[]>;
  exclude: string[];
};

type ManualHarvestExecution = {
  matched: number;
  harvestedRuns: HarvestRun[];
  failedRuns: HarvestRun[];
};

export async function runManualDomainHarvest(input: {
  projectId: string;
  projectDomain: string;
  competitorDomains: string[];
  already: string[];
  today: string;
  resolveTerms: () => Promise<string[]>;
  harvest: (project: ManualHarvestProject) => Promise<ManualHarvestExecution>;
}): Promise<{
  matched: number;
  harvestedDates: string[];
  failedDates: string[];
  terms: string[];
}> {
  const [droppedOn] = datesToHarvest({
    today: input.today,
    already: input.already,
    maxDays: 7,
  });

  if (!droppedOn) {
    return { matched: 0, harvestedDates: [], failedDates: [], terms: [] };
  }

  let resolvedTerms: string[] = [];
  const result = await input.harvest({
    projectId: input.projectId,
    droppedOn,
    terms: async () => {
      resolvedTerms = await input.resolveTerms();
      return resolvedTerms;
    },
    exclude: [
      input.projectDomain.toLowerCase(),
      ...input.competitorDomains.map((domain) => domain.toLowerCase()),
    ],
  });

  return {
    matched: result.matched,
    harvestedDates: result.harvestedRuns.map((run) => run.droppedOn),
    failedDates: result.failedRuns.map((run) => run.droppedOn),
    terms: resolvedTerms,
  };
}
