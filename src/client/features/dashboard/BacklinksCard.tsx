import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { getBacklinksOverview } from "@/serverFunctions/backlinks";
import {
  formatDecimal,
  formatNumber,
} from "@/client/features/backlinks/backlinksPageUtils";
import { StatCard } from "@/client/features/audit/shared";
import {
  CardEmpty,
  CardError,
  CardTilesSkeleton,
  DashboardCard,
  useProjectNavLinks,
} from "./dashboardShared";

export function BacklinksCard({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string | null;
}) {
  const nav = useProjectNavLinks(projectId);
  const backlinksLink = nav.get("/p/$projectId/backlinks").linkProps;

  // getBacklinksOverview is a metered DataForSEO call (real money per call), so
  // it is NEVER auto-fired: the query only runs once the user opts in.
  const [loadRequested, setLoadRequested] = useState(false);
  const overviewQuery = useQuery({
    queryKey: ["backlinksOverview", projectId, domain],
    queryFn: () =>
      getBacklinksOverview({
        data: { projectId, target: domain!, scope: "domain" },
      }),
    enabled: loadRequested && domain !== null,
    // A paid call — never silently refetch once we have a result.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const summary = overviewQuery.data?.summary ?? null;

  return (
    <DashboardCard icon={Link2} title="Backlinks" headerLink={backlinksLink}>
      {domain === null ? (
        <CardEmpty>
          Set a domain for this project to load its backlink profile.
        </CardEmpty>
      ) : !loadRequested ? (
        <div className="px-2 py-4 text-center">
          <p className="text-sm text-base-content/70">
            Backlink data for{" "}
            <span className="font-medium text-base-content">{domain}</span>{" "}
            isn&apos;t loaded automatically.
          </p>
          <p className="mt-1 text-xs text-base-content/50">
            Uses one metered DataForSEO request.
          </p>
          <button
            type="button"
            className="btn btn-outline btn-sm mt-3"
            onClick={() => setLoadRequested(true)}
          >
            Load backlink summary
          </button>
        </div>
      ) : overviewQuery.isError ? (
        <div className="space-y-3">
          <CardError error={overviewQuery.error} />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void overviewQuery.refetch()}
          >
            Try again
          </button>
        </div>
      ) : overviewQuery.isPending || summary === null ? (
        <CardTilesSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Backlinks" value={formatNumber(summary.backlinks)} />
          <StatCard
            label="Ref. domains"
            value={formatNumber(summary.referringDomains)}
          />
          <StatCard label="Rank" value={formatNumber(summary.rank)} />
          <StatCard
            label="Spam score"
            value={formatDecimal(summary.backlinksSpamScore)}
          />
        </div>
      )}
    </DashboardCard>
  );
}
