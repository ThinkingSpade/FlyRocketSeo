/**
 * Pure view-model for the On-Page Fixes tab (no I/O), split out so the grouping
 * and progress math are unit-testable.
 */

export type OnPageElement = "title" | "meta" | "h1" | "alt";
export type OnPageStatus = "pending" | "approved" | "excluded";

export type FixRow = {
  id: string;
  url: string;
  element: OnPageElement;
  target: string;
  currentValue: string | null;
  suggestedValue: string;
  reason: string;
  source: "rules" | "ai";
  status: OnPageStatus;
};

export const ELEMENT_LABEL: Record<OnPageElement, string> = {
  title: "Page titles",
  meta: "Meta descriptions",
  h1: "H1 headings",
  alt: "Image alt text",
};

const ELEMENT_ORDER: OnPageElement[] = ["title", "meta", "h1", "alt"];

export type ElementProgress = {
  element: OnPageElement;
  label: string;
  total: number;
  approved: number;
  pending: number;
  excluded: number;
};

/** Per-element counts for the progress tiles, in a stable display order. */
export function elementProgress(rows: FixRow[]): ElementProgress[] {
  return ELEMENT_ORDER.map((element) => {
    const forElement = rows.filter((row) => row.element === element);
    return {
      element,
      label: ELEMENT_LABEL[element],
      total: forElement.length,
      approved: forElement.filter((row) => row.status === "approved").length,
      pending: forElement.filter((row) => row.status === "pending").length,
      excluded: forElement.filter((row) => row.status === "excluded").length,
    };
  }).filter((progress) => progress.total > 0);
}

type FixSummary = {
  total: number;
  approved: number;
  pending: number;
  excluded: number;
  /** approved / (total - excluded), 0..1; excluded work isn't "remaining". */
  completion: number;
};

/** Headline counts across every element. */
export function summarize(rows: FixRow[]): FixSummary {
  const approved = rows.filter((row) => row.status === "approved").length;
  const excluded = rows.filter((row) => row.status === "excluded").length;
  const pending = rows.filter((row) => row.status === "pending").length;
  const actionable = rows.length - excluded;
  return {
    total: rows.length,
    approved,
    pending,
    excluded,
    completion: actionable > 0 ? approved / actionable : 0,
  };
}

export type PageGroup = {
  url: string;
  path: string;
  rows: FixRow[];
  pendingCount: number;
};

/** Display a URL as its path, so the grouped list doesn't repeat the domain. */
export function toPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search || "/";
  } catch {
    return url;
  }
}

/**
 * Group fixes by page, most-actionable page first, so the user works down a
 * list that front-loads the pages with the most still to decide.
 */
export function groupByPage(
  rows: FixRow[],
  filter: OnPageStatus | "all" = "all",
): PageGroup[] {
  const visible =
    filter === "all" ? rows : rows.filter((row) => row.status === filter);
  const byUrl = new Map<string, FixRow[]>();
  for (const row of visible) {
    const list = byUrl.get(row.url) ?? [];
    list.push(row);
    byUrl.set(row.url, list);
  }

  return [...byUrl.entries()]
    .map(([url, groupRows]) => ({
      url,
      path: toPath(url),
      rows: groupRows.toSorted(
        (a, b) =>
          ELEMENT_ORDER.indexOf(a.element) - ELEMENT_ORDER.indexOf(b.element),
      ),
      pendingCount: groupRows.filter((row) => row.status === "pending").length,
    }))
    .toSorted(
      (a, b) =>
        b.pendingCount - a.pendingCount || b.rows.length - a.rows.length,
    );
}

/** Ids eligible for a bulk "approve all pending" action. */
export function pendingIds(rows: FixRow[]): string[] {
  return rows.filter((row) => row.status === "pending").map((row) => row.id);
}

/** Ids the AI rewrite pass should target: pending title/meta only. */
export function aiRewritableIds(rows: FixRow[]): string[] {
  return rows
    .filter(
      (row) =>
        row.status === "pending" &&
        (row.element === "title" || row.element === "meta"),
    )
    .map((row) => row.id);
}
