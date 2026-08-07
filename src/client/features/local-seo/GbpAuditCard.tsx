import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  CircleHelp,
  TriangleAlert,
} from "lucide-react";
import { InsightIcon, InsightTile } from "@/client/components/InsightTile";
import type { GbpAudit, GbpCheck } from "./gbpAudit";
import {
  CHECK_STATUS_TONE,
  orderChecksForDisplay,
  scoreBasisHint,
  scoreTone,
} from "./gbpAuditDisplay";
import { GbpListingFixButton } from "./GbpListingFixButton";

// Same icon for every status regardless of severity (warn and fail share
// TriangleAlert) -- mirrors NextStepsCard's TONE_ICON exactly, so severity
// reads through color/tone alone rather than a second, competing visual
// channel.
const STATUS_ICON = {
  pass: CircleCheck,
  warn: TriangleAlert,
  fail: TriangleAlert,
  unknown: CircleHelp,
} as const;

/** The one check a `found: false` audit collapses to already states the
 *  honest reason in full (see gbpAudit.ts) -- surfacing it verbatim beats a
 *  second, vaguer line repeating the same thing less specifically. */
function scoreUnknownHint(checks: GbpCheck[]): string {
  if (checks.length === 1) return checks[0].detail;
  return "Too few of these checks could be verified to score this honestly.";
}

/**
 * Renders the Google Business Profile audit (see gbpAudit.ts) with the
 * app's existing InsightTile/InsightIcon visual language -- no new colors,
 * icon treatment, or card chrome. Takes the already-computed audit as a
 * prop and fetches nothing itself: the caller decides whether a profile has
 * actually been looked up, this component only decides how to show the
 * result once it has.
 */
export function GbpAuditCard({
  audit,
  projectId,
}: {
  audit: GbpAudit;
  /** Optional so existing callers (and any future read-only use of this
   *  card) keep working unchanged -- the "Fix on Google" affordance only
   *  renders when a caller opts in by passing it, and even then only for
   *  checks GBP writing can actually fix (see GbpListingFixButton). */
  projectId?: string;
}) {
  // buildGbpAudit always returns at least one check, even for `found:
  // false` (a single explanatory one) -- this only guards against a future
  // caller mistake ever rendering a bare, checkless shell.
  if (audit.checks.length === 0) return null;

  const orderedChecks = orderChecksForDisplay(audit.checks);

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-32 shrink-0">
            <InsightTile
              icon={BadgeCheck}
              label="GBP score"
              value={audit.score ?? "—"}
              hint={
                audit.score != null
                  ? scoreBasisHint(audit.checks)
                  : scoreUnknownHint(audit.checks)
              }
              tone={scoreTone(audit.score)}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <InsightIcon icon={BadgeCheck} tone="neutral" />
              Business profile audit
            </h2>
            <p className="mt-0.5 text-xs text-base-content/55">
              What Google shows searchers about this listing, scored from what
              we can verify. Checks we can't see are shown last and muted below,
              not counted against the score.
            </p>
          </div>
        </div>

        <ul className="divide-y divide-base-300">
          {orderedChecks.map((check) => (
            <GbpCheckRow key={check.key} check={check} projectId={projectId} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function GbpCheckRow({
  check,
  projectId,
}: {
  check: GbpCheck;
  projectId?: string;
}) {
  const isUnknown = check.status === "unknown";
  return (
    <li
      className={`flex items-start gap-2 py-2 first:pt-0 last:pb-0 ${
        // Unknown checks are gaps in our data, not failings of the profile
        // -- quieting them (rather than coloring them like a real problem)
        // is what keeps them from inflating how bad the profile looks.
        isUnknown ? "opacity-60" : ""
      }`}
    >
      <InsightIcon
        icon={STATUS_ICON[check.status]}
        tone={CHECK_STATUS_TONE[check.status]}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{check.label}</p>
        <p className="text-xs text-base-content/60">{check.detail}</p>
        {check.fix ? (
          <p className="mt-1 flex items-start gap-1 text-xs text-base-content/70">
            <ArrowRight className="mt-0.5 size-3 shrink-0 text-base-content/45" />
            <span>{check.fix}</span>
          </p>
        ) : null}
        {projectId && (check.status === "warn" || check.status === "fail") ? (
          <GbpListingFixButton
            projectId={projectId}
            checkKey={check.key}
            status={check.status}
          />
        ) : null}
      </div>
    </li>
  );
}
