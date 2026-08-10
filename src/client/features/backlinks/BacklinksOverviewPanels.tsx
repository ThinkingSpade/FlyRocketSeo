import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import {
  BacklinksAuthorityChart,
  BacklinksNewLostChart,
  BacklinksTrendChart,
} from "./BacklinksPageCharts";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import {
  formatRelativeTimestamp,
  type SummaryStat,
} from "./backlinksPageUtils";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";

const SUMMARY_TONE_CLASS: Record<SummaryStat["tone"], string> = {
  neutral: "text-base-content/55",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
};

export function BacklinksOverviewPanels({
  projectId,
  data,
  summaryStats,
}: {
  projectId: string;
  data: BacklinksOverviewData;
  summaryStats: SummaryStat[];
}) {
  return (
    <>
      <div>
        <Link
          to="/p/$projectId/backlinks"
          params={{ projectId }}
          search={{
            target: undefined,
            scope: undefined,
            tab: undefined,
            page: undefined,
            size: undefined,
            sort: undefined,
            order: undefined,
          }}
          replace
          className="btn btn-ghost btn-sm gap-2 px-0 text-base-content/70 hover:bg-transparent"
        >
          <ArrowLeft className="size-4" />
          Recent searches
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/65">
        <Badge variant="outline">
          {data.scope === "page" ? "Exact page" : "Site-wide"}
        </Badge>
        <span>Target: {data.displayTarget}</span>
        <span aria-hidden="true">·</span>
        <span>Updated {formatRelativeTimestamp(data.fetchedAt)}</span>
      </div>
      <OverviewGrid data={data} summaryStats={summaryStats} />
      {data.scope === "page" ? (
        <Banner variant="default">
          <span>
            Showing backlinks for this exact page. Enter a bare domain for
            site-wide results. Trend charts are only shown for domain-level
            lookups.
          </span>
        </Banner>
      ) : null}
    </>
  );
}

function OverviewGrid({
  data,
  summaryStats,
}: {
  data: BacklinksOverviewData;
  summaryStats: SummaryStat[];
}) {
  const domainScope = data.scope === "domain";

  return (
    <div className="flex flex-col gap-6">
      <SummaryStatsGrid summaryStats={summaryStats} />
      {domainScope ? <TrendPanels data={data} /> : null}
    </div>
  );
}

function SummaryStatsGrid({ summaryStats }: { summaryStats: SummaryStat[] }) {
  const primaryStats = summaryStats.slice(0, 4);
  const diagnosticStats = summaryStats.slice(4);

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-4 p-4 text-sm xl:h-full">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          {primaryStats.map((item) => (
            <div key={item.label}>
              <div className="text-xs uppercase tracking-wide text-base-content/55">
                <HeaderHelpLabel
                  label={item.label}
                  helpText={item.description}
                />
              </div>
              <p className="text-2xl font-semibold tabular-nums">
                {item.value}
              </p>
              {item.hint ? (
                <p
                  className={`mt-0.5 text-xs ${SUMMARY_TONE_CLASS[item.tone]}`}
                >
                  {item.hint}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-base-300 pt-4 md:grid-cols-4">
          {diagnosticStats.map((item) => (
            <div key={item.label}>
              <div className="text-xs uppercase tracking-wide text-base-content/55">
                <HeaderHelpLabel
                  label={item.label}
                  helpText={item.description}
                />
              </div>
              <p className={`text-sm ${SUMMARY_TONE_CLASS[item.tone]}`}>
                <span className="font-semibold tabular-nums">{item.value}</span>
                {item.hint ? <span> · {item.hint}</span> : null}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrendPanels({ data }: { data: BacklinksOverviewData }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <TrendCard
          title="Backlink growth"
          description="Backlinks and referring domains over the last year"
        >
          <BacklinksTrendChart data={data.trends} />
        </TrendCard>
      </div>
      <TrendCard
        title="New vs lost"
        description="Backlink acquisition and attrition"
      >
        <BacklinksNewLostChart data={data.newLostTrends} />
      </TrendCard>
      <TrendCard
        title="Authority trend"
        description="Domain authority over the last year"
      >
        <BacklinksAuthorityChart data={data.trends} />
      </TrendCard>
    </div>
  );
}

function TrendCard({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="relative flex h-full flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-base-content/55">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
