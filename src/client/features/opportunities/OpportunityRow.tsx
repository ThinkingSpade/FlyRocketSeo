import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  PencilSimpleLine,
  ArrowsSplit,
} from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { Badge } from "@cloudflare/kumo/components/badge";
import { buttonVariants } from "@cloudflare/kumo/components/button";
import { Table } from "@cloudflare/kumo/components/table";
import { toPath } from "@/client/features/link-insights/useLinkInsights";
import type { Opportunity, OpportunityKind } from "./opportunityModel";

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

const KIND_META: Record<
  OpportunityKind,
  { label: string; icon: typeof PencilSimpleLine; variant: BadgeVariant }
> = {
  "quick-win": { label: "Quick win", icon: ArrowUpRight, variant: "success" },
  ctr: { label: "Rewrite title", icon: PencilSimpleLine, variant: "warning" },
  consolidate: { label: "Consolidate", icon: ArrowsSplit, variant: "error" },
};

/** Where each opportunity kind sends you to act on it. A lookup rather than a
 *  ternary chain, because all three branches rendered the same Link with only
 *  the destination differing. */
const ACTION: Record<
  OpportunityKind,
  { label: string; to: string; withQuery?: boolean }
> = {
  consolidate: { label: "Review", to: "/p/$projectId/cannibalization" },
  ctr: { label: "Review", to: "/p/$projectId/search-performance" },
  "quick-win": {
    label: "Build brief",
    to: "/p/$projectId/content",
    withQuery: true,
  },
};

export function OpportunityRow({
  row,
  projectId,
}: {
  row: Opportunity;
  projectId: string;
}) {
  const meta = KIND_META[row.kind];
  const action = ACTION[row.kind];

  return (
    <Table.Row>
      <Table.Cell>
        <Badge variant={meta.variant}>
          <meta.icon className="size-3" />
          {meta.label}
        </Badge>
      </Table.Cell>
      <Table.Cell className="max-w-64">
        <span className="line-clamp-1 font-medium" title={row.query}>
          {row.query}
        </span>
        <span className="line-clamp-1 text-xs text-base-content/50">
          {row.detail}
        </span>
      </Table.Cell>
      <Table.Cell className="max-w-72">
        <a
          href={row.page}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-1 text-xs hover:underline"
        >
          {toPath(row.page)}
        </a>
      </Table.Cell>
      <Table.Cell className="text-right tabular-nums">
        {row.impressions.toLocaleString()}
      </Table.Cell>
      <Table.Cell className="text-right font-semibold tabular-nums">
        +{row.clicksAtStake.toLocaleString()}
      </Table.Cell>
      <Table.Cell className="text-right">
        <Link
          to={action.to}
          params={{ projectId }}
          search={action.withQuery ? { q: row.query } : undefined}
          className={buttonVariants({ variant: "ghost", size: "xs" })}
        >
          {action.label}
        </Link>
      </Table.Cell>
    </Table.Row>
  );
}
