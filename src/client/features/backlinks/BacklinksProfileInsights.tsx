import { Download, Gauge, ShieldAlert, Tag, Waypoints } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import { downloadTextFile } from "@/client/lib/csv";
import type { BacklinksOverviewResult } from "@/types/schemas/backlinks-results";
import { computeAnchorHealth } from "./anchorHealth";
import { computeDomainQuality } from "./domainQuality";
import { computeNofollowExposure } from "./followSplit";
import {
  auditToxicDomains,
  buildDisavowFile,
  buildDisavowFilename,
} from "./disavow";
import type {
  BacklinksAnchorsData,
  BacklinksReferringDomainsData,
} from "./backlinksPageTypes";
import { Button } from "@cloudflare/kumo/components/button";

/**
 * Four reads on the link profile that cost nothing extra: each derives from
 * bytes the overview or a results sub-tab already fetched. They render for a
 * restored run too, since none of them can trigger a metered call.
 */

const TOXIC_PREVIEW_LIMIT = 8;

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function InsightCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: typeof Gauge;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <InsightIcon icon={icon} />
            {title}
          </h3>
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}

/** A labelled proportion bar, reused by the anchor and quality breakdowns. */
function ShareBar({
  label,
  value,
  share,
  max,
}: {
  label: string;
  value: number;
  share: number;
  max: number;
}) {
  return (
    <li className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-base-content/60">
          {formatNumber(value)} · {formatPercent(share)}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-base-200">
        <div
          className="h-full rounded-full bg-primary/60"
          style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
        />
      </div>
    </li>
  );
}

export function FollowSplitCard({
  summary,
}: {
  summary: BacklinksOverviewResult["summary"];
}) {
  const exposure = computeNofollowExposure(
    summary.referringDomains,
    summary.referringDomainsNofollow,
  );
  if (!exposure) return null;

  const tone =
    exposure.verdict === "nofollow-heavy"
      ? "text-warning"
      : exposure.verdict === "unusually-clean"
        ? "text-base-content/70"
        : "text-success";

  return (
    <InsightCard title="Nofollow exposure" icon={Waypoints}>
      <p className={`text-lg font-semibold ${tone}`}>
        <span className="tabular-nums">{formatNumber(exposure.nofollow)}</span>{" "}
        <span className="text-sm font-normal text-base-content/60">
          of {formatNumber(exposure.total)} referring domains send a nofollow
          link
        </span>
      </p>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-base-200"
        role="img"
        aria-label={`${formatPercent(exposure.nofollowShare)} of referring domains send at least one nofollow link`}
      >
        <div
          className="h-full bg-primary/70"
          style={{ width: `${(1 - exposure.nofollowShare) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-base-content/60">
        <span>
          No nofollow at all {formatNumber(exposure.cleanDofollow)} (
          {formatPercent(1 - exposure.nofollowShare)})
        </span>
        <span>Some nofollow {formatPercent(exposure.nofollowShare)}</span>
      </div>
      <p className="text-xs text-base-content/60">{exposure.note}</p>
    </InsightCard>
  );
}

export function AnchorHealthCard({
  anchors,
  target,
}: {
  anchors: BacklinksAnchorsData | undefined;
  target: string;
}) {
  const health = computeAnchorHealth(anchors?.rows ?? [], target);
  if (!health) return null;

  const max = Math.max(...health.categories.map((row) => row.mentions));
  const tone =
    health.verdict === "over-optimized"
      ? "text-error"
      : health.verdict === "watch"
        ? "text-warning"
        : "text-success";

  return (
    <InsightCard title="Anchor text health" icon={Tag}>
      <p className={`text-sm font-medium ${tone}`}>
        {health.verdict === "over-optimized"
          ? "Over-optimized"
          : health.verdict === "watch"
            ? "Worth watching"
            : "Natural spread"}
      </p>
      <ul className="space-y-1.5">
        {health.categories.map((row) => (
          <ShareBar
            key={row.category}
            label={row.label}
            value={row.mentions}
            share={row.share}
            max={max}
          />
        ))}
      </ul>
      <p className="text-xs text-base-content/60">{health.note}</p>
      <p className="text-xs text-base-content/40">
        Across {formatNumber(health.totalMentions)} anchor mentions on this
        page. A domain that links with several different anchors is counted once
        per anchor.
      </p>
    </InsightCard>
  );
}

export function DomainQualityCard({
  referringDomains,
}: {
  referringDomains: BacklinksReferringDomainsData | undefined;
}) {
  const quality = computeDomainQuality(referringDomains?.rows ?? []);
  if (!quality) return null;

  const max = Math.max(...quality.buckets.map((bucket) => bucket.domains));

  return (
    <InsightCard title="Referring domain quality" icon={Gauge}>
      <p className="text-lg font-semibold">
        <span className="tabular-nums">
          {formatNumber(quality.strongDomains)}
        </span>{" "}
        <span className="text-sm font-normal text-base-content/60">
          at DR 30+ · median DR{" "}
          <span className="tabular-nums">{quality.medianRank}</span>
        </span>
      </p>
      <ul className="space-y-1.5">
        {quality.buckets.map((bucket) => (
          <ShareBar
            key={bucket.label}
            label={`DR ${bucket.label}`}
            value={bucket.domains}
            share={bucket.share}
            max={max}
          />
        ))}
      </ul>
      <p className="text-xs text-base-content/60">{quality.note}</p>
    </InsightCard>
  );
}

export function ToxicLinksCard({
  referringDomains,
  target,
}: {
  referringDomains: BacklinksReferringDomainsData | undefined;
  target: string;
}) {
  const audit = auditToxicDomains(referringDomains?.rows ?? []);
  if (audit.candidates.length === 0) return null;

  const preview = audit.candidates.slice(0, TOXIC_PREVIEW_LIMIT);

  return (
    <InsightCard
      title="Toxic links worth reviewing"
      icon={ShieldAlert}
      action={
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() =>
            downloadTextFile(
              buildDisavowFilename(target),
              buildDisavowFile(audit, target, new Date()),
            )
          }
        >
          <Download className="size-3.5" />
          Disavow file
        </Button>
      }
    >
      <p className="text-xs text-base-content/60">
        <span className="font-medium text-base-content/80">
          {formatNumber(audit.candidates.length)}
        </span>{" "}
        {audit.candidates.length === 1 ? "domain" : "domains"} scored{" "}
        {audit.threshold} or higher for spam, carrying{" "}
        <span className="font-medium text-base-content/80">
          {formatNumber(audit.affectedBacklinks)}
        </span>{" "}
        {audit.affectedBacklinks === 1 ? "backlink" : "backlinks"}. The download
        is a Google-format disavow file —{" "}
        <span className="font-medium">review every line before uploading</span>,
        since disavowing a good link costs ranking.
      </p>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Domain</th>
              <th className="text-right">Spam score</th>
              <th className="text-right">DR</th>
              <th className="text-right">Backlinks</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((candidate) => (
              <tr key={candidate.domain}>
                <td className="max-w-md truncate" title={candidate.domain}>
                  {candidate.domain}
                </td>
                <td className="text-right tabular-nums font-medium text-error">
                  {candidate.spamScore}
                </td>
                <td className="text-right tabular-nums text-base-content/60">
                  {candidate.rank ?? "—"}
                </td>
                <td className="text-right tabular-nums text-base-content/60">
                  {formatNumber(candidate.backlinks)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {audit.candidates.length > preview.length ? (
        <p className="text-xs text-base-content/40">
          Showing the {preview.length} worst — the download includes all{" "}
          {audit.candidates.length}.
        </p>
      ) : null}
    </InsightCard>
  );
}
