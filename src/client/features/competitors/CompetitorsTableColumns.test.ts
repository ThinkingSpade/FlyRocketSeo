import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";
import {
  buildCompetitorColumns,
  formatAvgPosition,
  formatBeatsYouOn,
  formatCoveragePercent,
  formatCount,
  formatPositionDelta,
} from "./CompetitorsTableColumns";
import type { CompetitorRow } from "@/server/features/competitors/services/CompetitorsService";

describe("formatCount", () => {
  it("renders a null metric as an em dash, never 0", () => {
    expect(formatCount(null)).toBe("—");
  });

  it("rounds and localizes a known count", () => {
    expect(formatCount(12345)).toBe("12,345");
  });
});

describe("formatAvgPosition", () => {
  it("renders null as an em dash", () => {
    expect(formatAvgPosition(null)).toBe("—");
  });

  it("formats to one decimal", () => {
    expect(formatAvgPosition(4.567)).toBe("4.6");
  });
});

describe("formatBeatsYouOn", () => {
  it("renders null as an em dash rather than '0 of N' -- a pinned domain discovery missed has no measurement, not a zero", () => {
    expect(formatBeatsYouOn(null, 20)).toBe("—");
  });

  it("renders the count against the seed size", () => {
    expect(formatBeatsYouOn(7, 20)).toBe("7 of 20");
  });

  it("still reports a genuine zero honestly, once it is a real measurement", () => {
    expect(formatBeatsYouOn(0, 20)).toBe("0 of 20");
  });
});

describe("formatCoveragePercent", () => {
  it("renders null as an em dash, never 0% -- this is the exact bug decision 4 forbids", () => {
    expect(formatCoveragePercent(null)).toBe("—");
  });

  it("rounds a coverage fraction to a whole percent", () => {
    expect(formatCoveragePercent(0.634)).toBe("63%");
  });
});

describe("formatPositionDelta", () => {
  it("renders null as an em dash", () => {
    expect(formatPositionDelta(null)).toBe("—");
  });

  it("keeps the sign already produced for a negative delta (ahead of the client)", () => {
    expect(formatPositionDelta(-7.6)).toBe("-7.6");
  });

  it("adds an explicit + sign for a positive delta (behind the client)", () => {
    expect(formatPositionDelta(3.2)).toBe("+3.2");
  });

  it("adds no sign at exactly zero", () => {
    expect(formatPositionDelta(0)).toBe("0.0");
  });
});

describe("buildCompetitorColumns", () => {
  const actions = {
    onCompareCompetitor: vi.fn(),
    onPin: vi.fn(),
    onUnpin: vi.fn(),
    onExclude: vi.fn(),
    pendingDomain: null,
  };

  it("shows the keyword-seeded headline columns for discoveryMode 'serp', and drops the always-null Shared Keywords column", () => {
    const ids = buildCompetitorColumns({
      discoveryMode: "serp",
      seedSize: 20,
      actions,
    }).map((column) => column.id);

    expect(ids).toEqual([
      "domain",
      "beatsYouOn",
      "coverage",
      "positionDelta",
      "avgPosition",
      "estTraffic",
      "actions",
    ]);
    expect(ids).not.toContain("intersections");
  });

  it("leaves today's columns unchanged for discoveryMode 'domain'", () => {
    const ids = buildCompetitorColumns({
      discoveryMode: "domain",
      seedSize: 0,
      actions,
    }).map((column) => column.id);

    expect(ids).toEqual([
      "domain",
      "intersections",
      "avgPosition",
      "organicKeywords",
      "organicTraffic",
      "actions",
    ]);
    expect(ids).not.toContain("beatsYouOn");
    expect(ids).not.toContain("coverage");
    expect(ids).not.toContain("positionDelta");
  });

  it("puts 'Beats you on' immediately after Competitor, as the headline column", () => {
    const columns = buildCompetitorColumns({
      discoveryMode: "serp",
      seedSize: 20,
      actions,
    });

    expect(columns[0].id).toBe("domain");
    expect(columns[1].id).toBe("beatsYouOn");
  });
});

function findColumn(
  columns: ColumnDef<CompetitorRow>[],
  id: string,
): ColumnDef<CompetitorRow> {
  const column = columns.find((c) => c.id === id);
  if (!column) throw new Error(`No column with id "${id}" in this set`);
  return column;
}

/**
 * Invokes a column's own `cell()` against a fixture row, the same way
 * TanStack Table would -- only `row.original` is ever read by any cell in
 * `CompetitorsTableColumns.tsx` (verified by reading every one of them), so
 * only that much of the real, much larger `CellContext` is faked here.
 */
type FakeCellRenderer = (ctx: {
  row: { original: CompetitorRow };
}) => string | ReactElement;

