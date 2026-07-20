import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Grid3x3, Search } from "lucide-react";
import { getLocalGridCell } from "@/serverFunctions/local-grid";

type LocalGridNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

const MAX_KEYWORDS = 5;

/** DFW metro pins — one per city Delio targets with a location page. City-center
 *  coordinates are enough for city-level local rankings. */
const CITIES: ReadonlyArray<{ name: string; lat: number; lng: number }> = [
  { name: "Dallas", lat: 32.7767, lng: -96.797 },
  { name: "Fort Worth", lat: 32.7555, lng: -97.3308 },
  { name: "Arlington", lat: 32.7357, lng: -97.1081 },
  { name: "Plano", lat: 33.0198, lng: -96.6989 },
  { name: "Frisco", lat: 33.1507, lng: -96.8236 },
  { name: "Addison", lat: 32.9618, lng: -96.8292 },
  { name: "Allen", lat: 33.1032, lng: -96.6706 },
  { name: "Richardson", lat: 32.9483, lng: -96.7299 },
  { name: "Carrollton", lat: 32.9756, lng: -96.8899 },
  { name: "Bedford", lat: 32.844, lng: -97.1431 },
];

type CellResult = {
  position: number | null;
  topCompetitors: string[];
  fetchedAt: string;
};

function parseKeywords(query: string): string[] {
  return [
    ...new Set(
      query
        .split(",")
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, MAX_KEYWORDS);
}

function cellClass(position: number | null): string {
  if (position == null) return "text-base-content/30";
  if (position <= 3) return "bg-success/15 font-semibold text-success";
  if (position <= 10) return "bg-warning/15 text-warning";
  return "text-base-content/70";
}

function GridCell({
  cell,
  isLoading,
  isError,
}: {
  cell: CellResult | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return <span className="loading loading-dots loading-xs" />;
  }
  if (isError) {
    return <span title="Check failed">!</span>;
  }
  if (!cell) return <span>—</span>;
  if (cell.position == null) {
    return (
      <span
        title={
          cell.topCompetitors.length > 0
            ? `Not in top 20. Leaders: ${cell.topCompetitors.join(", ")}`
            : "Not in the local results"
        }
      >
        —
      </span>
    );
  }
  return (
    <span
      title={
        cell.topCompetitors.length > 0
          ? `Leaders: ${cell.topCompetitors.join(", ")}`
          : undefined
      }
    >
      #{cell.position}
    </span>
  );
}

export function LocalRankGridPage({
  projectId,
  navigate,
  query,
}: {
  projectId: string;
  navigate: LocalGridNavigate;
  query: string;
}) {
  const [input, setInput] = useState(query);
  const keywords = parseKeywords(query);

  const cells = keywords.flatMap((keyword) =>
    CITIES.map((city) => ({ keyword, city })),
  );
  const cellQueries = useQueries({
    queries: cells.map(({ keyword, city }) => ({
      queryKey: ["local-grid", projectId, keyword, city.name],
      queryFn: async (): Promise<CellResult> =>
        getLocalGridCell({
          data: { projectId, keyword, lat: city.lat, lng: city.lng },
        }),
      staleTime: 60 * 60_000,
      retry: 1,
    })),
  });
  const cellState = new Map<
    string,
    { data: CellResult | undefined; isLoading: boolean; isError: boolean }
  >();
  cells.forEach(({ keyword, city }, index) => {
    const cellQuery = cellQueries[index];
    cellState.set(`${keyword}|${city.name}`, {
      data: cellQuery?.data,
      isLoading: cellQuery?.isLoading ?? false,
      isError: cellQuery?.isError ?? false,
    });
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Grid3x3 className="size-5" />
          Local Rank Grid
        </h1>
        <p className="text-sm text-base-content/60">
          Your local-finder ranking for each keyword, city by city across the
          DFW metro — see exactly where you own the map and where you&rsquo;re
          invisible. Hover a cell for the local leaders there.
        </p>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const next = parseKeywords(input);
              if (next.length === 0) return;
              navigate({
                search: (prev) => ({ ...prev, q: next.join(", ") }),
                replace: false,
              });
            }}
          >
            <label className="form-control w-full sm:max-w-xl">
              <span className="label-text pb-1 text-xs font-medium">
                Keywords (comma-separated, up to {MAX_KEYWORDS})
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="vending machines, office coffee service"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!input.trim()}
            >
              <Search className="size-3.5" />
              Check grid
            </button>
          </form>
          <p className="text-xs text-base-content/50">
            Each cell is one live local-finder check (~$0.002), cached for a
            day. {CITIES.length} cities × up to {MAX_KEYWORDS} keywords.
          </p>
        </div>
      </div>

      {keywords.length === 0 ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-12 text-center">
            <p className="font-medium">Enter keywords to map your coverage</p>
            <p className="max-w-md text-sm text-base-content/60">
              Try the services you sell — the grid shows where in the metro you
              actually appear when locals search.
            </p>
          </div>
        </div>
      ) : (
        <div className="card border border-base-300 bg-base-100">
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Keyword</th>
                  {CITIES.map((city) => (
                    <th key={city.name} className="text-center">
                      {city.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keywords.map((keyword) => (
                  <tr key={keyword}>
                    <td className="max-w-48">
                      <span className="line-clamp-2 font-medium">
                        {keyword}
                      </span>
                    </td>
                    {CITIES.map((city) => {
                      const state = cellState.get(`${keyword}|${city.name}`);
                      return (
                        <td
                          key={city.name}
                          className={`text-center tabular-nums ${cellClass(
                            state?.data?.position ?? null,
                          )}`}
                        >
                          <GridCell
                            cell={state?.data}
                            isLoading={state?.isLoading ?? false}
                            isError={state?.isError ?? false}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {keywords.length > 0 ? (
        <p className="text-xs text-base-content/40">
          <span className="text-success">#1–3 local pack territory</span> ·{" "}
          <span className="text-warning">#4–10 page one</span> · — not in the
          top {20}
        </p>
      ) : null}
    </div>
  );
}
