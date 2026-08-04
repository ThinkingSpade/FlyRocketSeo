import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/client/components/Modal";
import { GeoLocationSelect } from "@/client/features/geo/GeoLocationSelect";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { assignCitySiteLocation } from "@/serverFunctions/citySites";
import type { CitySiteRow } from "@/server/features/city-sites/repositories/CitySiteRepository";
import type { TargetArea } from "@/shared/geo/types";
import { CITY_SITE_STATUS_META } from "./citySiteStatus";

/**
 * Resolves one host by hand — the escape hatch that lets automatic matching
 * stay strict.
 *
 * Because this exists, the importer can refuse to guess between six cities
 * called Dallas and still leave the operator a one-click fix, instead of
 * trading a visible "needs a pick" row for an invisible wrong one.
 */
export function CitySiteFixModal({
  projectId,
  site,
  onClose,
}: {
  projectId: string;
  site: CitySiteRow;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [area, setArea] = React.useState<TargetArea | null>(null);

  const assignMutation = useMutation({
    mutationFn: (locationCode: number) =>
      assignCitySiteLocation({
        data: { projectId, citySiteId: site.id, locationCode },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["citySites", projectId],
      });
      toast.success(`${site.host} pinned to ${area?.label ?? "its location"}`);
      onClose();
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not set the location")),
  });

  return (
    <Modal
      maxWidth="max-w-md"
      onClose={assignMutation.isPending ? undefined : onClose}
      labelledBy="fix-city-site-title"
    >
      <h2 id="fix-city-site-title" className="text-lg font-semibold">
        Set location
      </h2>

      <div className="rounded-lg border border-base-300 bg-base-200/40 px-3 py-2">
        <div className="font-mono text-sm">{site.host}</div>
        <div className="mt-1 text-xs text-base-content/60">
          {CITY_SITE_STATUS_META[site.matchStatus].description}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">City</span>
        <GeoLocationSelect value={area} onChange={setArea} />
      </label>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          disabled={assignMutation.isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!area || assignMutation.isPending}
          onClick={() => {
            if (area) assignMutation.mutate(area.locationCode);
          }}
        >
          {assignMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          Save
        </button>
      </div>
    </Modal>
  );
}
