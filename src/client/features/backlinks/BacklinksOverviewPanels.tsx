import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import {
  BacklinksAuthorityChart,
  BacklinksNewLostChart,
  BacklinksTrendChart,
} from "./BacklinksPageCharts";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import { formatRelativeTimestamp } from "./backlinksPageUtils";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";

type SummaryStat = { label: string; value: string; description: string };

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
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col p-4 xl:h-full gap-2 text-sm">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 xl:gap-y-6">
          {summaryStats.map((item) => (
            <div key={item.label}>
              <div className="text-xs uppercase tracking-wide text-base-content/55">
                <HeaderHelpLabel
                  label={item.label}
                  helpText={item.description}
                />
              </div>
              <p className="text-2xl font-semibold">{item.value}</p>
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
        description="Domain Rank over the last year"
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
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="text-xs text-base-content/55">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
