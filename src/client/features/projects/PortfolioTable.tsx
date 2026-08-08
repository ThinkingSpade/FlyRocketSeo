import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronRight, FolderKanban } from "lucide-react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import type { PortfolioProject } from "@/client/features/projects/types";

const integerFormatter = new Intl.NumberFormat();
const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function formatInteger(value: number): string {
  return integerFormatter.format(Math.round(value));
}

function formatCompact(value: number): string {
  return compactFormatter.format(Math.round(value));
}

export function formatPortfolioDate(value: string | null): string {
  if (!value) return "No activity yet";
  const date = ISO_DATE_ONLY.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  return dateFormatter.format(date);
}

function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const change = percentageChange(current, previous);
  if (change === 0) {
    return <span className="text-xs text-base-content/45">0%</span>;
  }
  const improved = change == null || change > 0;
  const Icon = improved ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs tabular-nums text-base-content/55">
      <Icon className="size-3 text-base-content/40" />
      {change == null ? "new" : `${Math.abs(change).toFixed(1)}%`}
    </span>
  );
}

function buildColumns(
  currentProjectId: string | null,
): ColumnDef<PortfolioProject>[] {
  return [
    {
      id: "project",
      accessorFn: (project) => project.name.toLocaleLowerCase(),
      header: ({ column }) => (
        <SortableHeader column={column} label="Project" />
      ),
      cell: ({ row }) => {
        const project = row.original;
        return (
          <Link
            to="/p/$projectId"
            params={{ projectId: project.id }}
            className="group flex min-w-52 items-center justify-between gap-3"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="block truncate font-medium group-hover:underline">
                  {project.name}
                </span>
                {project.id === currentProjectId ? (
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-base-content/45">
                    Current
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-xs text-base-content/50">
                {project.domain ?? "No domain set"}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-base-content/35 transition-transform group-hover:translate-x-0.5" />
          </Link>
        );
      },
      meta: { cellClassName: "min-w-60" },
    },
    {
      id: "gsc",
      accessorFn: (project) =>
        project.gsc.status === "connected"
          ? project.gsc.current.clicks
          : Number.NEGATIVE_INFINITY,
      header: ({ column }) => (
        <SortableHeader column={column} label="GSC performance" />
      ),
      cell: ({ row }) => {
        const { gsc } = row.original;
        if (gsc.status === "not_connected") {
          return (
            <span className="text-sm text-base-content/45">Not connected</span>
          );
        }
        if (gsc.status === "unavailable") {
          return (
            <span className="text-sm text-base-content/45">
              Temporarily unavailable
            </span>
          );
        }
        return (
          <div className="min-w-48 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="font-medium tabular-nums">
                {formatInteger(gsc.current.clicks)}
              </span>
              <span className="text-xs text-base-content/55">clicks</span>
              <Delta
                current={gsc.current.clicks}
                previous={gsc.previous.clicks}
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-base-content/55">
              <span className="tabular-nums">
                {formatCompact(gsc.current.impressions)} impressions
              </span>
              <Delta
                current={gsc.current.impressions}
                previous={gsc.previous.impressions}
              />
            </div>
            <p className="text-[11px] text-base-content/40">
              Previous: {formatInteger(gsc.previous.clicks)} clicks ·{" "}
              {formatCompact(gsc.previous.impressions)} impressions
            </p>
          </div>
        );
      },
      meta: { cellClassName: "min-w-56" },
    },
    {
      id: "audit",
      accessorFn: (project) =>
        project.audit?.issueCount ?? Number.NEGATIVE_INFINITY,
      header: ({ column }) => (
        <SortableHeader column={column} label="Latest audit" />
      ),
      cell: ({ row }) => {
        const { audit } = row.original;
        if (!audit) {
          return <span className="text-sm text-base-content/45">No audit</span>;
        }
        return (
          <div className="min-w-36">
            <p className="text-sm">
              {audit.score == null ? null : (
                <>
                  <span className="font-medium tabular-nums">
                    SEO {audit.score}
                  </span>
                  <span className="text-base-content/35"> · </span>
                </>
              )}
              <span className="tabular-nums">
                {audit.issueCount} {audit.issueCount === 1 ? "issue" : "issues"}
              </span>
            </p>
            <p className="text-xs text-base-content/50">
              {formatPortfolioDate(audit.checkedAt)} · {audit.pagesCrawled}{" "}
              pages
            </p>
          </div>
        );
      },
      meta: { cellClassName: "min-w-44" },
    },
    {
      id: "rankTracking",
      accessorFn: (project) =>
        project.rankTracking?.averagePosition ?? Number.POSITIVE_INFINITY,
      header: ({ column }) => (
        <SortableHeader column={column} label="Rank tracking" />
      ),
      cell: ({ row }) => {
        const rank = row.original.rankTracking;
        if (!rank) {
          return (
            <span className="text-sm text-base-content/45">No snapshot</span>
          );
        }
        return (
          <div className="min-w-36">
            <p className="text-sm">
              <span className="font-medium tabular-nums">
                {rank.averagePosition == null
                  ? "No rankings"
                  : `Avg. #${rank.averagePosition.toFixed(1)}`}
              </span>
            </p>
            <p className="text-xs capitalize text-base-content/50">
              {rank.keywordCount} keywords · {rank.device}
            </p>
            <p className="text-[11px] text-base-content/40">
              {formatPortfolioDate(rank.checkedAt)}
            </p>
          </div>
        );
      },
      meta: { cellClassName: "min-w-44" },
    },
    {
      id: "lastActivity",
      accessorFn: (project) =>
        project.lastActivityAt
          ? Date.parse(project.lastActivityAt)
          : Number.NEGATIVE_INFINITY,
      header: ({ column }) => (
        <SortableHeader column={column} label="Last activity" />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-base-content/65">
          {formatPortfolioDate(row.original.lastActivityAt)}
        </span>
      ),
      meta: { cellClassName: "min-w-40" },
    },
  ];
}

export function PortfolioTable({
  projects,
  currentProjectId,
}: {
  projects: PortfolioProject[];
  currentProjectId: string | null;
}) {
  const navigate = useNavigate();
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "lastActivity", desc: true },
  ]);
  const columns = React.useMemo(
    () => buildColumns(currentProjectId),
    [currentProjectId],
  );
  const table = useAppTable({
    data: projects,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    withSorting: true,
  });

  return (
    <AppDataTable
      table={table}
      wrapperClassName="overflow-x-auto rounded-lg border border-base-300 bg-base-100"
      getRowProps={(row) => ({
        className: "cursor-pointer hover:bg-base-200/40",
        onClick: (event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("a, button")
          ) {
            return;
          }
          void navigate({
            to: "/p/$projectId",
            params: { projectId: row.original.id },
          });
        },
      })}
      empty={
        <div className="rounded-lg border border-base-300 bg-base-100 px-6 py-10 text-center">
          <FolderKanban className="mx-auto size-5 text-base-content/40" />
          <h2 className="mt-2 font-medium">No active projects</h2>
          <p className="mt-1 text-sm text-base-content/55">
            Create a project to start your portfolio.
          </p>
        </div>
      }
    />
  );
}
