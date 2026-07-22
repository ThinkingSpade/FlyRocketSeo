import type {
  CompetitorRow,
  CompetitorsTab,
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
  target,
  competitor,
  competitorRows,
  gapQuery,
  linkGapQuery,
  onCompareCompetitor,
}: {
  tab: CompetitorsTab;
  target: string;
  competitor: string;
  /** Live rows, or a restored past run's when there is no live query. */
  competitorRows: CompetitorRow[];
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
    return (
      <CompetitorsTable
        rows={competitorRows}
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
