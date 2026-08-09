import { useState, type ReactNode } from "react";
import {
  CaretRight,
  ArrowSquareOut,
  FileX,
  Info,
  Warning,
} from "@phosphor-icons/react";
import type { LighthouseIssue } from "./types";
import type { ComponentProps } from "react";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Table } from "@cloudflare/kumo/components/table";

export function LighthouseIssueRow({ issue }: { issue: LighthouseIssue }) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!(issue.description || issue.items.length > 0);

  return (
    <>
      <Table.Row
        className={`hover:bg-base-200/50 transition-colors ${hasDetails ? "cursor-pointer" : ""}`}
        onClick={() => hasDetails && setOpen(!open)}
      >
        <Table.Cell className="py-3 pl-4 pr-2">
          {hasDetails ? (
            <CaretRight
              className={`size-3.5 text-base-content/40 transition-transform ${open ? "rotate-90" : ""}`}
            />
          ) : null}
        </Table.Cell>
        <Table.Cell className="py-3 pr-3">
          <Badge variant={severityVariant(issue.severity)}>
            {severityIcon(issue.severity)}
            {issue.severity}
          </Badge>
        </Table.Cell>
        <Table.Cell className="py-3 pr-3">
          <div>
            <p className="font-medium text-sm leading-snug">{issue.title}</p>
            {issue.displayValue ? (
              <p className="text-xs text-base-content/50 mt-0.5">
                {issue.displayValue}
              </p>
            ) : null}
          </div>
        </Table.Cell>
        <Table.Cell className="py-3 pr-3 hidden sm:table-cell">
          <span className="text-xs text-base-content/50">{issue.category}</span>
        </Table.Cell>
        <Table.Cell className="py-3 pr-3 hidden md:table-cell text-right">
          {issue.impactMs != null || issue.impactBytes != null ? (
            <span className="text-xs tabular-nums text-base-content/50">
              {issue.impactMs ? formatMs(issue.impactMs) : null}
              {issue.impactMs && issue.impactBytes ? " / " : null}
              {issue.impactBytes ? formatBytes(issue.impactBytes) : null}
            </span>
          ) : null}
        </Table.Cell>
        <Table.Cell className="py-3 pr-4 text-right">
          {issue.score != null ? (
            <span className="text-xs tabular-nums text-base-content/50">
              {issue.score}
            </span>
          ) : null}
        </Table.Cell>
      </Table.Row>
      {open ? (
        <Table.Row className="!bg-transparent">
          <Table.Cell colSpan={6} className="pb-4 pt-2 pl-[8.5rem] pr-4">
            <div className="space-y-3">
              {issue.description ? (
                <div className="text-sm text-base-content/70 leading-relaxed">
                  {renderInlineMarkdown(issue.description)}
                </div>
              ) : null}
              {issue.items.length > 0 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-base-content/60 text-xs">
                    Affected items ({issue.items.length})
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {issue.items.map((item, itemIndex) => (
                      <pre
                        key={`${issue.auditKey}-${itemIndex}`}
                        className="bg-base-200/60 p-2 rounded overflow-x-auto text-xs leading-relaxed"
                      >
                        {item}
                      </pre>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </Table.Cell>
        </Table.Row>
      ) : null}
    </>
  );
}

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function renderInlineMarkdown(markdown: string): ReactNode {
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match = linkPattern.exec(markdown);

  while (match) {
    const [raw, label, href] = match;
    const index = match.index;

    if (index > cursor) {
      nodes.push(markdown.slice(cursor, index));
    }

    nodes.push(
      <a
        key={`${href}-${index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="app-link inline-flex items-center gap-1"
      >
        {label}
        <ArrowSquareOut className="size-3" />
      </a>,
    );

    cursor = index + raw.length;
    match = linkPattern.exec(markdown);
  }

  if (cursor < markdown.length) {
    nodes.push(markdown.slice(cursor));
  }

  return nodes.length ? nodes : markdown;
}

function severityVariant(
  severity: "critical" | "warning" | "info",
): ComponentProps<typeof Badge>["variant"] {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

function severityIcon(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return <FileX className="size-3" />;
  if (severity === "warning") return <Warning className="size-3" />;
  return <Info className="size-3" />;
}
