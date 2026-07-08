import { toast } from "sonner";
import { captureClientEvent } from "@/client/lib/posthog";
import type { CsvValue } from "@/client/lib/csv";

/**
 * A single exported keyword row, matching the shape produced by
 * `keywordResearchExportRow`:
 * `[keyword, volume, cpc, competition, keywordDifficulty, intent]`.
 */
export type ExportRow = CsvValue[];

const MARKDOWN_HEADERS = [
  "Keyword",
  "Volume",
  "Difficulty",
  "CPC",
  "Intent",
] as const;

const EM_DASH = "—";

/**
 * Render selected keyword rows as a GitHub-flavored Markdown table — on-brand
 * for pasting straight into an AI chat. Pure and deterministic.
 *
 * Columns are pulled by position from the `keywordResearchExportRow` shape
 * `[keyword, volume, cpc, competition, keywordDifficulty, intent]`. Empty input
 * yields just the header + separator so the structure is always well-formed.
 */
export function keywordsToMarkdown(rows: ExportRow[]): string {
  const header = `| ${MARKDOWN_HEADERS.join(" | ")} |`;
  const separator = `| ${MARKDOWN_HEADERS.map(() => "---").join(" | ")} |`;

  const body = rows.map((row) => {
    const keyword = formatText(row[0]);
    const volume = formatInteger(row[1]);
    const difficulty = formatInteger(row[4]);
    const cpc = formatCpc(row[2]);
    const intent = formatText(row[5]);
    return `| ${keyword} | ${volume} | ${difficulty} | ${cpc} | ${intent} |`;
  });

  return [header, separator, ...body].join("\n");
}

/**
 * Impure counterpart to {@link keywordsToMarkdown}: copy the rows to the
 * clipboard as a Markdown table and surface a toast + analytics event. Shared
 * by the desktop and mobile keyword-research "Copy for AI" actions.
 */
export async function copyKeywordsAsMarkdown(rows: ExportRow[]): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    toast.error("Clipboard is unavailable in this browser");
    return;
  }
  try {
    await navigator.clipboard.writeText(keywordsToMarkdown(rows));
  } catch {
    toast.error("Couldn't copy to clipboard");
    return;
  }
  toast.success(`Copied ${rows.length} keywords as Markdown`);
  captureClientEvent("data:export", {
    source_feature: "keyword_research",
    result_count: rows.length,
    scope: "selection",
  });
}

function isEmpty(value: CsvValue): boolean {
  return value === null || value === undefined || value === "";
}

/** Keep the value on a single cell and avoid breaking the table syntax. */
function escapeCell(value: string): string {
  return value
    .replace(/\|/g, "\\|")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
}

function formatText(value: CsvValue): string {
  if (isEmpty(value)) return EM_DASH;
  return escapeCell(String(value));
}

function formatInteger(value: CsvValue): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return EM_DASH;
  return String(Math.round(value));
}

function formatCpc(value: CsvValue): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return EM_DASH;
  return `$${value.toFixed(2)}`;
}
