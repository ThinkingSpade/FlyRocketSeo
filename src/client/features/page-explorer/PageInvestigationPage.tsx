import {
  PagePerformanceEvidence,
  StoredCrawlEvidence,
} from "./PageEvidenceCards";
import {
  GSC_DEVICES,
  SEARCH_PERFORMANCE_RANGES,
} from "@/types/schemas/search-performance";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AppPageShell } from "@/client/components/AppPageShell";
import { AppCard } from "@/client/components/AppCard";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import { getPageInvestigationPerformance } from "@/serverFunctions/page-investigation";
import { getAuditHistory, getAuditResults } from "@/serverFunctions/audit";
import {
  auditHistoryKey,
  auditResultsKey,
} from "@/client/features/audit/auditQueryKeys";
import { getTechnicalAuditState } from "@/client/features/opportunities/technicalAuditState";
import { selectInvestigationAudit } from "./investigationAudit";
import { PageExplorerPage } from "./PageExplorerPage";
import type { PageInvestigationInput } from "@/types/schemas/page-investigation";
import { Button, buttonVariants } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import {
  SavePageOpportunity,
  SaveInternalLinkOpportunity,
} from "@/client/features/opportunities/SaveOpportunityActions";

type Search = Omit<PageInvestigationInput, "projectId" | "url"> & {
  u?: string;
  loc?: number;
  pageView: "evidence" | "research";
};
type Navigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;
const evidenceSearchTypes = ["web", "image", "video", "news"] as const;

export function PageInvestigationPage({
  projectId,
  search,
  navigate,
}: {
  projectId: string;
  search: Search;
  navigate: Navigate;
}) {
  return (
    <>
      <nav
        aria-label="Page investigation views"
        className="flex gap-2 border-b border-base-300 px-4 py-2"
      >
        {(
          [
            ["evidence", "Evidence"],
            ["research", "Provider research"],
          ] as const
        ).map(([view, label]) => (
          <Link
            key={view}
            to="/p/$projectId/page"
            params={{ projectId }}
            search={{ ...search, pageView: view }}
            aria-current={search.pageView === view ? "page" : undefined}
            className={buttonVariants({
              variant: search.pageView === view ? "secondary" : "ghost",
              size: "sm",
            })}
          >
            {label}
          </Link>
        ))}
      </nav>
      {search.pageView === "research" ? (
        <PageExplorerPage
          projectId={projectId}
          url={search.u ?? ""}
          locationCode={search.loc}
          navigate={navigate}
        />
      ) : (
        <PageEvidence
          key={`${projectId}:${JSON.stringify(search)}`}
          projectId={projectId}
          search={search}
          navigate={navigate}
        />
      )}
    </>
  );
}

