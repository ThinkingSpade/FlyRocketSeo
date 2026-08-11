import { Users } from "@phosphor-icons/react";
import { DataFreshness } from "@/client/components/DataFreshness";

/**
 * The page's own title/description plus the active tab's freshness/refresh
 * control -- pulled out of `CompetitorsPage` to keep that file under this
 * repo's line-count cap, the same reason `CompetitorsRestoreNotice` and
 * `CompetitorsOverviewExtras` were split out. Purely presentational: every
 * prop is already resolved by the caller.
 */
export function CompetitorsPageHeader({
  fetchedAt,
  onRefresh,
  refreshing,
}: {
  fetchedAt: string | undefined;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Users className="size-6" />
          Competitor Insights
        </h1>
        <p className="text-sm text-base-content/60">
          Discover who you compete with in organic search and find the keywords
          and links they have that you don&apos;t.
        </p>
      </div>
      <DataFreshness
        fetchedAt={fetchedAt}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
    </div>
  );
}
