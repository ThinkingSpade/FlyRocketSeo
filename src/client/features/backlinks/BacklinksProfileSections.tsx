import { Activity, Globe, Link2, Wrench } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import type { BacklinksOverviewResult } from "@/types/schemas/backlinks-results";
import { computeLinkVelocity } from "./linkVelocity";
import {
  countLinksAtStake,
  findReclaimTargets,
  type ReclaimTarget,
} from "./brokenPageReclaim";
import type { BacklinksTopPagesData } from "./backlinksPageTypes";

/**
 * Three reads on the link profile that the underlying calls already paid for
 * but nothing surfaced: where links come from, whether the profile is growing,
 * and which dead pages are still holding links.
 */

const RECLAIM_LIMIT = 8;

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function BreakdownList({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: typeof Globe;
  rows: Array<{ label: string; value: number }>;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.value));

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <InsightIcon icon={icon} />
          {title}
        </h3>
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.label} className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{row.label}</span>
                <span className="shrink-0 tabular-nums text-base-content/60">
                  {formatNumber(row.value)}
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-base-200">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function BacklinksProfileBreakdowns({
  summary,
}: {
  summary: BacklinksOverviewResult["summary"];
}) {
  const hasAny =
    summary.referringCountries.length > 0 ||
    summary.referringTlds.length > 0 ||
    summary.referringLinkTypes.length > 0;
  if (!hasAny) return null;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <BreakdownList
        title="Top countries"
        icon={Globe}
        rows={summary.referringCountries}
      />
      <BreakdownList
        title="Top-level domains"
        icon={Link2}
        rows={summary.referringTlds}
      />
      <BreakdownList
        title="Link types"
        icon={Link2}
        rows={summary.referringLinkTypes}
      />
    </div>
  );
}

export function LinkVelocityCard({
  trends,
}: {
  trends: BacklinksOverviewResult["newLostTrends"];
}) {
  const velocity = computeLinkVelocity(trends);
  if (!velocity) return null;

  const tone =
    velocity.direction === "growing"
      ? "text-success"
      : velocity.direction === "shrinking"
        ? "text-error"
        : "text-base-content/70";
  const headline =
    velocity.direction === "growing"
      ? "Gaining links"
      : velocity.direction === "shrinking"
        ? "Losing links"
        : "Holding steady";
  const sign = velocity.netPerMonth > 0 ? "+" : "";

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <InsightIcon icon={Activity} />
          Link velocity
        </h3>
        <p className={`text-lg font-semibold ${tone}`}>
          {headline} ·{" "}
          <span className="tabular-nums">
            {sign}
            {formatNumber(velocity.netPerMonth, 1)}
          </span>{" "}
          <span className="text-sm font-normal text-base-content/60">
            referring domains / month
          </span>
        </p>
        <p className="text-xs text-base-content/60">
          Net of{" "}
          <span className="tabular-nums">
            {formatNumber(velocity.gainedPerMonth, 1)}
          </span>{" "}
          won against{" "}
          <span className="tabular-nums">
            {formatNumber(velocity.lostPerMonth, 1)}
          </span>{" "}
          lost each month, averaged over {velocity.months}{" "}
          {velocity.months === 1 ? "month" : "months"}.
          {velocity.latestNet != null ? (
            <>
              {" "}
              Last month was{" "}
              <span className="tabular-nums">
                {velocity.latestNet > 0 ? "+" : ""}
                {formatNumber(velocity.latestNet)}
              </span>
              .
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export function BrokenLinkReclaimCard({
  topPages,
}: {
  topPages: BacklinksTopPagesData | undefined;
}) {
  // Read off the Top Pages rows already fetched; nothing here spends.
  const targets: ReclaimTarget[] = findReclaimTargets(
    topPages?.rows ?? [],
    RECLAIM_LIMIT,
  );
  if (targets.length === 0) return null;
  const atStake = countLinksAtStake(targets);

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <InsightIcon icon={Wrench} />
          Broken pages worth reclaiming
        </h3>
        <p className="text-xs text-base-content/60">
          These pages still receive links but are broken.{" "}
          <span className="font-medium text-base-content/80">
            {formatNumber(atStake)}
          </span>{" "}
          {atStake === 1 ? "link is" : "links are"} recoverable by redirecting
          them — the links are already earned, so no outreach is needed.
        </p>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Page</th>
                <th className="text-right">Broken links</th>
                <th className="text-right">Total links</th>
                <th className="text-right">Ref. domains</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.page}>
                  <td className="max-w-md truncate" title={target.page}>
                    {target.page}
                  </td>
                  <td className="text-right tabular-nums font-medium">
                    {formatNumber(target.brokenBacklinks)}
                  </td>
                  <td className="text-right tabular-nums text-base-content/60">
                    {target.totalBacklinks != null
                      ? formatNumber(target.totalBacklinks)
                      : "—"}
                  </td>
                  <td className="text-right tabular-nums text-base-content/60">
                    {target.referringDomains != null
                      ? formatNumber(target.referringDomains)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
