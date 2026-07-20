import { Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { Check, ExternalLink, Waypoints } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { checkLinkPresence } from "@/serverFunctions/link-insights";
import {
  toPath,
  useLinkInsights,
} from "@/client/features/link-insights/useLinkInsights";

type PresenceResult = {
  linksToTarget: boolean;
  mentionsPhrase: boolean;
  error: string | null;
};

function PresenceBadge({ presence }: { presence: PresenceResult | undefined }) {
  if (presence === undefined) {
    return <span className="loading loading-dots loading-xs" />;
  }
  if (presence.error) {
    return (
      <span className="badge badge-ghost badge-sm" title={presence.error}>
        couldn&rsquo;t check
      </span>
    );
  }
  if (presence.linksToTarget) {
    return (
      <span className="badge badge-ghost badge-sm gap-1">
        <Check className="size-3" /> already links
      </span>
    );
  }
  if (presence.mentionsPhrase) {
    return (
      <span
        className="badge badge-success badge-sm"
        title="This page already mentions the phrase — ideal place to add the link"
      >
        add link — mentions phrase
      </span>
    );
  }
  return <span className="badge badge-warning badge-sm">add link</span>;
}

export function LinkOpportunitiesPage({ projectId }: { projectId: string }) {
  const insightsQuery = useLinkInsights(projectId);
  const data = insightsQuery.data;
  const opportunities = data?.connected ? data.opportunities : [];

  // Live-check each suggested source page (one fetch per serverFn call,
  // cached server-side for a day).
  const checks = opportunities.flatMap((opportunity) =>
    opportunity.sources.map((source) => ({
      key: `${source.page}→${opportunity.target.page}`,
      sourceUrl: source.page,
      targetUrl: opportunity.target.page,
      phrase: opportunity.query,
    })),
  );
  const presenceQueries = useQueries({
    queries: checks.map((check) => ({
      queryKey: ["link-presence", projectId, check.key, check.phrase],
      queryFn: async (): Promise<PresenceResult> =>
        checkLinkPresence({
          data: {
            projectId,
            sourceUrl: check.sourceUrl,
            targetUrl: check.targetUrl,
            phrase: check.phrase,
          },
        }),
      staleTime: 60 * 60_000,
      retry: 1,
    })),
  });
  const presenceByKey = new Map<string, PresenceResult>();
  checks.forEach((check, index) => {
    const result = presenceQueries[index]?.data;
    if (result !== undefined) {
      presenceByKey.set(`${check.key}|${check.phrase}`, result);
    }
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Waypoints className="size-5" />
          Link Opportunities
        </h1>
        <p className="text-sm text-base-content/60">
          Internal links you should add: for each keyword you almost rank for,
          these are your own pages Google already associates with it — link from
          them to the target page using the keyword as the anchor.
        </p>
      </div>

      {insightsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : null}

      {insightsQuery.isError ? (
        <div className="alert alert-error text-sm">
          {getStandardErrorMessage(insightsQuery.error)}
        </div>
      ) : null}

      {data && !data.connected ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-12 text-center">
            <p className="font-medium">Connect Search Console first</p>
            <p className="max-w-md text-sm text-base-content/60">
              Link opportunities are built from your own Search Console data.
            </p>
            <Link
              to="/p/$projectId/search-performance"
              params={{ projectId }}
              className="btn btn-primary btn-sm mt-2"
            >
              Go to GSC Insights
            </Link>
          </div>
        </div>
      ) : null}

      {data?.connected && opportunities.length === 0 ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-12 text-center">
            <p className="font-medium">No opportunities right now</p>
            <p className="max-w-md text-sm text-base-content/60">
              This fills in once queries rank in positions 4–20 with more than
              one of your pages appearing for them.
            </p>
          </div>
        </div>
      ) : null}

      {opportunities.map((opportunity) => (
        <div
          key={opportunity.query}
          className="card border border-base-300 bg-base-100"
        >
          <div className="card-body gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-sm text-base-content/60">
                  Boost{" "}
                  <a
                    href={opportunity.target.page}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-base-content hover:underline"
                  >
                    {toPath(opportunity.target.page)}
                  </a>{" "}
                  — currently #{Math.round(opportunity.target.position)} for
                </span>{" "}
                <span className="badge badge-primary badge-outline">
                  {opportunity.query}
                </span>
              </div>
              <span className="text-xs text-base-content/50 tabular-nums">
                {opportunity.target.impressions.toLocaleString()} impressions ·
                anchor: &ldquo;{opportunity.query}&rdquo;
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Link from</th>
                    <th className="text-right">Its impressions for query</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunity.sources.map((source) => (
                    <tr key={source.page}>
                      <td className="max-w-md">
                        <a
                          href={source.page}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <span className="line-clamp-1">
                            {toPath(source.page)}
                          </span>
                          <ExternalLink className="size-3 shrink-0 text-base-content/40" />
                        </a>
                      </td>
                      <td className="text-right tabular-nums">
                        {source.impressions.toLocaleString()}
                      </td>
                      <td className="text-right">
                        <PresenceBadge
                          presence={presenceByKey.get(
                            `${source.page}→${opportunity.target.page}|${opportunity.query}`,
                          )}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      {data?.connected ? (
        <p className="text-xs text-base-content/40">
          Based on Search Console data {data.range.startDate} –{" "}
          {data.range.endDate}. Free — uses your own GSC data.
        </p>
      ) : null}
    </div>
  );
}
