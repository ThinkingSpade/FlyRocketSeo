import { BacklinksCompareCard } from "./BacklinksCompareCard";
import {
  CompetingDomainsCard,
  LinkIntersectCard,
  ReferringNetworksCard,
} from "./BacklinksGapCards";
import { useBacklinksCompare } from "./useBacklinksCompare";

/**
 * The competitive block of the Backlinks tab: comparison, link gap, competing
 * domains and network concentration.
 *
 * Every query inside is metered and starts disabled. The parent renders this
 * only for a live run — a restored run is meant to cost nothing, and these
 * cards would otherwise offer buttons that spend against a target the user did
 * not just ask for.
 */
export function BacklinksCompareSection({
  projectId,
  target,
}: {
  projectId: string;
  target: string;
}) {
  const compare = useBacklinksCompare({ projectId, target });

  return (
    <>
      <BacklinksCompareCard
        competitors={compare.competitors}
        result={compare.comparisonQuery.data}
        errorMessage={compare.errors.comparison}
        isLoading={compare.comparisonQuery.isLoading && compare.hasCompared}
        hasCompared={compare.hasCompared}
        canCompare={compare.canCompare}
        onAdd={compare.addCompetitor}
        onRemove={compare.removeCompetitor}
        onCompare={() => compare.compare()}
      />

      {compare.hasCompared ? (
        <LinkIntersectCard
          result={compare.intersectQuery.data}
          errorMessage={compare.errors.intersect}
          isLoading={compare.intersectQuery.isFetching}
          target={target}
          onPageChange={compare.setIntersectPage}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <CompetingDomainsCard
          result={compare.competingQuery.data}
          errorMessage={compare.errors.competing}
          isLoading={
            compare.competingQuery.isLoading && compare.hasFoundCompeting
          }
          hasRun={compare.hasFoundCompeting}
          competitors={compare.competitors}
          onRun={() => compare.findCompeting()}
          onAdd={compare.addCompetitor}
        />
        <ReferringNetworksCard
          result={compare.networksQuery.data}
          errorMessage={compare.errors.networks}
          isLoading={
            compare.networksQuery.isLoading && compare.hasLoadedNetworks
          }
          hasRun={compare.hasLoadedNetworks}
          onRun={() => compare.loadNetworks()}
        />
      </div>
    </>
  );
}
