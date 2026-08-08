import {
  ChevronDown,
  Copy,
  Download,
  FileWarning,
  Info,
  Sheet,
  TriangleAlert,
} from "lucide-react";
import type {
  CategoryTab,
  ExportPayload,
  LighthouseIssue,
  LighthouseMetrics,
  LighthouseScores,
} from "./types";
import { LighthouseIssueRow } from "./LighthouseIssueRow";
import { LighthouseIssuesSummary } from "./LighthouseIssuesSummary";
import { categoryLabel } from "./utils";
import { categoryTabs } from "./types";
import { Button } from "@cloudflare/kumo/components/button";
import { Badge } from "@cloudflare/kumo/components/badge";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { Table } from "@cloudflare/kumo/components/table";

export function LighthouseIssuesHeader({
  backLabel,
  onBack,
  scannedAt,
  finalUrl,
  scores,
  metrics,
  severityCounts,
}: {
  backLabel: string;
  onBack: () => void;
  scannedAt?: string;
  finalUrl?: string;
  scores?: LighthouseScores | null;
  metrics?: LighthouseMetrics | null;
  severityCounts: { critical: number; warning: number; info: number };
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="px-2" onClick={onBack}>
          &larr; Back to {backLabel}
        </Button>
        <span className="text-xs text-base-content/60">
          {scannedAt
            ? `Scanned ${new Date(scannedAt).toLocaleString()}`
            : "Reading latest issues..."}
        </span>
      </div>

      <div className="relative flex flex-col rounded-xl bg-base-100 border border-base-300">
        <div className="flex flex-auto flex-col py-5 gap-4 text-sm">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Lighthouse Issues</h1>
            <p className="text-sm text-base-content/70 break-all">
              {finalUrl ?? "Loading URL..."}
            </p>
          </div>
          <LighthouseIssuesSummary scores={scores} metrics={metrics} />
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="border border-error/30 bg-error/10 text-error/80 gap-1">
              <FileWarning className="size-3" />
              Critical {severityCounts.critical}
            </Badge>
            <Badge className="border border-warning/30 bg-warning/10 text-warning/80 gap-1">
              <TriangleAlert className="size-3" />
              Warning {severityCounts.warning}
            </Badge>
            <Badge className="border border-info/30 bg-info/10 text-info/80 gap-1">
              <Info className="size-3" />
              Info {severityCounts.info}
            </Badge>
          </div>
        </div>
      </div>
    </>
  );
}

export function LighthouseIssuesToolbar({
  category,
  categoryCounts,
  selectedCategoryLabel,
  isBusy,
  visibleIssues,
  allIssues,
  onCategoryChange,
  onCopy,
  onExport,
  onExportCsv,
  onExportSheets,
}: {
  category: CategoryTab;
  categoryCounts: Record<CategoryTab, number>;
  selectedCategoryLabel: string;
  isBusy: boolean;
  visibleIssues: LighthouseIssue[];
  allIssues: LighthouseIssue[];
  onCategoryChange: (next: CategoryTab) => void;
  onCopy: (data: ExportPayload, toastMessage: string) => void;
  onExport: (data: ExportPayload) => void;
  onExportCsv: (issues: LighthouseIssue[], variant: "all" | "current") => void;
  onExportSheets: (
    issues: LighthouseIssue[],
    variant: "all" | "current",
  ) => void;
}) {
  const exportCurrentCategory: ExportPayload =
    category === "all" ? { mode: "issues" } : { mode: "category", category };

  const categoryLabelLower = selectedCategoryLabel.toLowerCase();

  return (
    <div className="sticky top-0 z-[2] -mx-2 px-2 py-2 bg-base-100/95 backdrop-blur-sm border-b border-base-300/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CategoryTabs
          category={category}
          categoryCounts={categoryCounts}
          onCategoryChange={onCategoryChange}
        />
        <ExportMenu
          allIssues={allIssues}
          categoryLabelLower={categoryLabelLower}
          exportCurrentCategory={exportCurrentCategory}
          isBusy={isBusy}
          onCopy={onCopy}
          onExport={onExport}
          onExportCsv={onExportCsv}
          onExportSheets={onExportSheets}
          visibleIssues={visibleIssues}
        />
      </div>
    </div>
  );
}

function CategoryTabs({
  category,
  categoryCounts,
  onCategoryChange,
}: {
  category: CategoryTab;
  categoryCounts: Record<CategoryTab, number>;
  onCategoryChange: (next: CategoryTab) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {categoryTabs.map((tab) => (
        <button
          key={tab}
          className={`pb-2 border-b-2 text-sm font-medium transition-colors ${
            category === tab
              ? "border-primary text-base-content"
              : "border-transparent text-base-content/60 hover:text-base-content"
          }`}
          onClick={() => onCategoryChange(tab)}
        >
          <span>{categoryLabel(tab)}</span>
          <span className="ml-1 text-xs opacity-70">
            ({categoryCounts[tab]})
          </span>
        </button>
      ))}
    </div>
  );
}

