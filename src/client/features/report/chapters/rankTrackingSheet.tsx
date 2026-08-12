import type { ReactNode } from "react";
import { Table } from "@cloudflare/kumo/components/table";
import type { getRankChangeDigest } from "@/serverFunctions/rank-tracking";
import { computeBucketTransitions } from "@/client/features/rank-tracking/rankTrackingScorecards";
import { Section } from "@/client/features/report/ReportPrimitives";
import { describeSnapshotGap } from "@/client/features/report/reportReads";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";

/**
 * The blocks a rank-tracking sheet is made of: one tracker's shape, the state
 * of its newest run, the opening sentence, the position-band table, and the
 * movement finding.
 *
 * This sits beside `rankTracking.tsx` rather than inside it only because the
 * chapter outgrew one file. Every sentence below is still the one the printed
 * sheet says, and the reasoning for each is kept with it — the traps these
 * branches exist to avoid (a failed run dated as a completed check, a
 * mobile-only tracker told nothing moved, a band table contradicting the tile
 * above it) are documented on the functions themselves.
 *
 * It may not import the chapter module back: the dependency runs one way, so
 * the strings can be pinned in a test without a React Query context.
 */

/** Rows the movers table prints, per direction. Totals are stated regardless. */
const MAX_IMPROVED = 8;
const MAX_DECLINED = 5;

/** Where `computeBucketTransitions`' bands stop, whatever the tracker's depth. */
const BAND_LIMIT = 20;

/**
 * An empty digest with a run on record is TWO states the digest cannot tell
 * apart: one completed check, or two that agreed exactly. It carries no run
 * count, so the sheet names both readings rather than asserting the one that
 * happens to flatter — "comparisons appear once a second check has completed"
 * is a lie to a client whose second check ran last week and moved nothing.
 */
const NO_COMPARISON =
  "No position changes are on record for these keywords: either nothing moved between the two most recent checks, or only one check has completed so far and there is nothing yet to compare.";

/** The digest compares full runs only, so a partial re-check cannot feed it. */
const NO_FULL_CHECK =
  "No check covering all of these keywords has completed yet, so there are no position changes to compare.";

/**
 * The client-facing names for these reads, fed to the shared vocabulary in
 * `reportReads`. `describeSnapshotGap` emits the house failure sentence
 * verbatim, so a thrown read can never print as "never set up" — the defect
 * this chapter effort exists to fix.
 */
export const HISTORY_SUBJECT = "the saved rank tracking history";
const MOVERS_SUBJECT = "the rank change summary";

type ConfigDigest = Awaited<
  ReturnType<typeof getRankChangeDigest>
>["configs"][number];
type RankMover = ConfigDigest["improved"][number];

/** One tracker, already domain-gated, with its reads resolved. */
export type RankTrackingConfigRead = {
  configId: string;
  locationLabel: string;
  device: "desktop" | "mobile";
  serpDepth: number;
  keywordCount: number;
  /**
   * `completedAt` of the newest run BY START TIME, whatever its status — not
   * "the last successful check". A pending or running check is the newest run
   * and carries a null `completedAt`; a FAILED run carries a real one. Read it
   * only alongside `lastRunStatus`, never as a gate on its own.
   */
  lastRunCompletedAt: string | null;
  /** Status of that same newest-by-start run: pending/running/completed/failed. */
  lastRunStatus: string | null;
  /** Why a scheduled check was skipped, e.g. "insufficient_credits". */
  lastSkipReason: string | null;
  /** Positions from COMPLETED runs only, so they outlive a failed newest run. */
  rows: RankTrackingRow[];
  rowsError: boolean;
  rowsPending: boolean;
  /** Null when the digest read failed or has not settled. */
  digest: ConfigDigest | null;
};

/** The two digest read flags, the only part of the chapter's data this needs. */
type MoversReads = { moversError: boolean; moversPending: boolean };

/**
 * What the newest run was actually doing, which is the difference between "we
 * found nothing" and "nothing finished in time to look".
 */
type CheckState =
  | { kind: "never" }
  | { kind: "running" }
  | { kind: "failed"; on: string | null; outOfCredits: boolean }
  | { kind: "completed"; on: string | null };

export function checkState(config: RankTrackingConfigRead): CheckState {
  const on = formatDate(config.lastRunCompletedAt);
  const status = config.lastRunStatus;
  if (status === "pending" || status === "running") return { kind: "running" };
  if (status === "failed") {
    return {
      kind: "failed",
      on,
      outOfCredits: config.lastSkipReason === "insufficient_credits",
    };
  }
  // `on != null` keeps a cached summary from before `lastRunStatus` existed
  // reading as a completed check rather than as one that never ran.
  if (status === "completed" || on != null) return { kind: "completed", on };
  return { kind: "never" };
}

