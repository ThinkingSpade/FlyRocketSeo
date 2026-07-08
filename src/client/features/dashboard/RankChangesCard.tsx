import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown } from "lucide-react";
import { getRankChangeDigest } from "@/serverFunctions/rank-tracking";
import {
  CardEmpty,
  CardError,
  CardTilesSkeleton,
  DashboardCard,
  useProjectNavLinks,
} from "./dashboardShared";

// Inferred from the server function so the card can never drift from the
// digest's shape (no cross-boundary type import needed).
type RankDigestData = Awaited<ReturnType<typeof getRankChangeDigest>>;
type ConfigDigest = RankDigestData["configs"][number];
type Mover = ConfigDigest["improved"][number];

const MAX_MOVERS = 5;

export function RankChangesCard({ projectId }: { projectId: string }) {
  const nav = useProjectNavLinks(projectId);
  const rankLink = nav.get("/p/$projectId/rank-tracking").linkProps;

  const digestQuery = useQuery({
    queryKey: ["rankChangeDigest", projectId],
    queryFn: () => getRankChangeDigest({ data: { projectId } }),
  });

  // Primary = the config whose latest run is the most recent, so the card
  // reflects the freshest scheduled check.
  const primary = useMemo<ConfigDigest | null>(() => {
    const configs = digestQuery.data?.configs ?? [];
    let best: ConfigDigest | null = null;
    let bestTime = "";
    for (const config of configs) {
      if (config.latestRunAt && config.latestRunAt > bestTime) {
        best = config;
        bestTime = config.latestRunAt;
      }
    }
    return best;
  }, [digestQuery.data]);

  const isNew = useDigestFreshness(
    projectId,
    digestQuery.data?.latestRunAt ?? null,
  );

  const totalChanges = primary
    ? primary.improvedCount +
      primary.declinedCount +
      primary.addedCount +
      primary.lostCount
    : 0;

  const topImproved = primary?.improved.slice(0, MAX_MOVERS) ?? [];
  const topDeclined = primary?.declined.slice(0, MAX_MOVERS) ?? [];

  return (
    <DashboardCard
      icon={ArrowUpDown}
      title="Recent rank changes"
      headerLink={rankLink}
    >
      {digestQuery.isError ? (
        <CardError error={digestQuery.error} />
      ) : digestQuery.isPending ? (
        <CardTilesSkeleton count={2} />
      ) : primary === null || totalChanges === 0 ? (
        <CardEmpty>
          No changes yet — rankings are compared after the next scheduled check.
        </CardEmpty>
      ) : (
        <>
          <p className="flex items-center gap-2 text-xs text-base-content/60">
            <span className="font-medium text-base-content/80">
              {primary.domain}
            </span>{" "}
            · Desktop
            {isNew ? (
              <span className="badge badge-primary badge-sm">New</span>
            ) : null}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-success">
              ▲ {primary.improvedCount} improved
            </span>
            <span className="font-medium text-error">
              ▼ {primary.declinedCount} declined
            </span>
            {primary.addedCount > 0 ? (
              <span className="text-base-content/60">
                +{primary.addedCount} added
              </span>
            ) : null}
            {primary.lostCount > 0 ? (
              <span className="text-base-content/60">
                −{primary.lostCount} lost
              </span>
            ) : null}
          </div>

          {topImproved.length > 0 || topDeclined.length > 0 ? (
            <div className="space-y-1">
              {topImproved.map((mover) => (
                <MoverRow
                  key={`up-${mover.keyword}`}
                  mover={mover}
                  direction="up"
                />
              ))}
              {topDeclined.map((mover) => (
                <MoverRow
                  key={`down-${mover.keyword}`}
                  mover={mover}
                  direction="down"
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </DashboardCard>
  );
}

function MoverRow({
  mover,
  direction,
}: {
  mover: Mover;
  direction: "up" | "down";
}) {
  const color = direction === "up" ? "text-success" : "text-error";
  const arrow = direction === "up" ? "▲" : "▼";
  const magnitude = mover.delta === null ? "" : Math.abs(mover.delta);
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="truncate">{mover.keyword}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums text-base-content/60">
          {formatPosition(mover.previousPosition)}→
          {formatPosition(mover.currentPosition)}
        </span>
        <span className={`tabular-nums font-medium ${color}`}>
          {arrow}
          {magnitude}
        </span>
      </span>
    </div>
  );
}

function formatPosition(position: number | null): string {
  return position === null ? "—" : String(position);
}

/**
 * Subtle "New" cue: true when this project's latest run is newer than the last
 * digest the browser saw. Marks it seen on read, so the pill shows once per new
 * run. Best-effort — silently no-ops where localStorage is unavailable.
 */
function useDigestFreshness(
  projectId: string,
  latestRunAt: string | null,
): boolean {
  const [isNew, setIsNew] = useState(false);
  useEffect(() => {
    if (!latestRunAt) return;
    const key = `rankDigestLastSeen:${projectId}`;
    try {
      const lastSeen = localStorage.getItem(key);
      if (!lastSeen || latestRunAt > lastSeen) {
        setIsNew(true);
        localStorage.setItem(key, latestRunAt);
      }
    } catch {
      // localStorage blocked (private mode / SSR) — skip the freshness cue.
    }
  }, [projectId, latestRunAt]);
  return isNew;
}
