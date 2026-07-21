type CtrRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  missedClicks: number;
};

function toPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

/** Queries ranking well but clicked far below the benchmark for their
 *  position — each row is a title/meta rewrite candidate, sized by the
 *  clicks it's leaving on the table. */
export function CtrOpportunitiesTable({ rows }: { rows: CtrRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-base-content/60">
        No CTR laggards found — every well-ranking query is earning a healthy
        share of clicks.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Query</th>
            <th>Page</th>
            <th className="text-right">Position</th>
            <th className="text-right">Impressions</th>
            <th className="text-right">CTR</th>
            <th className="text-right" title="Estimated clicks lost per period">
              Missed clicks
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.query}::${row.page}`}>
              <td className="max-w-xs">
                <span className="line-clamp-1">{row.query}</span>
              </td>
              <td className="max-w-xs">
                <span className="line-clamp-1">{toPath(row.page)}</span>
              </td>
              <td className="text-right tabular-nums">
                {row.position.toFixed(1)}
              </td>
              <td className="text-right tabular-nums">
                {row.impressions.toLocaleString()}
              </td>
              <td className="text-right tabular-nums">
                {(row.ctr * 100).toFixed(1)}%
              </td>
              <td className="text-right font-medium tabular-nums text-warning">
                ~{row.missedClicks.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-base-300 px-4 py-2 text-xs text-base-content/50">
        These rank fine but under-earn clicks — rewrite the title and meta
        description to match the query's intent.
      </p>
    </div>
  );
}