/**
 * The clause that keeps a printed date honest when the newest run is not the
 * one the positions came from. Empty for a plain completed check.
 */
export function runNote(state: CheckState): string {
  if (state.kind === "running") {
    return " A newer check was still running when this report was generated, so these positions come from the most recent check that completed.";
  }
  if (state.kind === "failed") {
    const when = state.on ? ` on ${state.on}` : "";
    return state.outOfCredits
      ? ` The check due after them did not run${when} because the account was out of rank-check credits, so these positions come from the most recent check that completed.`
      : ` The most recent check failed${when}, so these positions come from the last check that completed.`;
  }
  return "";
}

export function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

function formatDate(value: string | null): string | null {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { dateStyle: "long" });
}

/** The house failure/loading/other-domain vocabulary, from `reportReads`. */
export function readGap(
  subject: string,
  isError: boolean,
  restoring: boolean,
  otherDomain = false,
): string | null {
  return describeSnapshotGap({
    subject,
    isError,
    restoring,
    outcome: null,
    otherDomain,
  });
}

/**
 * The sheet's opening sentence, and the one place a date is attached to the
 * positions on it. Exported so the date rules can be asserted as strings.
 */
export function describeTrackerHeader(
  config: RankTrackingConfigRead,
  domain: string | null,
): string {
  const state = checkState(config);
  // Only a completed newest run may be printed as "the most recent check
  // completed on": a failed run also carries a `completedAt`, and dating these
  // positions with it would credit a check that stored nothing.
  const completedOn = state.kind === "completed" ? state.on : null;
  return `We track ${plural(config.keywordCount, "keyword")} for ${domain ?? "this project"} in ${config.locationLabel} on ${config.device}${
    completedOn ? `, and the most recent check completed on ${completedOn}` : ""
  }.${runNote(state)}`;
}

/**
 * The position-band table, and the sentence that keeps it from contradicting
 * the tile above it.
 *
 * `computeBucketTransitions` bands stop at 20 and dump everything past them —
 * including keywords ranked 21..serpDepth, which the "Ranking keywords" tile
 * counts — into one row it calls "Not ranking". On a default tracker (depth 40)
 * that prints "Ranking keywords: 12" and "Not ranking: 12" on one sheet. The
 * row is renamed for what every member of it actually has in common, and the
 * gap between the bands and this tracker's depth is stated rather than hidden.
 */
export function buildBandRows(config: RankTrackingConfigRead): {
  rows: Array<{ key: string; cells: Array<string | number> }>;
  note: string;
} {
  const rows = computeBucketTransitions(config.rows, config.device).map(
    (b) => ({
      key: b.label,
      cells: [
        b.label === "Not ranking" ? `Not in the top ${BAND_LIMIT}` : b.label,
        b.previous,
        b.current,
      ],
    }),
  );
  const note =
    config.serpDepth > BAND_LIMIT
      ? ` These bands stop at position ${BAND_LIMIT} while this tracker checks to position ${config.serpDepth}, so a keyword ranked ${BAND_LIMIT + 1}–${config.serpDepth} counts as ranking in the figures above and sits in the last row here.`
      : "";
  return { rows, note };
}

/**
 * The report's one table shape — first column labels, the rest right-aligned
 * numerics — copied from the striking-distance table in ReportSections so both
 * printed tables look like one report.
 */
