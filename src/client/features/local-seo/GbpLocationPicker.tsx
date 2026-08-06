import { MapPin } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";

type LocationOption = {
  name: string;
  title: string;
  // The account's resource name ("accounts/123") -- carried through so
  // GbpConnectionCard can send it along with the location when saving; never
  // shown in this UI (see accountDisplayName for that).
  accountName: string;
  // Human-readable business name for the account, e.g. "Joe's Pizza LLC" --
  // shown next to each location so a grant covering more than one account is
  // still disambiguable.
  accountDisplayName: string;
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
  incomplete,
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
  errorReason: "requires_reconnect" | "access_denied" | "temporary" | null;
  // True when gbpClient's pagination hit its page cap with a token still
  // outstanding (final wave item 2, the A5 residual) -- `locations` is then
  // a genuine partial, not a complete enumeration of this Google account's
  // Business Profile locations. Independent of `errorReason`: this is a
  // partial SUCCESS, not a failure.
  incomplete: boolean;
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
        <Loader size="sm" />
        Loading locations…
      </div>
    );
  }
  if (errorReason === "requires_reconnect") {
    // Covers BOTH a genuine 401 from Google AND an unclassifiable exception
    // from getToken() (see gbpClient.ts's getToken doc comment) -- this copy
    // can't always tell which, so it must not assert "expired" as an
    // established fact (final wave item 1). "Reconnect" is still the right
    // remedy either way.
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          Couldn&apos;t verify your Google Business Profile connection.
          Reconnect to continue.
        </p>
        <Button type="button" onClick={onReconnect} variant="outline" size="sm">
          <InsightIcon icon={MapPin} tone="neutral" />
          Reconnect Google Business Profile
        </Button>
      </div>
    );
  }
  if (errorReason === "access_denied") {
    // A 403 means Google authenticated the request but denied it (finding
    // A4) -- distinct from an expired/revoked connection (401), so this
    // must not say "expired". This picker only ever renders BEFORE a
    // location is chosen (accounts.list or locations.list failing), so it
    // must not say "this location" either (final wave item 1 residual): no
    // location exists yet to refer to. The account may simply not manage
    // any listing this app can see, or manage a different one.
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          This Google account doesn&apos;t have permission to manage Business
          Profile listings.
        </p>
        <Button type="button" onClick={onReconnect} variant="outline" size="sm">
          <InsightIcon icon={MapPin} tone="neutral" />
          Reconnect with a different Google account
        </Button>
      </div>
    );
  }
  if (errorReason === "temporary") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          Couldn&apos;t load your Business Profile locations — please try again.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (locations.length === 0) {
    // A truncated enumeration (final wave item 2) is a partial result, not
    // proof this account has no locations -- an empty `locations` array
    // means something different in each case, so this must not collapse to
    // one "none found" sentence regardless of which happened.
    return (
      <p className="text-sm text-base-content/60">
        {incomplete
          ? "Listing your Business Profile accounts/locations hit a limit before finding any -- that's incomplete, not proof this Google account has none. Try again in a moment."
          : "No Google Business Profile locations were found on this Google account. Make sure you signed in with the account that manages this listing."}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {incomplete ? (
        <p className="text-xs text-warning">
          This list may be incomplete -- listing hit a limit partway through.
          Try again in a moment if you don&apos;t see the location you expect.
        </p>
      ) : null}
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
              {location.title} ({location.accountDisplayName})
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={!selectedLocationName || saving}
        >
          {saving ? "Saving…" : "Save location"}
        </Button>
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
