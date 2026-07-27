import { Link } from "@tanstack/react-router";
import { getCompetitorsList } from "@/serverFunctions/competitors";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { InlineQueryError } from "@/client/components/InlineQueryError";

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
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, domain.trim(), 1),
  );
  const competitorsQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    queryKey: ["domain-competitors-inline", projectId, domain],
    queryFn: () => getCompetitorsList({ data: { projectId, target: domain } }),
  });
  const rows = (competitorsQuery.data?.rows ?? []).slice(0, 5);

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
        {!run.authorized ? (
          <button
            type="button"
            className="btn btn-primary btn-sm self-start"
            onClick={() => run.authorize()}
          >
            Load competitors
          </button>
        ) : competitorsQuery.isLoading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-dots loading-sm" />
          </div>
        ) : competitorsQuery.isError ? (
          <InlineQueryError
            message="Competitors could not be loaded."
            retrying={competitorsQuery.isFetching}
            onRetry={() => void competitorsQuery.refetch()}
          />
        ) : rows.length > 0 ? (
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
        ) : (
          <p className="py-4 text-sm text-base-content/50">
            No organic competitors found.
          </p>
        )}
      </div>
    </div>
  );
}
