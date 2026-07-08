// Skeleton for the project dashboard. Mirrors the loaded layout — heading, a
// quick-actions row, then the stacked section cards — so the shell stays put
// while data fills in. Matches the other pages' loaders (e.g.
// SearchPerformanceLoadingState).

function TilesRow() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2 p-4">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-7 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionCardSkeleton({ withTiles = true }: { withTiles?: boolean }) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3 p-4">
        <div className="flex items-center justify-between">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-4 w-16" />
        </div>
        {withTiles ? <TilesRow /> : <div className="skeleton h-6 w-64" />}
      </div>
    </div>
  );
}

export function DashboardLoadingState() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="space-y-2">
        <div className="skeleton h-8 w-56" />
        <div className="skeleton h-4 w-40" />
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3 p-4">
          <div className="skeleton h-4 w-32" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton h-16" />
            ))}
          </div>
        </div>
      </div>

      <SectionCardSkeleton />
      <SectionCardSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCardSkeleton withTiles={false} />
        <SectionCardSkeleton />
      </div>
    </div>
  );
}
