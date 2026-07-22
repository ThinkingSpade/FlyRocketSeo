import { formatCount, toPath } from "@/client/features/report/reportModel";
import { StatBlock } from "@/client/features/report/ReportChrome";
import { describeOnPageStatus } from "@/client/features/report/onPageStatus";

/**
 * The "what's wrong and what's worth doing" chapters of the Client Report:
 * on-page issues the last crawl found, pages that gained ground this period,
 * and the backlink profile in detail. All rendered from data already fetched.
 */

type ReportTechnicalIssue = {
  key: string;
  label: string;
  description: string;
  severity: "high" | "medium" | "low";
  pageCount: number;
};

const SEVERITY_LABEL: Record<ReportTechnicalIssue["severity"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEVERITY_TONE: Record<ReportTechnicalIssue["severity"], string> = {
  high: "text-error",
  medium: "text-warning",
  low: "text-base-content/50",
};

/** On-page issues found by the last crawl, ordered by how many pages hit each. */
export function OnPageOptimizations({
  issues,
  pagesCrawled,
  pagesAnalyzed,
}: {
  issues: ReportTechnicalIssue[];
  pagesCrawled: number | null;
  /** Page rows actually available — 0 means the crawl's details didn't load. */
  pagesAnalyzed: number;
}) {
  const found = issues.filter((issue) => issue.pageCount > 0);
  const total = found.reduce((sum, issue) => sum + issue.pageCount, 0);
  const status = describeOnPageStatus({
    pagesCrawled,
    pagesAnalyzed,
    issuesFound: found.length,
  });

  if (status !== "issues") {
    return (
      <p className="text-sm text-base-content/70">
        {status === "no-audit"
          ? "No completed site audit yet, so on-page issues could not be counted for this period."
          : status === "unavailable"
            ? `The last audit recorded ${formatCount(pagesCrawled)} crawled pages, but their details could not be loaded — on-page issues could not be checked for this period.`
            : `The last crawl checked ${formatCount(pagesCrawled)} pages and found no missing titles, descriptions, H1s, or alt text. That is a clean bill of health on the basics.`}
      </p>
    );
  }

  return (
    <>
      <p className="text-sm leading-relaxed text-base-content/80">
        The last crawl checked {formatCount(pagesCrawled)} pages and identified{" "}
        <span className="font-semibold">{formatCount(total)}</span> on-page
        items worth fixing across {found.length}{" "}
        {found.length === 1 ? "category" : "categories"}. These are the changes
        that need no new content — only edits to pages that already exist.
      </p>
      <div className="overflow-x-auto rounded-lg border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Optimization type</th>
              <th>Why it matters</th>
              <th className="text-right">Priority</th>
              <th className="text-right">Pages affected</th>
            </tr>
          </thead>
          <tbody>
            {found.map((issue) => (
              <tr key={issue.key}>
                <td className="font-medium">{issue.label}</td>
                <td className="max-w-sm text-base-content/70">
                  <span className="line-clamp-1">{issue.description}</span>
                </td>
                <td
                  className={`text-right text-xs font-medium ${SEVERITY_TONE[issue.severity]}`}
                >
                  {SEVERITY_LABEL[issue.severity]}
                </td>
                <td className="text-right font-semibold tabular-nums">
                  {formatCount(issue.pageCount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type MoverRow = {
  page: string;
  clicks: number;
  impressions: number;
  clicksDelta: number;
};

/** Pages that gained the most clicks this period — the "what worked" section. */
export function ContentMovers({ rows }: { rows: MoverRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-base-content/70">
        No pages gained clicks against the previous period. The recommendations
        at the end of this report target that directly.
      </p>
    );
  }

  return (
    <>
      <p className="text-sm leading-relaxed text-base-content/80">
        {rows.length === 1
          ? "This page gained clicks against the previous period."
          : `These ${rows.length} pages gained the most clicks against the previous period.`}{" "}
        They show which topics are earning ground, and are the clearest guide to
        what the next piece of content should be about.
      </p>
      <div className="overflow-x-auto rounded-lg border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Page</th>
              <th className="text-right">Clicks</th>
              <th className="text-right">Gained</th>
              <th className="text-right">Impressions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.page}>
                <td className="max-w-md">
                  <span className="line-clamp-1">{toPath(row.page)}</span>
                </td>
                <td className="text-right tabular-nums">
                  {formatCount(row.clicks)}
                </td>
                <td className="text-right font-medium tabular-nums text-success">
                  +{formatCount(row.clicksDelta)}
                </td>
                <td className="text-right tabular-nums text-base-content/70">
                  {formatCount(row.impressions)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const FIX_ELEMENT_LABEL: Record<string, string> = {
  title: "Title",
  meta: "Meta",
  h1: "H1",
  alt: "Alt",
};

type ApprovedFix = {
  id: string;
  url: string;
  element: string;
  suggestedValue: string;
};

/**
 * On-page fixes the user approved this period — the report's proof of work.
 * Grouped counts plus a sample, so a client sees what changed without a wall
 * of rows.
 */
export function ApprovedFixesSection({ fixes }: { fixes: ApprovedFix[] }) {
  if (fixes.length === 0) return null;

  const byElement = new Map<string, number>();
  for (const fix of fixes) {
    byElement.set(fix.element, (byElement.get(fix.element) ?? 0) + 1);
  }
  const summary = [...byElement.entries()]
    .map(
      ([element, count]) => `${count} ${FIX_ELEMENT_LABEL[element] ?? element}`,
    )
    .join(", ");

  return (
    <>
      <p className="text-sm leading-relaxed text-base-content/80">
        <span className="font-semibold">{fixes.length}</span> on-page{" "}
        {fixes.length === 1 ? "fix has" : "fixes have"} been approved this
        period ({summary}). Each is a specific rewrite ready to publish.
      </p>
      <div className="overflow-x-auto rounded-lg border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Page</th>
              <th>Element</th>
              <th>Approved change</th>
            </tr>
          </thead>
          <tbody>
            {fixes.slice(0, 15).map((fix) => (
              <tr key={fix.id}>
                <td className="max-w-[12rem]">
                  <span className="line-clamp-1">{toPath(fix.url)}</span>
                </td>
                <td className="text-base-content/70">
                  {FIX_ELEMENT_LABEL[fix.element] ?? fix.element}
                </td>
                <td className="max-w-sm">
                  <span className="line-clamp-1">{fix.suggestedValue}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fixes.length > 15 ? (
        <p className="text-xs text-base-content/50">
          Showing 15 of {fixes.length} approved fixes.
        </p>
      ) : null}
    </>
  );
}

type BacklinkProfile = {
  rank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  referringPages: number | null;
  brokenBacklinks: number | null;
  backlinksSpamScore: number | null;
};

/** The headline backlink stats as a scannable block, plus top linking sites. */
export function BacklinkProfileBlock({
  profile,
  topDomains,
}: {
  profile: BacklinkProfile;
  topDomains: Array<{ domain: string | null; backlinks: number | null }>;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatBlock
          label="Domain rank"
          value={profile.rank == null ? "—" : String(Math.round(profile.rank))}
        />
        <StatBlock
          label="Total backlinks"
          value={formatCount(profile.backlinks)}
        />
        <StatBlock
          label="Referring sites"
          value={formatCount(profile.referringDomains)}
        />
        <StatBlock
          label="Spam score"
          value={
            profile.backlinksSpamScore == null
              ? "—"
              : `${Math.round(profile.backlinksSpamScore)}%`
          }
        />
        <StatBlock
          label="Broken links"
          value={formatCount(profile.brokenBacklinks)}
          hint={
            profile.brokenBacklinks && profile.brokenBacklinks > 0
              ? "Recoverable"
              : undefined
          }
        />
      </div>

      {topDomains.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Top linking sites</th>
                <th className="text-right">Backlinks</th>
              </tr>
            </thead>
            <tbody>
              {topDomains.map((row) => (
                <tr key={row.domain ?? "—"}>
                  <td>{row.domain ?? "—"}</td>
                  <td className="text-right tabular-nums">
                    {formatCount(row.backlinks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