function PageEvidence({
  projectId,
  search,
  navigate,
}: {
  projectId: string;
  search: Search;
  navigate: Navigate;
}) {
  const url = search.u ?? "";
  const domain = useProjectDomain(projectId);
  const [input, setInput] = useState(url);
  const [range, setRange] = useState<Search["dateRange"] | "custom">(
    search.startDate && search.endDate ? "custom" : search.dateRange,
  );
  const [startDate, setStartDate] = useState(search.startDate ?? "");
  const [endDate, setEndDate] = useState(search.endDate ?? "");
  const [searchType, setSearchType] = useState(search.searchType);
  const [device, setDevice] = useState(search.device ?? "");
  const [country, setCountry] = useState(search.country ?? "");
  let ownSite = false;
  try {
    ownSite = Boolean(
      domain &&
      new URL(url).hostname ===
        new URL(/^https?:\/\//.test(domain) ? domain : `https://${domain}`)
          .hostname,
    );
  } catch {
    /* Empty/invalid URL is handled by the form and server validator. */
  }
  const scope = {
    dateRange: search.dateRange,
    startDate: search.startDate,
    endDate: search.endDate,
    device: search.device,
    country: search.country,
    searchType: search.searchType,
  };
  const performance = useQuery({
    queryKey: ["page-investigation", projectId, domain, url, scope],
    enabled: ownSite,
    queryFn: () =>
      getPageInvestigationPerformance({ data: { projectId, url, ...scope } }),
    staleTime: 60_000,
  });
  const history = useQuery({
    queryKey: auditHistoryKey(projectId),
    queryFn: () => getAuditHistory({ data: { projectId } }),
    enabled: ownSite,
  });
  const selectedAudit = selectInvestigationAudit(history.data ?? [], url);
  const audit = useQuery({
    queryKey: auditResultsKey(projectId, selectedAudit?.id),
    queryFn: () =>
      getAuditResults({
        data: { projectId, auditId: selectedAudit?.id ?? "" },
      }),
    enabled: Boolean(ownSite && selectedAudit),
  });
  const technicalState = getTechnicalAuditState(
    history,
    audit,
    selectedAudit?.id,
    audit.data?.pages,
  );
  const report = performance.data;
  return (
    <AppPageShell>
      <div>
        <h1 className="text-2xl font-semibold">Page Investigation</h1>
        {url ? <p className="break-all text-sm">{url}</p> : null}
        <p className="text-sm text-base-content/60">
          Review Search Console observations and stored crawl evidence, then
          prepare an action. Website changes require a separate review.
        </p>
      </div>
      <AppCard>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = /^https?:\/\//i.test(input.trim())
              ? input.trim()
              : `https://${input.trim()}`;
            navigate({
              search: (prev) => ({
                ...prev,
                u: normalized,
                dateRange: range === "custom" ? search.dateRange : range,
                device: device || undefined,
                country: country || undefined,
                searchType,
                startDate: range === "custom" ? startDate : undefined,
                endDate: range === "custom" ? endDate : undefined,
              }),
              replace: false,
            });
          }}
        >
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
            Page URL
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                domain
                  ? `https://${domain}/page`
                  : "https://your-site.example/page"
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Window
            <select
              className="app-select app-select-sm"
              value={range}
              onChange={(event) => {
                if (event.target.value === "custom") {
                  setRange("custom");
                  return;
                }
                const next = SEARCH_PERFORMANCE_RANGES.find(
                  (value) => value === event.target.value,
                );
                if (next) setRange(next);
              }}
            >
              <option value="last_7_days">Last 7 days</option>
              <option value="last_28_days">Last 28 days</option>
              <option value="last_3_months">Last 3 months</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
          {range === "custom" ? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                Evidence start
                <Input
                  type="date"
                  required
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Evidence end
                <Input
                  type="date"
                  required
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            Search type
            <select
              className="app-select app-select-sm"
              value={searchType}
              onChange={(event) => {
                const next = evidenceSearchTypes.find(
                  (value) => value === event.target.value,
                );
                if (next) setSearchType(next);
              }}
            >
              <option value="web">Web</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="news">News</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Device
            <select
              className="app-select app-select-sm"
              value={device}
              onChange={(event) =>
                setDevice(
                  GSC_DEVICES.find((value) => value === event.target.value) ??
                    "",
                )
              }
            >
              <option value="">All devices</option>
              <option value="DESKTOP">Desktop</option>
              <option value="MOBILE">Mobile</option>
              <option value="TABLET">Tablet</option>
            </select>
          </label>
          <label className="flex w-28 flex-col gap-1 text-sm">
            Country (3 letters)
            <Input
              maxLength={3}
              pattern="[a-z]{3}"
              value={country}
              onChange={(event) => setCountry(event.target.value.toLowerCase())}
              placeholder="All"
            />
          </label>
          <Button type="submit" variant="primary" disabled={!input.trim()}>
            Load evidence
          </Button>
        </form>
        <p className="text-xs text-base-content/60">
          {domain ?? "Set the project's website first"} · {search.searchType}{" "}
          search · {search.device ?? "All devices"} ·{" "}
          {search.country ?? "All countries"}. Evidence reads do not run
          provider research.
        </p>
      </AppCard>
      {!url ? (
        <p className="text-sm">
          Choose a page to begin, or open a page from the overview or
          Opportunities.
        </p>
      ) : !ownSite ? (
        <p role="status" className="text-sm">
          Own-site evidence requires a URL on this project's current website.
          Use Provider research to inspect other sites.
        </p>
      ) : (
        <>
          <PagePerformanceEvidence
            performance={performance}
            projectId={projectId}
          />
          <StoredCrawlEvidence
            audit={audit}
            history={history}
            url={url}
            projectId={projectId}
            technicalState={technicalState}
          />
          <AppCard>
            <h2 className="text-lg font-medium">Prepare a reviewed action</h2>
            {report?.connected ? (
              <SaveInternalLinkOpportunity
                input={{ projectId, url, ...scope }}
              />
            ) : null}
            {report?.connected ? (
              <SavePageOpportunity input={{ projectId, url, ...scope }} />
            ) : (
              <p className="text-xs">
                Connect applicable Search Console evidence before saving a
                measured page action.
              </p>
            )}
            <p className="text-sm text-base-content/60">
              Review query intent, the captured page and missing evidence before
              choosing changes. Briefs are drafts; consolidation and redirects
              require separate review.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/p/$projectId/content"
                params={{ projectId }}
                search={{
                  q: report?.connected ? report.queries[0]?.key : undefined,
                }}
                className="app-link"
              >
                Prepare a content brief
              </Link>
              <Link
                to="/p/$projectId/on-page"
                params={{ projectId }}
                search={{ u: url }}
                className="app-link"
              >
                Review on-page suggestions
              </Link>
              <Link
                to="/p/$projectId/links"
                params={{ projectId }}
                search={{
                  q: report?.connected ? report.queries[0]?.key : undefined,
                }}
                className="app-link"
              >
                Investigate internal links
              </Link>
            </div>
          </AppCard>
        </>
      )}
    </AppPageShell>
  );
}
