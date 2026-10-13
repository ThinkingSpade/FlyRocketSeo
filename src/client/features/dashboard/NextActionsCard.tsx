import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "@phosphor-icons/react";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  buildOpportunities,
  excludeWrongCustomer,
} from "@/client/features/opportunities/opportunityModel";
import {
  useKeywordFit,
  useProjectProfile,
} from "@/client/features/profiles/useProjectProfile";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { CardEmpty, DashboardCard } from "./dashboardShared";
import { DashboardNextActionsList } from "./DashboardNextActionsList";

export function NextActionsCard({ projectId }: { projectId: string }) {
  // Identical to SearchPerformanceCard/OpportunitiesPage: reuse one free read.
  const query = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
  });
  const report = query.data;
  const opportunities = useMemo(
    () =>
      report?.connected
        ? buildOpportunities({
            strikingDistance: report.strikingDistance,
            ctrOpportunities: report.ctrOpportunities,
            cannibalization: [],
          })
        : [],
    [report],
  );
  const profileState = useProjectProfile(projectId);
  const keywords = useMemo(
    () => opportunities.map((row) => row.query),
    [opportunities],
  );
  const fit = useKeywordFit(profileState.profile, keywords);
  const { kept: rows, excluded } = useMemo(
    () => excludeWrongCustomer(opportunities, fit),
    [opportunities, fit],
  );

  return (
    <DashboardCard
      icon={Lightbulb}
      title="What to work on next"
      headerLink={{ to: "/p/$projectId/opportunities", params: { projectId } }}
      headerLinkLabel="All opportunities"
    >
      {query.isError ? (
        <InlineQueryError
          message={getStandardErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.isPending || profileState.isLoading ? (
        <div
          aria-busy="true"
          aria-label="Loading keyword opportunities"
          className="space-y-3 py-2"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : !report?.connected ? (
        <CardEmpty>
          <p className="font-medium text-base-content">
            Start with your website’s evidence
          </p>
          <p className="mt-1 max-w-sm">
            Connect Search Console to prioritize keyword work. Technical reviews
            are available through Site Audit.
          </p>
          <Link
            to="/p/$projectId/audit"
            params={{ projectId }}
            className="app-link mt-3 font-medium"
          >
            Review site audit →
          </Link>
        </CardEmpty>
      ) : (
        <>
          <p className="text-xs text-base-content/70">
            Search Console · {report.range.startDate} – {report.range.endDate}
          </p>
          {rows.length > 0 ? (
            <DashboardNextActionsList projectId={projectId} rows={rows} />
          ) : (
            <p className="py-4 text-sm text-base-content/70">
              {excluded > 0
                ? "The returned keyword opportunities were excluded by your business profile. Review the exclusions in SEO Opportunities."
                : "No ranking or CTR actions in the returned data. Technical and linking issues may still need review."}
            </p>
          )}
          <p className="border-t border-base-300 pt-3 text-xs text-base-content/70">
            Suggested reviews, not promised traffic gains.{" "}
            {report.sampling.queryPages.truncated
              ? "The source pull is capped; this is not a complete inventory. "
              : ""}
            {profileState.isError
              ? "Business-fit rules could not be loaded; review relevance before acting."
              : "Open all opportunities for supporting evidence and technical checks."}
          </p>
        </>
      )}
    </DashboardCard>
  );
}
