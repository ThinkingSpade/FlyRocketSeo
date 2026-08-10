import type {
  CompetitorRow,
  CompetitorsTab,
  DiscoveryMode,
} from "@/types/schemas/competitors";
import { CompetitorsTable } from "./CompetitorsTable";
import { KeywordGapTable } from "./KeywordGapTable";
import { LinkGapTable } from "./LinkGapTable";
import type {
  useKeywordGapQuery,
  useLinkGapQuery,
} from "./useCompetitorsQueries";

/** Whichever result table the selected tab calls for, or its empty state. */
export function TabBody({
  tab,
  projectId,
  target,
  competitor,
  competitorRows,
  discoveryMode,
  seedSize,
  competitorsState,
  gapQuery,
  linkGapQuery,
  onCompareCompetitor,
}: {
  tab: CompetitorsTab;
  projectId: string;
  target: string;
  competitor: string;
  /** Live rows, or a restored past run's when there is no live query. */
  competitorRows: CompetitorRow[];
  /** Which single mode produced `competitorRows`, live or restored. */
  discoveryMode: DiscoveryMode;
  /** How many seed keywords that answer was drawn from; 0 on the fallback
   *  path. */
  seedSize: number;
  /**
   * Whether those rows are an ANSWER. `competitorRows` is built with
   * `data?.rows ?? restored?.result.rows ?? []`, so a failed discovery, one
   * that never ran, and a genuine zero all arrive here as an empty array —
   * and the table turns that into "No competitors found. Try a domain with
   * more organic visibility", which is a claim about the user's site rather
   * than about our request. This lets the caller say which it was.
   */
  competitorsState: {
    isError: boolean;
    isFetching: boolean;
    hasResult: boolean;
  };
  gapQuery: ReturnType<typeof useKeywordGapQuery>;
  linkGapQuery: ReturnType<typeof useLinkGapQuery>;
  onCompareCompetitor: (domain: string) => void;
}) {
  if (tab === "competitors") {
    // A restored run has rows without a target in the URL, so the prompt to
    // enter one is only right when there is nothing at all to show.
    if (target === "" && competitorRows.length === 0) {
      return (
        <EmptyState message="Enter your domain and hit Analyze to discover organic competitors." />
      );
    }
    // Failure outranks emptiness. Without this, a failed or never-run discovery
    // reaches the table as `[]` and it reports "No competitors found. Try a
    // domain with more organic visibility" — telling the user their site is
    // weak when in fact we never got an answer.
    if (competitorRows.length === 0) {
      if (competitorsState.isError) {
        return (
          <EmptyState message="Couldn't load competitors. Nothing was charged for the failed request — press Analyze to try again." />
        );
      }
      if (competitorsState.isFetching) {
        return <EmptyState message="Discovering competitors…" />;
      }
      if (!competitorsState.hasResult) {
        return (
          <EmptyState message="Press Analyze to discover organic competitors for this domain." />
        );
      }
    }
    return (
      <CompetitorsTable
        rows={competitorRows}
        projectId={projectId}
        discoveryMode={discoveryMode}
        seedSize={seedSize}
        onCompareCompetitor={onCompareCompetitor}
      />
    );
  }

  if (target === "" || competitor === "") {
    return (
      <EmptyState
        message={
          tab === "gap"
            ? "Enter your domain and a competitor domain to compare keyword profiles."
            : "Enter your domain and a competitor domain to find sites that link to them but not to you."
        }
      />
    );
  }

  // Both tables below state something POSITIVE when handed zero rows -- "No
  // keywords found for this comparison", and worse, "No link gap found -- every
  // domain linking to this competitor also links to you". Those are claims
  // about the world, and `data?.rows ?? []` let a query that never ran, or one
  // that failed, make them. A comparison the user has not paid for is not a
  // comparison that came back empty.
  //
  // So the tables are only reached once the provider actually answered. The
  // states are checked in the same precedence `resolveQueryState` uses:
  // failure outranks emptiness, because a failed query has no rows *because it
  // failed*.
  const activeQuery = tab === "gap" ? gapQuery : linkGapQuery;

  if (activeQuery.isError) {
    return (
      <EmptyState
        message={
          tab === "gap"
            ? "Couldn't load the keyword gap. Nothing was charged for the failed request — press Analyze to try again."
            : "Couldn't load the link gap. Nothing was charged for the failed request — press Analyze to try again."
        }
      />
    );
  }

  if (activeQuery.isFetching) {
    return <EmptyState message="Running the comparison…" />;
  }

  // Never run. Deliberately NOT auto-fetched: this is a metered comparison and
  // switching tab or mode invalidates the previous authorization, so the user
  // has to ask for it. Say that, rather than showing an empty result.
  if (activeQuery.data == null) {
    return (
      <EmptyState
        message={
          tab === "gap"
            ? "Press Analyze to run this keyword comparison."
            : "Press Analyze to run this link comparison."
        }
      />
    );
  }

  if (tab === "gap") {
    return (
      <KeywordGapTable
        rows={gapQuery.data?.rows ?? []}
        targetLabel={target}
        competitorLabel={competitor}
      />
    );
  }

  return <LinkGapTable rows={linkGapQuery.data?.rows ?? []} />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-12 text-center text-sm text-base-content/60">
      {message}
    </div>
  );
}
