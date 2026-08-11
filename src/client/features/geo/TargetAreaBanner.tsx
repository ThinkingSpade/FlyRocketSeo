import { useState } from "react";
import { MapPin, X } from "@phosphor-icons/react";
import { GeoLocationSelect } from "@/client/features/geo/GeoLocationSelect";
import {
  useConfirmTargetArea,
  useSetTargetArea,
  useTargetArea,
} from "@/client/features/geo/useTargetArea";
import {
  buildTargetAreaBannerViewModel,
  describeExtraAreas,
  describeTargetAreaSource,
  type TargetAreaBannerViewModel,
} from "@/client/features/geo/targetAreaBannerViewModel";
import { Button } from "@cloudflare/kumo/components/button";

type Props = {
  projectId: string;
};

/**
 * The one-time confirmation banner Task 5 exists to build: "we noticed you
 * serve X, from Y -- confirm it, or tell us it's wrong." Every mounted
 * instance shares the same `["target-area", projectId]` query (see
 * `useTargetArea`'s own header), so accepting or overriding the area from
 * whichever tab happens to be open hides the banner everywhere else too.
 *
 * Renders nothing once an area is confirmed, or when detection never
 * produced a proposal at all -- see `buildTargetAreaBannerViewModel`'s own
 * doc comment for the exact precedence.
 */
export function TargetAreaBanner({ projectId }: Props) {
  const targetAreaQuery = useTargetArea(projectId);
  const confirmMutation = useConfirmTargetArea(projectId);
  const overrideMutation = useSetTargetArea(projectId);

  // Local-only: this is the ENTIRE dismiss mechanism, and it must never be
  // able to confirm anything. There is no code path from this state to
  // either mutation below -- closing the banner is just not rendering it,
  // never a stand-in for "use this for research." Dismissing resets on
  // remount (a fresh page load), which is correct: the proposal is still
  // unconfirmed, so there is still something for the user to decide.
  const [dismissed, setDismissed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const viewModel: TargetAreaBannerViewModel | null =
    buildTargetAreaBannerViewModel(targetAreaQuery.data ?? null);
  if (!viewModel || dismissed) return null;

  const extraAreas = describeExtraAreas(viewModel.extraAreaCount);

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-base-300 bg-base-200/50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-base-content/40" />
          <div className="text-sm text-base-content/70">
            <p>
              Looks like you serve{" "}
              <span className="font-medium text-base-content">
                {viewModel.area.label}
              </span>
              {extraAreas ? ` (${extraAreas})` : ""} — from{" "}
              {describeTargetAreaSource(viewModel.source)}.
            </p>
            {viewModel.disagreement ? (
              <p className="mt-0.5 text-xs text-base-content/50">
                Search Console activity points to {viewModel.disagreement.label}{" "}
                instead.
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          aria-label="Dismiss"
          variant="ghost"
          size="xs"
          shape="square"
          className="shrink-0"
          onClick={() => setDismissed(true)}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          size="xs"
          disabled={confirmMutation.isPending}
          onClick={() =>
            confirmMutation.mutate({
              area: viewModel.area,
              source: viewModel.source,
            })
          }
        >
          Use this for research
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setPickerOpen(true)}
        >
          Not right?
        </Button>
      </div>

      {pickerOpen ? (
        <GeoLocationSelect
          value={viewModel.area}
          onChange={(area) => {
            // The manual override path -- confirmed immediately, per
            // useSetTargetArea's own doc comment. Its success invalidation
            // makes `targetAreaQuery.data` come back `confirmed: true`,
            // which is what actually makes this whole banner disappear --
            // not this local `pickerOpen` state.
            overrideMutation.mutate(area);
          }}
          className="w-full sm:max-w-xs"
        />
      ) : null}
    </div>
  );
}
