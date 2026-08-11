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
 * Every query inside is metered and starts disabled: each one is gated on its
 * own `useAuthorizedRun`, which is false until that card's button is clicked.
 * That per-card authorization is why this renders for a restored run too —
 * showing the launchers costs nothing, and hiding them would have left a
 * restored run with no way to reach the competitive tools at all.
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
