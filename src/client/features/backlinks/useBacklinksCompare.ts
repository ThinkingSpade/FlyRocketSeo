import { useCallback, useMemo, useState } from "react";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getBacklinksCompetingDomains,
  getBacklinksComparison,
  getBacklinksLinkIntersect,
  getBacklinksReferringNetworks,
} from "@/serverFunctions/backlinks";
import { MAX_COMPARE_COMPETITORS } from "@/types/schemas/backlinks-compare";
import { normalizeComparisonTarget } from "@/shared/backlink-targets";

/**
 * State and queries for the competitive half of the Backlinks tab.
 *
 * Every query here is metered, so each one sits behind its own explicit
 * authorization: adding a competitor chip or paging the intersect table must
 * never spend on its own. "Compare" authorizes the comparison and the intersect
 * together because they answer one question; discovering competitors and the
 * network breakdown are separate one-call actions with their own buttons.
 */

type CompareErrors = {
  comparison: string | null;
  intersect: string | null;
  competing: string | null;
  networks: string | null;
};

export function useBacklinksCompare({
  projectId,
  target,
}: {
  projectId: string;
  target: string;
}) {
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [intersectPage, setIntersectPage] = useState(1);

  // The comparison is keyed on the exact competitor set, so editing the chips
  // after a run drops the authorization and the table stops refetching until
  // "Compare" is pressed again.
  const compareKey = createMeteredRunKey(
    projectId,
    target,
    [...competitors].toSorted(),
  );
  const compareRun = useAuthorizedRun(compareKey);
  const competingRun = useAuthorizedRun(
    createMeteredRunKey(projectId, target, "competing"),
  );
  const networksRun = useAuthorizedRun(
    createMeteredRunKey(projectId, target, "networks"),
  );

  const addCompetitor = useCallback((value: string) => {
    const normalized = normalizeComparisonTarget(value);
    if (normalized === "" || !normalized.includes(".")) return false;
    let added = false;
    setCompetitors((previous) => {
      if (
        previous.includes(normalized) ||
        previous.length >= MAX_COMPARE_COMPETITORS
      ) {
        return previous;
      }
      added = true;
      return [...previous, normalized];
    });
    // Reset paging so a changed competitor set never shows page 3 of the old
    // one; the query is disabled until "Compare" anyway.
    setIntersectPage(1);
    return added;
  }, []);

  const removeCompetitor = useCallback((value: string) => {
    setCompetitors((previous) =>
      previous.filter((competitor) => competitor !== value),
    );
    setIntersectPage(1);
  }, []);

  const canCompare = competitors.length > 0 && target.trim() !== "";
  const comparisonQuery = useMeteredQuery({
    authorized: compareRun.authorized,
    runNonce: compareRun.runNonce,
    queryKey: ["backlinksComparison", projectId, target, competitors],
    enabled: canCompare,
    queryFn: () =>
      getBacklinksComparison({ data: { projectId, target, competitors } }),
  });

  const intersectQuery = useMeteredQuery({
    authorized: compareRun.authorized,
    runNonce: compareRun.runNonce,
    queryKey: [
      "backlinksLinkIntersect",
      projectId,
      target,
      competitors,
      intersectPage,
    ],
    enabled: canCompare,
    queryFn: () =>
      getBacklinksLinkIntersect({
        data: { projectId, target, competitors, page: intersectPage },
      }),
  });

  const competingQuery = useMeteredQuery({
    authorized: competingRun.authorized,
    runNonce: competingRun.runNonce,
    queryKey: ["backlinksCompetingDomains", projectId, target],
    enabled: target.trim() !== "",
    queryFn: () =>
      getBacklinksCompetingDomains({ data: { projectId, target } }),
  });

  const networksQuery = useMeteredQuery({
    authorized: networksRun.authorized,
    runNonce: networksRun.runNonce,
    queryKey: ["backlinksReferringNetworks", projectId, target],
    enabled: target.trim() !== "",
    queryFn: () =>
      getBacklinksReferringNetworks({ data: { projectId, target } }),
  });

  const errors = useMemo<CompareErrors>(
    () => ({
      comparison: toMessage(
        comparisonQuery.error,
        "Could not compare domains.",
      ),
      intersect: toMessage(
        intersectQuery.error,
        "Could not load the link gap.",
      ),
      competing: toMessage(
        competingQuery.error,
        "Could not find competing domains.",
      ),
      networks: toMessage(
        networksQuery.error,
        "Could not load referring networks.",
      ),
    }),
    [
      comparisonQuery.error,
      competingQuery.error,
      intersectQuery.error,
      networksQuery.error,
    ],
  );

  return {
    competitors,
    addCompetitor,
    removeCompetitor,
    canCompare,
    compare: compareRun.authorize,
    hasCompared: compareRun.authorized,
    findCompeting: competingRun.authorize,
    hasFoundCompeting: competingRun.authorized,
    loadNetworks: networksRun.authorize,
    hasLoadedNetworks: networksRun.authorized,
    intersectPage,
    setIntersectPage,
    comparisonQuery,
    intersectQuery,
    competingQuery,
    networksQuery,
    errors,
  };
}

function toMessage(error: unknown, fallback: string): string | null {
  return error ? getStandardErrorMessage(error, fallback) : null;
}