function renderCell(
  column: ColumnDef<CompetitorRow>,
  row: CompetitorRow,
): string {
  if (typeof column.cell !== "function") {
    throw new Error(
      "Expected every column in this file to have a function cell",
    );
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CellContext also carries table/column/getValue/renderValue, none of which any cell in CompetitorsTableColumns.tsx reads (verified by reading every one); faking the full interface would be dead weight for a test. FakeCellRenderer is fully, explicitly typed, so nothing downstream of this line is `any`.
  const cellFn = column.cell as unknown as FakeCellRenderer;
  const result = cellFn({ row: { original: row } });
  return typeof result === "string" ? result : renderToStaticMarkup(result);
}

/**
 * The tests above only ever check the column ID list, never call a column's
 * own `cell()` -- so a field swap inside a cell (e.g. `coverageColumn`
 * reading `row.original.positionDelta`) would pass every test above
 * undetected. This block closes that gap by invoking each `cell()` for
 * real, against a fixture row whose numeric fields are all mutually
 * distinct, so a swap between any two of them changes the rendered output.
 */
describe("column cells", () => {
  const noopActions = {
    onCompareCompetitor: vi.fn(),
    onPin: vi.fn(),
    onUnpin: vi.fn(),
    onExclude: vi.fn(),
    pendingDomain: null,
  };

  // Every numeric field is a different value, and no two formatted outputs
  // collide (11.1, 22, 33, 44, 55%, "6 of 20", -7.7 are all distinguishable
  // substrings), so reading the wrong field is guaranteed to be visible.
  const DISTINCT_ROW: CompetitorRow = {
    domain: "distinct-domain.com",
    avgPosition: 11.1,
    intersections: 22,
    organicKeywords: 33,
    organicTraffic: 44,
    coverage: 0.55,
    beatsYouCount: 6,
    positionDelta: -7.7,
    source: "serp",
    pinned: false,
  };

  // The case decision 4 exists for: discovery never returned this domain,
  // so every metric is null -- and it is pinned, the case where rendering
  // 0 would make the tool lie ("beats you on nothing").
  const UNDISCOVERED_PINNED_ROW: CompetitorRow = {
    domain: "undiscovered-pinned.com",
    avgPosition: null,
    intersections: null,
    organicKeywords: null,
    organicTraffic: null,
    coverage: null,
    beatsYouCount: null,
    positionDelta: null,
    source: "serp",
    pinned: true,
  };

  const serpColumns = buildCompetitorColumns({
    discoveryMode: "serp",
    seedSize: 20,
    actions: noopActions,
  });
  const domainModeColumns = buildCompetitorColumns({
    discoveryMode: "domain",
    seedSize: 0,
    actions: noopActions,
  });

  it("Competitor cell shows this row's own domain", () => {
    const html = renderCell(findColumn(serpColumns, "domain"), DISTINCT_ROW);
    expect(html).toContain("distinct-domain.com");
  });

  it("Competitor cell shows the pin glyph only when the row is pinned", () => {
    const competitorColumn = findColumn(serpColumns, "domain");

    expect(renderCell(competitorColumn, DISTINCT_ROW)).not.toContain(
      "aria-hidden",
    );
    expect(renderCell(competitorColumn, UNDISCOVERED_PINNED_ROW)).toContain(
      "aria-hidden",
    );
  });

  it("Beats you on cell reads beatsYouCount against seedSize, not another field", () => {
    expect(
      renderCell(findColumn(serpColumns, "beatsYouOn"), DISTINCT_ROW),
    ).toBe("6 of 20");
  });

  it("Coverage cell reads coverage, not another field", () => {
    expect(
      renderCell(findColumn(serpColumns, "coverage"), DISTINCT_ROW),
    ).toContain("55%");
  });

  it("vs you cell reads positionDelta, not another field", () => {
    expect(
      renderCell(findColumn(serpColumns, "positionDelta"), DISTINCT_ROW),
    ).toBe("-7.7");
  });

  it("Avg Position cell reads avgPosition, not another field", () => {
    expect(
      renderCell(findColumn(serpColumns, "avgPosition"), DISTINCT_ROW),
    ).toBe("11.1");
  });

  it("Est. Traffic cell reads organicTraffic, not another field", () => {
    expect(
      renderCell(findColumn(serpColumns, "estTraffic"), DISTINCT_ROW),
    ).toBe("44");
  });

  it("Shared Keywords cell (domain mode) reads intersections, not another field", () => {
    expect(
      renderCell(findColumn(domainModeColumns, "intersections"), DISTINCT_ROW),
    ).toBe("22");
  });

  it("Organic Keywords cell reads organicKeywords, not another field", () => {
    expect(
      renderCell(
        findColumn(domainModeColumns, "organicKeywords"),
        DISTINCT_ROW,
      ),
    ).toBe("33");
  });

  it("Organic Traffic cell (domain mode) reads organicTraffic, not another field", () => {
    expect(
      renderCell(findColumn(domainModeColumns, "organicTraffic"), DISTINCT_ROW),
    ).toBe("44");
  });

  it("actions cell's pin button reflects this row's own pinned state, not a fixed default", () => {
    const actionsColumn = findColumn(serpColumns, "actions");

    expect(renderCell(actionsColumn, DISTINCT_ROW)).toContain(
      'aria-label="Pin distinct-domain.com"',
    );
    expect(renderCell(actionsColumn, UNDISCOVERED_PINNED_ROW)).toContain(
      'aria-label="Unpin undiscovered-pinned.com"',
    );
  });

  it("renders every null metric as an em dash on a pinned-but-undiscovered row, never 0", () => {
    expect(
      renderCell(
        findColumn(serpColumns, "beatsYouOn"),
        UNDISCOVERED_PINNED_ROW,
      ),
    ).toBe("—");
    expect(
      renderCell(findColumn(serpColumns, "coverage"), UNDISCOVERED_PINNED_ROW),
    ).toContain("—");
    expect(
      renderCell(
        findColumn(serpColumns, "positionDelta"),
        UNDISCOVERED_PINNED_ROW,
      ),
    ).toBe("—");
    expect(
      renderCell(
        findColumn(serpColumns, "avgPosition"),
        UNDISCOVERED_PINNED_ROW,
      ),
    ).toBe("—");
    expect(
      renderCell(
        findColumn(serpColumns, "estTraffic"),
        UNDISCOVERED_PINNED_ROW,
      ),
    ).toBe("—");
  });
});
