import { Flag } from "lucide-react";
import { EVENT_MARKER_COLOR } from "@/client/features/rank-tracking/ProjectEventsMarkers";
import { formatEventDate } from "@/client/features/rank-tracking/projectEventMarkers";
import {
  auditIssueRows,
  type AuditHealth,
  type ReportEventLike,
} from "./reportData";
import type { ReportGscSnapshot } from "./reportMarkdown";
import {
  formatNumber,
  ReportSection,
  SectionNote,
  StatTile,
} from "./ReportPrimitives";

/** The period's work log — the "what we did" clients actually ask about. */
export function ReportEventsSection({
  events,
  rangeLabel,
}: {
  events: ReportEventLike[];
  rangeLabel: string;
}) {
  return (
    <ReportSection
      title="Work log"
      subtitle={`Site events recorded in the ${rangeLabel.toLowerCase()}`}
    >
      {events.length === 0 ? (
        <SectionNote>
          No site events recorded in this period. Log events from Rank Tracking
          to build the story behind ranking moves.
        </SectionNote>
      ) : (
        <ul className="space-y-1.5">
          {events.map((event) => (
            <li key={event.id} className="flex items-baseline gap-2.5">
              <Flag
                className="size-3 shrink-0 translate-y-0.5"
                style={{ color: EVENT_MARKER_COLOR }}
              />
              <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-base-content/50">
                {formatEventDate(event.eventDate)}
              </span>
              <span className="min-w-0 text-sm">
                {event.title}
                {event.note ? (
                  <span className="text-base-content/50"> — {event.note}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ReportSection>
  );
}

export function ReportGscSection({ gsc }: { gsc: ReportGscSnapshot }) {
  return (
    <ReportSection
      title="Google Search Console"
      subtitle="Clicks and impressions from Google Search, vs the previous period"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="Clicks"
          value={formatNumber(gsc.clicks)}
          delta={gsc.clicks - gsc.prevClicks}
        />
        <StatTile
          label="Impressions"
          value={formatNumber(gsc.impressions)}
          delta={gsc.impressions - gsc.prevImpressions}
        />
        <StatTile label="CTR" value={`${(gsc.ctr * 100).toFixed(1)}%`} />
        <StatTile label="Avg position" value={formatNumber(gsc.position)} />
      </div>
    </ReportSection>
  );
}

export function ReportAuditSection({
  completedAt,
  startUrl,
  health,
}: {
  completedAt: string | null;
  startUrl: string;
  health: AuditHealth;
}) {
  const issues = auditIssueRows(health);
  const { mobile, desktop } = health.lighthouse;
  const completedLabel = completedAt
    ? new Date(completedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <ReportSection
      title="Site health"
      subtitle={`Latest site audit of ${startUrl}${completedLabel ? ` · ${completedLabel}` : ""}`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Pages crawled" value={String(health.pagesCrawled)} />
        <StatTile label="OK (2xx)" value={String(health.okPages)} />
        <StatTile label="Indexable" value={String(health.indexablePages)} />
        <StatTile label="Broken" value={String(health.brokenPages)} />
      </div>

      {issues.length === 0 ? (
        <SectionNote>No on-page issues found in the latest audit.</SectionNote>
      ) : (
        <table className="table table-xs">
          <thead>
            <tr className="border-base-300 text-[11px] uppercase tracking-wide text-base-content/50">
              <th className="pl-0">Issue</th>
              <th className="pr-0 text-right">Pages</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.label} className="border-base-200">
                <td className="pl-0">{issue.label}</td>
                <td className="pr-0 text-right font-mono">{issue.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {mobile.sampleSize > 0 || desktop.sampleSize > 0 ? (
        <div>
          <p className="pb-1 text-xs font-semibold text-base-content/70">
            Average Lighthouse scores
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ScorePair
              label="Performance"
              mobile={mobile.performance}
              desktop={desktop.performance}
            />
            <ScorePair label="SEO" mobile={mobile.seo} desktop={desktop.seo} />
            <ScorePair
              label="Accessibility"
              mobile={mobile.accessibility}
              desktop={desktop.accessibility}
            />
            <ScorePair
              label="Best practices"
              mobile={mobile.bestPractices}
              desktop={desktop.bestPractices}
            />
          </div>
        </div>
      ) : null}
    </ReportSection>
  );
}

const renderScore = (value: number | null) =>
  value === null ? "—" : String(Math.round(value));

function ScorePair({
  label,
  mobile,
  desktop,
}: {
  label: string;
  mobile: number | null;
  desktop: number | null;
}) {
  return (
    <div className="rounded-lg border border-base-300 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-base-content/50">
        {label}
      </p>
      <p className="text-sm tabular-nums">
        <span className="font-semibold">{renderScore(mobile)}</span>
        <span className="text-base-content/40"> mobile · </span>
        <span className="font-semibold">{renderScore(desktop)}</span>
        <span className="text-base-content/40"> desktop</span>
      </p>
    </div>
  );
}
