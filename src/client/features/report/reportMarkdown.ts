// "Copy for AI" export: the on-screen report as GFM markdown, so the numbers
// can be handed to an agent (or pasted into a doc) without screenshotting.

import {
  auditIssueRows,
  type AuditHealth,
  type ReportEventLike,
  type ReportMovers,
} from "./reportData";

interface ReportRankBlockSnapshot {
  domain: string;
  device: "desktop" | "mobile";
  keywordCount: number;
  visibility: number | null;
  visibilityDelta: number | null;
  ranking: number;
  rankingDelta: number;
  top3: number;
  top10: number;
  improved: number;
  declined: number;
  avgPosition: number | null;
  avgPositionPrevious: number | null;
  movers: ReportMovers;
}

export interface ReportGscSnapshot {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prevClicks: number;
  prevImpressions: number;
}

interface ReportSnapshot {
  projectName: string;
  projectDomain: string | null;
  rangeLabel: string;
  generatedAt: string;
  /** White-label line, when the project has branding configured. */
  branding?: { brandName: string | null; preparedBy: string | null } | null;
  rankBlocks: ReportRankBlockSnapshot[];
  events: ReportEventLike[];
  audit: { completedAt: string | null; health: AuditHealth } | null;
  gsc: ReportGscSnapshot | null;
}

const NBSP_ARROW = " → ";

function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(digits);
}

function signed(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  const rendered = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${rendered}`;
  if (value < 0) return `-${rendered}`;
  return "0";
}

function moverLine(mover: ReportMovers["improved"][number]): string {
  const from =
    mover.previousPosition === null
      ? "not ranking"
      : `#${mover.previousPosition}`;
  const to =
    mover.currentPosition === null
      ? "not ranking"
      : `#${mover.currentPosition}`;
  const volume =
    mover.searchVolume === null ? "" : ` (vol ${mover.searchVolume})`;
  return `- ${mover.keyword}: ${from}${NBSP_ARROW}${to}${volume}`;
}

export function reportToMarkdown(snapshot: ReportSnapshot): string {
  const lines: string[] = [];
  const site = snapshot.projectDomain ?? snapshot.projectName;

  lines.push(`# SEO Report — ${site}`);
  lines.push("");
  lines.push(
    `Period: ${snapshot.rangeLabel} · Generated: ${snapshot.generatedAt} · Source: OpenSEO`,
  );
  const preparedBy = snapshot.branding?.preparedBy;
  const brandName = snapshot.branding?.brandName;
  if (preparedBy || brandName) {
    lines.push(
      `Prepared by: ${[preparedBy, brandName].filter(Boolean).join(" · ")}`,
    );
  }

  for (const block of snapshot.rankBlocks) {
    lines.push("");
    lines.push(`## Rank tracking — ${block.domain} (${block.device})`);
    lines.push("");
    lines.push("| Metric | Value | Change |");
    lines.push("| --- | --- | --- |");
    lines.push(
      `| Visibility | ${num(block.visibility, 1)}% | ${signed(block.visibilityDelta, 1)} pts |`,
    );
    lines.push(
      `| Ranking keywords (of ${block.keywordCount} tracked) | ${block.ranking} | ${signed(block.rankingDelta)} |`,
    );
    lines.push(`| Top 3 | ${block.top3} | |`);
    lines.push(`| Top 10 | ${block.top10} | |`);
    lines.push(
      `| Average position | ${num(block.avgPosition, 1)} | prev ${num(block.avgPositionPrevious, 1)} |`,
    );
    lines.push(
      `| Improved / declined | ${block.improved} / ${block.declined} | |`,
    );

    if (block.movers.improved.length > 0) {
      lines.push("");
      lines.push(`### Top improvements (${block.movers.improvedTotal} total)`);
      lines.push(...block.movers.improved.map(moverLine));
    }
    if (block.movers.declined.length > 0) {
      lines.push("");
      lines.push(`### Biggest declines (${block.movers.declinedTotal} total)`);
      lines.push(...block.movers.declined.map(moverLine));
    }
  }

  if (snapshot.gsc) {
    lines.push("");
    lines.push("## Google Search Console");
    lines.push("");
    lines.push("| Metric | Value | Previous period |");
    lines.push("| --- | --- | --- |");
    lines.push(
      `| Clicks | ${snapshot.gsc.clicks} | ${snapshot.gsc.prevClicks} |`,
    );
    lines.push(
      `| Impressions | ${snapshot.gsc.impressions} | ${snapshot.gsc.prevImpressions} |`,
    );
    lines.push(`| CTR | ${(snapshot.gsc.ctr * 100).toFixed(1)}% | |`);
    lines.push(`| Average position | ${num(snapshot.gsc.position, 1)} | |`);
  }

  if (snapshot.events.length > 0) {
    lines.push("");
    lines.push("## Work log");
    for (const event of snapshot.events) {
      const note = event.note ? ` — ${event.note}` : "";
      lines.push(`- ${event.eventDate}: ${event.title}${note}`);
    }
  }

  if (snapshot.audit) {
    const { health } = snapshot.audit;
    lines.push("");
    lines.push("## Site health (latest audit)");
    lines.push("");
    lines.push(
      `Pages crawled: ${health.pagesCrawled} · OK: ${health.okPages} · Indexable: ${health.indexablePages}`,
    );
    const issues = auditIssueRows(health);
    if (issues.length > 0) {
      lines.push("");
      lines.push("| Issue | Pages |");
      lines.push("| --- | --- |");
      lines.push(...issues.map((row) => `| ${row.label} | ${row.count} |`));
    }
    const { mobile, desktop } = health.lighthouse;
    if (mobile.sampleSize > 0 || desktop.sampleSize > 0) {
      lines.push("");
      lines.push("| Lighthouse (avg) | Mobile | Desktop |");
      lines.push("| --- | --- | --- |");
      lines.push(
        `| Performance | ${num(mobile.performance)} | ${num(desktop.performance)} |`,
      );
      lines.push(`| SEO | ${num(mobile.seo)} | ${num(desktop.seo)} |`);
      lines.push(
        `| Accessibility | ${num(mobile.accessibility)} | ${num(desktop.accessibility)} |`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}