const cellClass = (index: number) =>
  index === 0 ? "max-w-xs" : "text-right tabular-nums";

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<{ key: string; cells: ReactNode[] }>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <Table>
        <Table.Header>
          <Table.Row>
            {columns.map((column, index) => (
              <Table.Head key={column} className={cellClass(index)}>
                {column}
              </Table.Head>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.key}>
              {row.cells.map((cell, index) => (
                <Table.Cell key={columns[index]} className={cellClass(index)}>
                  {cell}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}

/** Never a number for an added or lost keyword: the digest deliberately
 *  refuses to subtract through a missing rank, and "+40" would be invented. */
function moverCell({ delta, currentPosition }: RankMover): ReactNode {
  const good = delta == null ? currentPosition != null : delta > 0;
  const text =
    delta == null
      ? good
        ? "New"
        : "Lost"
      : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
  const tone = good ? "text-success" : "text-error";
  return <span className={`font-medium ${tone}`}>{text}</span>;
}

/** Either a table of movers with its true totals, or the reason there is none. */
type MovementBlock =
  | { kind: "note"; subtitle: string | null; text: string }
  | {
      kind: "table";
      subtitle: string;
      movers: RankMover[];
      footnote: string;
    };

/**
 * What this sheet may say about movement — the whole finding as strings, so the
 * sentences below can be pinned in a test rather than in a client's PDF.
 *
 * The digest is narrower than the tiles above it in two ways that both used to
 * print as "nothing moved": it diffs DESKTOP snapshots only (`DIGEST_DEVICE` in
 * rankDigest.ts), and it routes keywords that entered or dropped out into
 * added/lost rather than improved/declined. Neither is an absence.
 */
export function describeMovement(
  config: RankTrackingConfigRead,
  reads: MoversReads,
): MovementBlock {
  // A mobile-only tracker writes no desktop snapshot, ever, so its digest is
  // empty for every run it has made. "No position changes" would state the
  // opposite of the truth for a tracker with years of movement.
  if (config.device !== "desktop") {
    return {
      kind: "note",
      subtitle: null,
      text: `Position changes are compared on desktop results, and this tracker checks ${config.locationLabel} on mobile only, so no movement comparison is available for it.`,
    };
  }

  const digest = config.digest;
  if (digest == null) {
    // A failed digest costs this block, not the sheet: the standing above comes
    // from a different query and is still true. It must never read as "no
    // keyword moved", which is a finding we did not make.
    return {
      kind: "note",
      subtitle: null,
      text:
        readGap(MOVERS_SUBJECT, reads.moversError, reads.moversPending) ??
        "The rank change summary held nothing for this tracker.",
    };
  }

  // `latestRunAt` is the LATER of the two runs compared, not the baseline, so
  // it is named as such rather than dating "the check before the latest one".
  const comparedOn = formatDate(digest.latestRunAt);
  const subtitle = `Movement between the two most recent completed checks${
    comparedOn ? `, the later of which completed on ${comparedOn}` : ""
  }. This is a different comparison window from the figures above.`;
  const movers = digest.improved
    .slice(0, MAX_IMPROVED)
    .concat(digest.declined.slice(0, MAX_DECLINED));

  // Either count being non-zero also proves two runs WERE compared — which is
  // exactly what the empty-table branch may not assume on its own.
  const entries = digest.addedCount > 0 || digest.lostCount > 0;
  const entryLine = `${plural(digest.addedCount, "keyword")} entered the results and ${plural(digest.lostCount, "keyword")} dropped out of them over the same period.`;

  if (movers.length === 0) {
    if (entries) {
      return {
        kind: "note",
        subtitle,
        text: `${entryLine} No keyword that ranked in both checks changed position.`,
      };
    }
    return {
      kind: "note",
      subtitle: null,
      text: digest.latestRunAt == null ? NO_FULL_CHECK : NO_COMPARISON,
    };
  }

  // The table is capped; the counts under it are the true totals, so a cap can
  // never read as a finding.
  const capped =
    digest.improvedCount > MAX_IMPROVED || digest.declinedCount > MAX_DECLINED;
  const totals = `${plural(digest.improvedCount, "keyword")} improved and ${plural(digest.declinedCount, "keyword")} declined between these two checks${
    capped
      ? `; the table lists the ${Math.min(digest.improvedCount, MAX_IMPROVED)} largest gains and the ${Math.min(digest.declinedCount, MAX_DECLINED)} largest drops`
      : ""
  }.`;

  return {
    kind: "table",
    subtitle,
    movers,
    footnote: entries ? `${totals} ${entryLine}` : totals,
  };
}

/**
 * The movers, declines included. A retainer report that prints only the wins is
 * padding, and the declines are what justify next month's work.
 */
export function MoversSection({
  config,
  data,
}: {
  config: RankTrackingConfigRead;
  data: MoversReads;
}) {
  const block = describeMovement(config, data);
  const title = "Keywords that moved";
  if (block.kind === "note") {
    return (
      <Section title={title} subtitle={block.subtitle ?? undefined}>
        <p className="text-xs text-base-content/60">{block.text}</p>
      </Section>
    );
  }

  return (
    <Section title={title} subtitle={block.subtitle}>
      <DataTable
        columns={["Keyword", "Was", "Now", "Change"]}
        rows={block.movers.map((mover) => ({
          key: mover.keyword,
          cells: [
            <span key={mover.keyword} className="line-clamp-1">
              {mover.keyword}
            </span>,
            mover.previousPosition ?? "—",
            mover.currentPosition ?? "—",
            moverCell(mover),
          ],
        }))}
      />
      <p className="text-xs text-base-content/60">{block.footnote}</p>
    </Section>
  );
}
