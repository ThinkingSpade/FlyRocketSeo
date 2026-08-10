import type { BacklinksTab } from "@/types/schemas/backlinks";
import { describeSpamScore } from "@/client/lib/spamScore";
import type { BacklinksOverviewData } from "./backlinksPageTypes";

export type SummaryStat = {
  label: string;
  value: string;
  description: string;
  hint?: string;
  tone: "neutral" | "success" | "warning" | "error";
};

export const TAB_DESCRIPTIONS: Record<BacklinksTab, string> = {
  backlinks:
    "See the individual links pointing to your target, including source page, anchor text, and link quality signals.",
  domains:
    "View the unique domains linking to your target, grouped at the site level instead of by individual link.",
  pages:
    "See which pages on the target site attract the most backlinks and referring domains.",
  anchors:
    "See the anchor text used across all links to your target, with how many backlinks and domains use each phrase.",
};

export function buildSummaryStats(
  data: BacklinksOverviewData | undefined,
): SummaryStat[] {
  if (!data) return [];

  const backlinkSpam = describeSpamScore(data.summary.backlinksSpamScore);
  const targetSpam = describeSpamScore(data.summary.targetSpamScore);

  return [
    {
      label: "Backlinks",
      value:
        data.summary.backlinks == null
          ? "—"
          : formatNumber(data.summary.backlinks),
      description: "Total links pointing to this site or page.",
      hint: data.summary.backlinks == null ? "Not available" : undefined,
      tone: "neutral",
    },
    {
      label: "Referring domains",
      value:
        data.summary.referringDomains == null
          ? "—"
          : formatNumber(data.summary.referringDomains),
      description: "Unique domains linking to this site or page.",
      hint: data.summary.referringDomains == null ? "Not available" : undefined,
      tone: "neutral",
    },
    {
      label: "Referring pages",
      value:
        data.summary.referringPages == null
          ? "—"
          : formatNumber(data.summary.referringPages),
      description: "Unique pages linking to this site or page.",
      hint: data.summary.referringPages == null ? "Not available" : undefined,
      tone: "neutral",
    },
    {
      label: "Domain authority",
      value:
        data.summary.rank == null
          ? "—"
          : `${formatNumber(data.summary.rank)}/100`,
      description: "DataForSEO Domain Rank, a 0–100 authority score.",
      hint:
        data.summary.rank == null
          ? "Not available"
          : data.summary.rank === 0
            ? "No measurable authority yet"
            : undefined,
      tone: "neutral",
    },
    {
      label: "Backlink spam score",
      value:
        backlinkSpam.tier === "unavailable"
          ? backlinkSpam.formatted
          : `${backlinkSpam.formatted}/100`,
      description: "Estimated spam risk of links pointing here.",
      hint:
        backlinkSpam.guidance == null
          ? backlinkSpam.label
          : `${backlinkSpam.label} · ${backlinkSpam.guidance}`,
      tone: backlinkSpam.tone,
    },
    {
      label: "Broken backlinks",
      value:
        data.summary.brokenBacklinks == null
          ? "—"
          : formatNumber(data.summary.brokenBacklinks),
      description: "Links pointing to broken pages here.",
      hint:
        data.summary.brokenBacklinks == null
          ? "Not available"
          : data.summary.brokenBacklinks === 0
            ? "None found"
            : undefined,
      tone:
        data.summary.brokenBacklinks == null
          ? "neutral"
          : data.summary.brokenBacklinks === 0
            ? "success"
            : "warning",
    },
    {
      label: "Broken pages",
      value:
        data.summary.brokenPages == null
          ? "—"
          : formatNumber(data.summary.brokenPages),
      description: "Broken pages here that still have backlinks.",
      hint:
        data.summary.brokenPages == null
          ? "Not available"
          : data.summary.brokenPages === 0
            ? "None found"
            : undefined,
      tone:
        data.summary.brokenPages == null
          ? "neutral"
          : data.summary.brokenPages === 0
            ? "success"
            : "warning",
    },
    {
      label: "Target spam score",
      value:
        targetSpam.tier === "unavailable"
          ? targetSpam.formatted
          : `${targetSpam.formatted}/100`,
      description: "Estimated spam risk of this site or page.",
      hint:
        targetSpam.guidance == null
          ? targetSpam.label
          : `${targetSpam.label} · ${targetSpam.guidance}`,
      tone: targetSpam.tone,
    },
  ];
}

export function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(Math.round(value));
}

export function formatDecimal(value: number | null | undefined) {
  if (value == null) return "-";
  return value.toFixed(value >= 100 ? 0 : 1);
}

export function formatTooltipValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  return "-";
}

export function formatCompactDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMonthLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

export function formatRelativeTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "recently";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function extractUrlPath(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return url;
  }
}

export function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const sideLength = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, sideLength)}...${value.slice(-sideLength)}`;
}
