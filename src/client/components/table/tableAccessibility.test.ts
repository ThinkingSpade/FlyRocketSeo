import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppDataTable, useAppTable } from "./AppDataTable";
import { TablePagination } from "./TablePagination";

function TableHarness({
  interactive = false,
  sorted = false,
}: {
  interactive?: boolean;
  sorted?: boolean;
}) {
  const table = useAppTable({
    data: [{ keyword: "office coffee", impressions: 120 }],
    columns: [
      { accessorKey: "keyword", header: "Keyword" },
      { accessorKey: "impressions", header: "Impressions" },
    ],
    withSorting: true,
    state: { sorting: sorted ? [{ id: "impressions", desc: true }] : [] },
  });
  return createElement(AppDataTable<{ keyword: string; impressions: number }>, {
    table,
    stickyHeader: true,
    getRowProps: interactive ? () => ({ onClick: () => undefined }) : undefined,
  });
}

describe("shared table accessibility", () => {
  it("announces a descending sort on the column heading", () => {
    const html = renderToStaticMarkup(
      createElement(TableHarness, { sorted: true }),
    );
    expect(html).toMatch(/<th[^>]*aria-sort="descending"[^>]*>Impressions/);
  });
  it("identifies column headings for assistive technology", () => {
    expect(renderToStaticMarkup(createElement(TableHarness))).toContain(
      'scope="col"',
    );
  });
  it("makes interactive rows reachable by keyboard", () => {
    const html = renderToStaticMarkup(
      createElement(TableHarness, { interactive: true }),
    );
    expect(html).toMatch(/<tr[^>]*tabindex="0"/);
  });
  it("does not add redundant tab stops to ordinary data rows", () => {
    expect(renderToStaticMarkup(createElement(TableHarness))).not.toMatch(
      /<tr[^>]*tabindex="0"/,
    );
  });
  it("sticks the header rather than only changing its background", () => {
    const html = renderToStaticMarkup(createElement(TableHarness));
    expect(html).toMatch(/<th[^>]*class="[^"]*sticky/);
  });
  it("announces the current result range and disables page-size changes while loading", () => {
    const html = renderToStaticMarkup(
      createElement(TablePagination, {
        page: 2,
        pageSize: 25,
        pageSizes: [25, 50],
        totalCount: 125,
        hasNextPage: true,
        isLoading: true,
        onPageChange: () => undefined,
        onPageSizeChange: () => undefined,
      }),
    );
    expect(html).toMatch(/<span[^>]*role="status"[^>]*>26/);
    expect(html).toMatch(/<select[^>]*disabled/);
    expect(html).toContain("26–50 of 125");
  });
});
