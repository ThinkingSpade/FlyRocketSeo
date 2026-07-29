import { Download, Network, Plus, Radar, Target } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import type {
  CompetingDomainsResult,
  LinkIntersectResult,
  ReferringNetworksResult,
} from "@/types/schemas/backlinks-compare";

/**
 * The three competitive drill-downs that sit under the comparison table: who
 * links to your rivals but not to you, who shares your link profile, and
 * whether your links cluster onto a handful of networks.
 *
 * Each one is a separate metered call behind its own button.
 */

/** Half a profile inside three subnets is the shape a link network leaves. */
const NETWORK_CONCENTRATION_WARNING = 0.5;
/** Below this many subnets the top-three share is trivially high, not risky. */
const MIN_NETWORKS_TO_JUDGE = 4;
const NETWORK_PREVIEW_LIMIT = 10;

function formatNumber(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

function CardShell({
  title,
  description,
  icon,
  action,
  errorMessage,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Target;
  action?: React.ReactNode;
  errorMessage?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <InsightIcon icon={icon} />
              {title}
            </h3>
            <p className="text-xs text-base-content/55">{description}</p>
          </div>
          {action}
        </div>
        {errorMessage ? (
          <div className="alert alert-error py-2 text-sm">{errorMessage}</div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function LinkIntersectCard({
  result,
  errorMessage,
  isLoading,
  target,
  onPageChange,
}: {
  result: LinkIntersectResult | undefined;
  errorMessage: string | null;
  isLoading: boolean;
  target: string;
  onPageChange: (page: number) => void;
}) {
  const rows = result?.rows ?? [];
  const competitorCount = result?.competitors.length ?? 0;

  return (
    <CardShell
      title="Link gap"
      description="Sites that link to your competitors but not to you — the shortest list of realistic link prospects there is."
      icon={Target}
      errorMessage={errorMessage}
      action={
        rows.length > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1"
            onClick={() => exportLinkGap(rows, target)}
          >
            <Download className="size-3.5" />
            CSV
          </button>
        ) : null
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : null}

      {!isLoading && result && rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-base-content/60">
          No gap found — every domain linking to these competitors already links
          to you.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Referring domain</th>
                  <th className="text-right">Links to</th>
                  <th className="text-right">DR</th>
                  <th className="text-right">Backlinks</th>
                  <th className="text-right">Spam</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.domain}>
                    <td className="max-w-xs truncate" title={row.domain}>
                      {row.domain}
                    </td>
                    <td
                      className="text-right tabular-nums"
                      title={row.linkedTo.join(", ")}
                    >
                      <span
                        className={
                          row.competitorsLinked > 1
                            ? "font-semibold"
                            : "text-base-content/60"
                        }
                      >
                        {row.competitorsLinked} of {competitorCount}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">
                      {formatNumber(row.rank)}
                    </td>
                    <td className="text-right tabular-nums text-base-content/60">
                      {formatNumber(row.backlinks)}
                    </td>
                    <td className="text-right tabular-nums">
                      <span
                        className={
                          row.spamScore != null && row.spamScore >= 40
                            ? "font-medium text-error"
                            : "text-base-content/60"
                        }
                      >
                        {formatNumber(row.spamScore)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-base-content/50">
              A domain linking to more than one competitor has already shown it
              will link to sites like yours.
            </p>
            <div className="join">
              <button
                type="button"
                className="btn btn-ghost btn-xs join-item"
                disabled={(result?.page ?? 1) <= 1 || isLoading}
                onClick={() => onPageChange((result?.page ?? 1) - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs join-item"
                disabled={!result?.hasMore || isLoading}
                onClick={() => onPageChange((result?.page ?? 1) + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}
    </CardShell>
  );
}

function exportLinkGap(rows: LinkIntersectResult["rows"], target: string) {
  const slug = target.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
  downloadCsv(
    `link-gap-${slug || "export"}.csv`,
    buildCsv(
      [
        "Referring Domain",
        "Competitors Linked",
        "Which Competitors",
        "Domain Rank",
        "Backlinks",
        "Spam Score",
        "First Seen",
      ],
      rows.map((row) => [
        row.domain,
        row.competitorsLinked,
        row.linkedTo.join(" | "),
        row.rank,
        row.backlinks,
        row.spamScore,
        row.firstSeen,
      ]),
    ),
  );
}

export function CompetingDomainsCard({
  result,
  errorMessage,
  isLoading,
  hasRun,
  competitors,
  onRun,
  onAdd,
}: {
  result: CompetingDomainsResult | undefined;
  errorMessage: string | null;
  isLoading: boolean;
  hasRun: boolean;
  competitors: string[];
  onRun: () => void;
  onAdd: (domain: string) => boolean;
}) {
  const rows = result?.rows ?? [];

  return (
    <CardShell
      title="Who competes for your links"
      description="Sites sharing the most referring domains with you. These are the rivals worth comparing against, whether or not they rank for the same keywords."
      icon={Radar}
      errorMessage={errorMessage}
      action={
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isLoading}
          onClick={onRun}
        >
          {isLoading ? (
            <span className="loading loading-spinner loading-xs" />
          ) : null}
          {hasRun ? "Refresh" : "Find them"}
        </button>
      }
    >
      {!hasRun ? (
        <p className="text-xs text-base-content/50">
          One lookup. Results can be added straight into the comparison above.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y divide-base-200">
          {rows.map((row) => (
            <li
              key={row.domain}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.domain}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-base-content/55">
                {formatNumber(row.intersections)} shared · DR{" "}
                {formatNumber(row.rank)}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-xs gap-1"
                disabled={competitors.includes(row.domain)}
                onClick={() => onAdd(row.domain)}
              >
                <Plus className="size-3" />
                {competitors.includes(row.domain) ? "Added" : "Compare"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {hasRun && !isLoading && result && rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-base-content/60">
          No overlapping link profiles found for this domain.
        </p>
      ) : null}
    </CardShell>
  );
}

export function ReferringNetworksCard({
  result,
  errorMessage,
  isLoading,
  hasRun,
  onRun,
}: {
  result: ReferringNetworksResult | undefined;
  errorMessage: string | null;
  isLoading: boolean;
  hasRun: boolean;
  onRun: () => void;
}) {
  const rows = result?.rows.slice(0, NETWORK_PREVIEW_LIMIT) ?? [];
  const concentrated =
    result != null &&
    result.rows.length >= MIN_NETWORKS_TO_JUDGE &&
    result.topThreeShare >= NETWORK_CONCENTRATION_WARNING;

  return (
    <CardShell
      title="Referring networks"
      description="Your referring links grouped by the subnet they are hosted on. Links spread across many networks look earned; links piled into a few look bought."
      icon={Network}
      errorMessage={errorMessage}
      action={
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isLoading}
          onClick={onRun}
        >
          {isLoading ? (
            <span className="loading loading-spinner loading-xs" />
          ) : null}
          {hasRun ? "Refresh" : "Check networks"}
        </button>
      }
    >
      {!hasRun ? (
        <p className="text-xs text-base-content/50">
          One lookup. Surfaces link-network risk no per-domain view can show.
        </p>
      ) : null}

      {result && rows.length > 0 ? (
        <>
          <p
            className={`text-sm ${concentrated ? "text-warning" : "text-base-content/70"}`}
          >
            {Math.round(result.topThreeShare * 100)}% of these referring domains
            sit in the three largest subnets
            {concentrated
              ? " — that concentration is the footprint a link network leaves."
              : ", which is a healthy spread."}
          </p>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Subnet</th>
                  <th className="text-right">Referring domains</th>
                  <th className="text-right">Backlinks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.networkAddress}>
                    <td className="tabular-nums">{row.networkAddress}</td>
                    <td className="text-right tabular-nums">
                      {formatNumber(row.referringDomains)}
                    </td>
                    <td className="text-right tabular-nums text-base-content/60">
                      {formatNumber(row.backlinks)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {hasRun && !isLoading && result && result.rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-base-content/60">
          No network data returned for this domain.
        </p>
      ) : null}
    </CardShell>
  );
}