function ExportMenu({
  allIssues,
  categoryLabelLower,
  exportCurrentCategory,
  isBusy,
  onCopy,
  onExport,
  onExportCsv,
  onExportSheets,
  visibleIssues,
}: {
  allIssues: LighthouseIssue[];
  categoryLabelLower: string;
  exportCurrentCategory: ExportPayload;
  isBusy: boolean;
  onCopy: (data: ExportPayload, toastMessage: string) => void;
  onExport: (data: ExportPayload) => void;
  onExportCsv: (issues: LighthouseIssue[], variant: "all" | "current") => void;
  onExportSheets: (
    issues: LighthouseIssue[],
    variant: "all" | "current",
  ) => void;
  visibleIssues: LighthouseIssue[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button size="sm">
            <Download className="size-4" />
            Export
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        }
      />
      {/* Every Label sits inside its own Group. Base UI reads the label from
          group context and throws without one — the flat `menu-title` list
          this replaces has no equivalent. */}
      <DropdownMenu.Content align="end" className="w-72">
        <DropdownMenu.Group>
          <DropdownMenu.Label>Export to Sheets</DropdownMenu.Label>
          <DropdownMenu.Item
            icon={Sheet}
            disabled={!visibleIssues.length}
            onClick={() => onExportSheets(visibleIssues, "current")}
          >
            Open in Sheets — {categoryLabelLower}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={Sheet}
            disabled={!allIssues.length}
            onClick={() => onExportSheets(allIssues, "all")}
          >
            Open in Sheets — all actionable
          </DropdownMenu.Item>
        </DropdownMenu.Group>

        <DropdownMenu.Group>
          <DropdownMenu.Label>Copy</DropdownMenu.Label>
          <DropdownMenu.Item
            icon={Copy}
            disabled={isBusy}
            onClick={() =>
              onCopy(
                exportCurrentCategory,
                `Copied ${categoryLabelLower} issues`,
              )
            }
          >
            Copy {categoryLabelLower} issues
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={Copy}
            disabled={isBusy}
            onClick={() =>
              onCopy({ mode: "issues" }, "Copied all actionable issues")
            }
          >
            Copy all actionable issues
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={Copy}
            disabled={isBusy}
            onClick={() =>
              onCopy({ mode: "full" }, "Copied saved Lighthouse payload")
            }
          >
            Copy saved Lighthouse payload
          </DropdownMenu.Item>
        </DropdownMenu.Group>

        <DropdownMenu.Group>
          <DropdownMenu.Label>Download JSON</DropdownMenu.Label>
          <DropdownMenu.Item
            inset
            disabled={isBusy}
            onClick={() => onExport(exportCurrentCategory)}
          >
            Download {categoryLabelLower} issues
          </DropdownMenu.Item>
          <DropdownMenu.Item
            inset
            disabled={isBusy}
            onClick={() => onExport({ mode: "issues" })}
          >
            Download all actionable issues
          </DropdownMenu.Item>
          <DropdownMenu.Item
            inset
            disabled={isBusy}
            onClick={() => onExport({ mode: "full" })}
          >
            Download saved Lighthouse payload
          </DropdownMenu.Item>
        </DropdownMenu.Group>

        <DropdownMenu.Group>
          <DropdownMenu.Label>Download CSV</DropdownMenu.Label>
          <DropdownMenu.Item
            inset
            disabled={!visibleIssues.length}
            onClick={() => onExportCsv(visibleIssues, "current")}
          >
            Download {categoryLabelLower} issues
          </DropdownMenu.Item>
          <DropdownMenu.Item
            inset
            disabled={!allIssues.length}
            onClick={() => onExportCsv(allIssues, "all")}
          >
            Download all actionable issues
          </DropdownMenu.Item>
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

export function LighthouseIssueList({
  issues,
  isLoading,
  emptyMessage,
}: {
  issues: LighthouseIssue[];
  isLoading: boolean;
  emptyMessage?: string;
}) {
  if (isLoading) {
    return <p className="text-sm text-base-content/60">Loading issues...</p>;
  }
  if (!issues.length) {
    return (
      <p className="text-sm text-base-content/60">
        {emptyMessage ?? "No actionable issues for this category."}
      </p>
    );
  }
  return (
    <Table className="w-full" layout="fixed">
      <colgroup>
        <col className="w-8" />
        <col className="w-24" />
        <col />
        <col className="w-28 hidden sm:table-column" />
        <col className="w-28 hidden md:table-column" />
        <col className="w-14" />
      </colgroup>
      <Table.Header>
        <Table.Row className="text-xs text-base-content/50 uppercase tracking-wide border-b border-base-300">
          <Table.Head />
          <Table.Head className="font-medium">Severity</Table.Head>
          <Table.Head className="font-medium">Issue</Table.Head>
          <Table.Head className="font-medium hidden sm:table-cell">
            Category
          </Table.Head>
          <Table.Head className="font-medium hidden md:table-cell text-right">
            Impact
          </Table.Head>
          <Table.Head className="font-medium text-right">Score</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body className="divide-y divide-base-300/60">
        {issues.map((issue, issueIndex) => (
          <LighthouseIssueRow
            key={`${issue.category}-${issue.auditKey}-${issueIndex}`}
            issue={issue}
          />
        ))}
      </Table.Body>
    </Table>
  );
}
