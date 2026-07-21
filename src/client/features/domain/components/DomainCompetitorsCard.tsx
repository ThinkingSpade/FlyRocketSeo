import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getCompetitorsList } from "@/serverFunctions/competitors";

function formatCount(value: number | null): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

/** Semrush-style "main organic competitors" inline on the overview — the
 *  domains fighting for the same keywords, with a jump to the full tab. */
export function DomainCompetitorsCard({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const competitorsQuery = useQuery({
    queryKey: ["domain-competitors-inline", projectId, domain],
    queryFn: () => getCompetitorsList({ data: { projectId, target: domain } }),
    staleTime: 30 * 60_000,
  });
  const rows = (competitorsQuery.data?.rows ?? []).slice(0, 5);
  if (!competitorsQuery.isLoading && rows.length === 0) return null;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-base-content/60">
            Top organic competitors
          </p>
          <Link
            to="/p/$projectId/competitors"
            params={{ projectId }}
            className="btn btn-ghost btn-xs"
          >
            Full analysis
          </Link>
        </div>
        {competitorsQuery.isLoading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-dots loading-sm" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th className="text-right">Shared keywords</th>
                  <th className="text-right">Their keywords</th>
                  <th className="text-right">Their traffic</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.domain}>
                    <td className="max-w-xs">
                      <span className="line-clamp-1 font-medium">
                        {row.domain}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">
                      {formatCount(row.intersections)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatCount(row.organicKeywords)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatCount(row.organicTraffic)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
