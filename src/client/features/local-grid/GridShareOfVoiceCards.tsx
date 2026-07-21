import { Eye, Hash, MapPin, Megaphone, Trophy } from "lucide-react";
import { InsightIcon, InsightTile } from "@/client/components/InsightTile";
import type { computeGridShareOfVoice } from "@/client/features/local-grid/gridShareOfVoice";

export function GridShareOfVoiceCards({
  shareOfVoice,
}: {
  shareOfVoice: ReturnType<typeof computeGridShareOfVoice>;
}) {
  const { scannedPins, myTop3Count, myVisibleCount, averagePosition, leaders } =
    shareOfVoice;
  const top3Percent = Math.round((myTop3Count / scannedPins) * 100);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InsightTile
          icon={Megaphone}
          label="Share of voice"
          value={`${top3Percent}%`}
          tone={top3Percent > 0 ? "success" : "warning"}
          title="Share of the scanned pins where you rank in the local top 3"
        />
        <InsightTile
          icon={MapPin}
          label="Top-3 pins"
          tone="primary"
          value={
            <>
              {myTop3Count}
              <span className="text-sm font-normal text-base-content/50">
                {" "}
                / {scannedPins}
              </span>
            </>
          }
        />
        <InsightTile
          icon={Eye}
          label="Visible pins"
          tone="info"
          value={
            <>
              {myVisibleCount}
              <span className="text-sm font-normal text-base-content/50">
                {" "}
                / {scannedPins}
              </span>
            </>
          }
        />
        <InsightTile
          icon={Hash}
          label="Avg rank"
          value={
            averagePosition != null ? `#${averagePosition.toFixed(1)}` : "—"
          }
        />
      </div>

      {leaders.length > 0 ? (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body gap-2 p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <InsightIcon icon={Trophy} tone="warning" />
              Map leaders
            </h2>
            <p className="-mt-1 text-xs text-base-content/50">
              Who holds the local top 3 across your grid — including your own
              listing when it ranks.
            </p>
            <ul className="space-y-1.5">
              {leaders.map((leader) => (
                <li
                  key={leader.name}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-44 shrink-0 truncate" title={leader.name}>
                    {leader.name}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-base-200">
                    <span
                      className="block h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.round(leader.share * 100)}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-base-content/60 tabular-nums">
                    {leader.appearances} of {scannedPins} pins
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
