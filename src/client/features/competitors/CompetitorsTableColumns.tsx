import type { ColumnDef } from "@tanstack/react-table";
import {
  EyeSlash,
  GitDiff,
  PushPin,
  PushPinSlash,
} from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo/components/button";
import type { CompetitorRow } from "@/server/features/competitors/services/CompetitorsService";
import type { DiscoveryMode } from "@/types/schemas/competitors";

/**
 * Pure display helpers for `CompetitorRow`'s numeric fields. Exported and
 * kept free of JSX/React so they're covered directly in
 * `CompetitorsTableColumns.test.ts` without rendering anything.
 *
 * Every one of these renders `null` as "—", never "0" -- a pinned domain
 * discovery missed reports null metrics because we have no measurement for
 * it, and "0" would assert something false ("beats you on nothing").
 */
export function formatCount(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

export function formatAvgPosition(value: number | null): string {
  return value == null ? "—" : value.toFixed(1);
}

export function formatBeatsYouOn(
  beatsYouCount: number | null,
  seedSize: number,
): string {
  return beatsYouCount == null ? "—" : `${beatsYouCount} of ${seedSize}`;
}

export function formatCoveragePercent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

/** Explicit sign, one decimal -- "-7.6" reads as "7.6 positions ahead of
 *  you"; positive values need an explicit "+" since `toFixed` omits it. */
export function formatPositionDelta(value: number | null): string {
  if (value == null) return "—";
  const rounded = value.toFixed(1);
  return value > 0 ? `+${rounded}` : rounded;
}

type CompetitorColumnActions = {
  onCompareCompetitor: (domain: string) => void;
  onPin: (domain: string) => void;
  onUnpin: (domain: string) => void;
  onExclude: (domain: string) => void;
  /** The one domain with a mutation in flight, if any -- disables just that
   *  row's buttons rather than the whole table. */
  pendingDomain: string | null;
};

function DomainCell({ row }: { row: CompetitorRow }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      {row.pinned ? (
        <PushPin
          aria-hidden="true"
          className="size-3.5 shrink-0 text-base-content/45"
        />
      ) : null}
      {row.domain}
    </span>
  );
}

function RowActionsCell({
  row,
  actions,
}: {
  row: CompetitorRow;
  actions: CompetitorColumnActions;
}) {
  const pending = actions.pendingDomain === row.domain;
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => actions.onCompareCompetitor(row.domain)}
        title="Compare keywords with this competitor"
      >
        <GitDiff className="size-3.5" />
        Keyword Gap
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        shape="square"
        disabled={pending}
        aria-label={row.pinned ? `Unpin ${row.domain}` : `Pin ${row.domain}`}
        title={
          row.pinned
            ? "Unpin this competitor"
            : "Pin this competitor so it's never dropped"
        }
        onClick={() =>
          row.pinned ? actions.onUnpin(row.domain) : actions.onPin(row.domain)
        }
      >
        {row.pinned ? (
          <PushPinSlash className="size-3.5" />
        ) : (
          <PushPin className="size-3.5" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        shape="square"
        disabled={pending}
        aria-label={`Exclude ${row.domain}`}
        title="Exclude this domain from competitors"
        onClick={() => actions.onExclude(row.domain)}
      >
        <EyeSlash className="size-3.5" />
      </Button>
    </div>
  );
}

function domainColumn(): ColumnDef<CompetitorRow> {
  return {
    id: "domain",
    header: "Competitor",
    cell: ({ row }) => <DomainCell row={row.original} />,
  };
}

function actionsColumn(
  actions: CompetitorColumnActions,
): ColumnDef<CompetitorRow> {
  return {
    id: "actions",
    header: "",
    cell: ({ row }) => <RowActionsCell row={row.original} actions={actions} />,
  };
}

function beatsYouOnColumn(seedSize: number): ColumnDef<CompetitorRow> {
  return {
    id: "beatsYouOn",
    header: "Beats you on",
    cell: ({ row }) => formatBeatsYouOn(row.original.beatsYouCount, seedSize),
  };
}

function coverageColumn(): ColumnDef<CompetitorRow> {
  return {
    id: "coverage",
    header: "Coverage",
    cell: ({ row }) => (
      <div>
        <div>{formatCoveragePercent(row.original.coverage)}</div>
        <div className="text-xs text-base-content/45">of your keywords</div>
      </div>
    ),
  };
}

function positionDeltaColumn(): ColumnDef<CompetitorRow> {
  return {
    id: "positionDelta",
    header: "vs you",
    cell: ({ row }) => formatPositionDelta(row.original.positionDelta),
  };
}

function avgPositionColumn(): ColumnDef<CompetitorRow> {
  return {
    id: "avgPosition",
    header: "Avg Position",
    cell: ({ row }) => formatAvgPosition(row.original.avgPosition),
  };
}

function organicKeywordsColumn(): ColumnDef<CompetitorRow> {
  return {
    id: "organicKeywords",
    header: "Organic Keywords",
    cell: ({ row }) => formatCount(row.original.organicKeywords),
  };
}

function trafficColumn(id: string, header: string): ColumnDef<CompetitorRow> {
  return {
    id,
    header,
    cell: ({ row }) => formatCount(row.original.organicTraffic),
  };
}

function sharedKeywordsColumn(): ColumnDef<CompetitorRow> {
  return {
    id: "intersections",
    header: "Shared Keywords",
    cell: ({ row }) => formatCount(row.original.intersections),
  };
}

/**
 * Builds the competitors table's column set -- driven by the PAGE-level
 * `discoveryMode`, not each row's own `source`. A pinned row discovery never
 * returned always carries `source: "serp"` regardless of which mode actually
 * ran (see `applyProjectCompetitors`), so branching per row would produce a
 * mixed, incoherent table; the page already knows which single mode produced
 * this entire result set.
 *
 * Plain function rather than a hook so `CompetitorsTableColumns.test.ts` can
 * assert the column set switching on `discoveryMode` directly, with no
 * rendering involved.
 */
export function buildCompetitorColumns(input: {
  discoveryMode: DiscoveryMode;
  seedSize: number;
  actions: CompetitorColumnActions;
}): ColumnDef<CompetitorRow>[] {
  const domain = domainColumn();
  const actions = actionsColumn(input.actions);

  if (input.discoveryMode === "serp") {
    return [
      domain,
      beatsYouOnColumn(input.seedSize),
      coverageColumn(),
      positionDeltaColumn(),
      avgPositionColumn(),
      trafficColumn("estTraffic", "Est. Traffic"),
      actions,
    ];
  }

  return [
    domain,
    sharedKeywordsColumn(),
    avgPositionColumn(),
    organicKeywordsColumn(),
    trafficColumn("organicTraffic", "Organic Traffic"),
    actions,
  ];
}
