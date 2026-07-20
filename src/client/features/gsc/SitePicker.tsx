import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import type { GscSitesErrorReason } from "@/shared/gsc";

type SiteOption = {
  siteUrl: string;
  permissionLevel: string;
  selectable: boolean;
  isSelected: boolean;
};

type SecondaryAction = {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * Verified-property selector for a connected Google account. Shared by the
 * Integrations card and the onboarding step. `secondaryAction` is optional —
 * omit it where there's nothing to cancel/disconnect (e.g. onboarding).
 */
export function SitePicker({
  loading,
  errorReason,
  sites,
  selectedSiteUrl,
  onSelect,
  onSave,
  saving,
  onReconnect,
  onRetry,
  secondaryAction,
}: {
  loading: boolean;
  errorReason: GscSitesErrorReason | null;
  sites: SiteOption[];
  selectedSiteUrl: string;
  onSelect: (siteUrl: string) => void;
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
        Loading properties…
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
          className="inline-flex items-center gap-2.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-base-200"
        >
          <GoogleGlyph className="size-[18px]" />
          Reconnect with Google
        </button>
      </div>
    );
  }
  if (errorReason === "api_not_configured") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          Search Console API isn&apos;t enabled for your Google Cloud project.{" "}
          <a
            href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2"
          >
            Enable it in Google Cloud Console
          </a>
          , then reconnect.
        </p>
        <button
          type="button"
          onClick={onReconnect}
          className="inline-flex items-center gap-2.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-base-200"
        >
          <GoogleGlyph className="size-[18px]" />
          Reconnect with Google
        </button>
      </div>
    );
  }
  if (errorReason === "temporary") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          Couldn&apos;t load your Search Console sites — please try again.
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
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-base-content/80">
          Property
        </span>
        <select
          className="select select-bordered w-full max-w-md"
          value={selectedSiteUrl}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="" disabled>
            Select a property…
          </option>
          {sites.map((site) => (
            <option
              key={site.siteUrl}
              value={site.siteUrl}
              disabled={!site.selectable}
            >
              {site.siteUrl}
              {site.selectable ? "" : "  (no access)"}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={!selectedSiteUrl || saving}
        >
          {saving ? "Saving…" : "Save property"}
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
