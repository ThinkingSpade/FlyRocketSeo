import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";
import { GeoLocationSelect } from "@/client/features/geo/GeoLocationSelect";
import {
  useSetTargetArea,
  useTargetArea,
} from "@/client/features/geo/useTargetArea";
import {
  SERVICE_AREA_KINDS,
  SERVICE_AREA_LABELS,
  isServiceAreaKind,
  wantsGeoModifiers,
  type ServiceAreaKind,
} from "@/shared/keyword-fit/profileTypes";
import { primaryAreaOf } from "./profilePrefill";
import { summariseServiceArea } from "./serviceAreaSummary";

/**
 * "Where do they sell?" — the shape, and now the place.
 *
 * Its own component rather than more lines in ProjectProfileCard because it
 * stopped being one `<select>`: it reads the target-area query, writes
 * through the picker, and has three distinct empty/proposed/confirmed states.
 * The card is already near this repo's 400-line ceiling and this is the piece
 * that is genuinely self-contained.
 *
 * The place is only shown for the two shapes that USE one. For "Nationwide"
 * or "Worldwide" the seeds carry no geo modifier at all, so naming a city
 * there would be decoration that implies an effect it does not have.
 */
export function ServiceAreaField({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: ServiceAreaKind;
  onChange: (kind: ServiceAreaKind) => void;
}) {
  const targetArea = useTargetArea(projectId);
  const setArea = useSetTargetArea(projectId);
  const [picking, setPicking] = useState(false);
  const summary = summariseServiceArea(targetArea.data);
  const current = primaryAreaOf(targetArea.data);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Where do they sell?</span>
        <select
          className="app-select w-full max-w-sm"
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            if (isServiceAreaKind(next)) onChange(next);
          }}
        >
          {SERVICE_AREA_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {SERVICE_AREA_LABELS[kind].label}
            </option>
          ))}
        </select>
        <span className="text-sm text-base-content/60">
          {SERVICE_AREA_LABELS[value].hint}
        </span>
      </label>

      {wantsGeoModifiers(value) ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2.5">
          {summary.label ? (
            <div className="flex flex-wrap items-center gap-2">
              <MapPin className="size-3.5 shrink-0 text-base-content/50" />
              <span className="text-sm font-medium">{summary.label}</span>
              <span className="text-sm text-base-content/60">
                {summary.state === "confirmed"
                  ? "— local seeds use this"
                  : "— detected, not confirmed yet"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setPicking((open) => !open)}
              >
                {picking ? "Cancel" : "Change"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <MapPin className="size-3.5 shrink-0 text-base-content/50" />
              <span className="text-sm text-base-content/70">
                No area set, so local seeds have no city to carry.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setPicking((open) => !open)}
              >
                {picking ? "Cancel" : "Pick one"}
              </Button>
            </div>
          )}

          {summary.alternatives.length > 0 ? (
            <span className="text-sm text-base-content/60">
              Search Console also points at {summary.alternatives.join(", ")}.
              Pick whichever is the main one.
            </span>
          ) : null}

          {picking ? (
            <GeoLocationSelect
              className="w-full max-w-sm"
              value={current}
              onChange={(area) => {
                setArea.mutate(area, { onSuccess: () => setPicking(false) });
              }}
            />
          ) : null}

          {setArea.isError ? (
            <span className="text-sm text-error" role="alert">
              Couldn&apos;t save that area. Try again.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
