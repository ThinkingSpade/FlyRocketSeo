import { MapPin } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";

type LocationOption = {
  name: string;
  title: string;
  accountName: string;
  isSelected: boolean;
};

type SecondaryAction = {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * Location selector for a connected google-business-profile grant. Mirrors
 * SitePicker.tsx's shape (GSC) but against GBP's own error reasons and
 * location list -- kept as its own file rather than a shared component
 * because the two pick fundamentally different kinds of resource (a verified
 * Search Console property vs. a Business Profile location), even though the
 * surrounding UX rhyme is intentional.
 */
export function GbpLocationPicker({
  loading,
  errorReason,
  locations,
  selectedLocationName,
  onSelect,
  onSave,
  saving,
  onReconnect,
  onRetry,
  secondaryAction,
}: {
  loading: boolean;
  errorReason: "requires_reconnect" | "temporary" | null;
  locations: LocationOption[];
  selectedLocationName: string;
  onSelect: (locationName: string) => void;
  onSave: () => void;
  saving: boolean;
  onReconnect: () => void;
  onRetry: () => void;
  secondaryAction?: SecondaryAction;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-base-content/50">
        <span className="loading loading-spinner loading-sm" />
        Loading locations…
      </div>
    );
  }
  if (errorReason === "requires_reconnect") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          Connection expired. Reconnect to continue.
        </p>
        <button
          type="button"
          onClick={onReconnect}
          className="btn btn-outline btn-sm gap-1.5"
        >
          <InsightIcon icon={MapPin} tone="neutral" />
          Reconnect Google Business Profile
        </button>
      </div>
    );
  }
  if (errorReason === "temporary") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          Couldn&apos;t load your Business Profile locations — please try again.
        </p>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onRetry}
        >
          Retry
        </button>
      </div>
    );
  }
  if (locations.length === 0) {
    return (
      <p className="text-sm text-base-content/60">
        No Google Business Profile locations were found on this Google account.
        Make sure you signed in with the account that manages this listing.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-base-content/80">
          Location
        </span>
        <select
          className="select select-bordered w-full max-w-md"
          value={selectedLocationName}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="" disabled>
            Select a location…
          </option>
          {locations.map((location) => (
            <option key={location.name} value={location.name}>
              {location.title} ({location.accountName})
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={!selectedLocationName || saving}
        >
          {saving ? "Saving…" : "Save location"}
        </button>
        {secondaryAction ? (
          <button
            type="button"
            className={[
              "btn btn-ghost btn-sm",
              secondaryAction.destructive ? "text-error hover:bg-error/10" : "",
            ].join(" ")}
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
          >
            {secondaryAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
