/**
 * The silhouette of a table, for while its rows are loading.
 *
 * Unlike a per-page skeleton, this one earns being shared: a table is the same
 * shape everywhere — a header strip and a stack of evenly spaced rows — so a
 * generic version cannot drift away from the thing it stands in for the way a
 * whole-page silhouette would.
 *
 * The point is height. A spinner in a padded box is a fraction of a table's
 * height, so the page collapses while loading and is shoved back down when the
 * rows arrive. `rows` defaults to 8 because that is roughly a screen's worth
 * here; pass the page size when it is known, so the reserved space matches what
 * is actually coming.
 *
 * `columns` drives a grid whose first column is wider, matching the near
 * universal shape of these tables: one identifying string (a query, a URL, a
 * domain) followed by numeric columns.
 */
export function TableSkeleton({
  rows = 8,
  columns = 4,
  showHeader = true,
}: {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}) {
  const template = `minmax(0,2fr) repeat(${Math.max(columns - 1, 1)}, minmax(0,1fr))`;

  return (
    <div className="p-4" role="status" aria-label="Loading table">
      {showHeader ? (
        <div
          className="grid items-center gap-3 border-b border-base-300 pb-2"
          style={{ gridTemplateColumns: template }}
          aria-hidden="true"
        >
          {Array.from({ length: columns }, (_, index) => (
            <div key={index} className="h-3 skeleton rounded" />
          ))}
        </div>
      ) : null}
      <div className="mt-2 space-y-2.5" aria-hidden="true">
        {Array.from({ length: rows }, (_row, rowIndex) => (
          <div
            key={rowIndex}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: template }}
          >
            {Array.from({ length: columns }, (_cell, colIndex) => (
              <div key={colIndex} className="h-4 skeleton rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
