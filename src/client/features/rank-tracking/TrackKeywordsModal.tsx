import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, X } from "lucide-react";
import {
  addTrackingKeywords,
  createRankTrackingConfig,
  getRankTrackingConfigSummaries,
} from "@/serverFunctions/rank-tracking";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { LocationSelect } from "@/client/components/LocationSelect";
import {
  getLanguageCode,
  LOCATIONS,
} from "@/client/features/keywords/locations";
import { domainField, normalizeDomain } from "@/types/schemas/domain";

// Defaults mirror RankTrackingConfigModal so a domain created from this shortcut
// behaves identically to one created through the full config flow.
const DEFAULT_SERP_DEPTH = 40;
const DEFAULT_DEVICES = "mobile";
const DEFAULT_SCHEDULE = "weekly";

type Mode = "existing" | "create";

type Props = {
  projectId: string;
  keywords: string[];
  defaultLocationCode: number;
  defaultLanguageCode: string;
  projectDomain?: string;
  /** Set by callers whose selection spans multiple locations (see saved.tsx). */
  mixedLocations?: boolean;
  /** Fires after keywords are added, before the modal closes (e.g. to clear selection). */
  onSuccess?: () => void;
  onClose: () => void;
};

function locationLabel(locationCode: number): string {
  return LOCATIONS[locationCode] ?? String(locationCode);
}

export function TrackKeywordsModal({
  projectId,
  keywords,
  defaultLocationCode,
  defaultLanguageCode,
  projectDomain,
  mixedLocations,
  onSuccess,
  onClose,
}: Props) {
  const queryClient = useQueryClient();

  const configsQuery = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });
  const configs = configsQuery.data ?? [];
  const hasConfigs = configs.length > 0;

  const [modeOverride, setModeOverride] = useState<Mode | null>(null);
  const mode: Mode = modeOverride ?? (hasConfigs ? "existing" : "create");

  const [selectedConfigId, setSelectedConfigId] = useState("");
  const effectiveConfigId = selectedConfigId || configs[0]?.id || "";

  const [domain, setDomain] = useState(projectDomain ?? "");
  const [locationCode, setLocationCode] = useState(defaultLocationCode);
  const [languageCode, setLanguageCode] = useState(defaultLanguageCode);

  const count = keywords.length;
  const keywordLabel = `${count} keyword${count !== 1 ? "s" : ""}`;

  const mutation = useMutation({
    mutationFn: async () => {
      let configId = effectiveConfigId;
      if (mode === "create") {
        const parsed = domainField.safeParse(domain);
        if (!parsed.success) throw new Error("Please enter a valid domain");
        const created = await createRankTrackingConfig({
          data: {
            projectId,
            domain: parsed.data,
            locationCode,
            languageCode,
            devices: DEFAULT_DEVICES,
            serpDepth: DEFAULT_SERP_DEPTH,
            scheduleInterval: DEFAULT_SCHEDULE,
          },
        });
        configId = created.configId;
      }
      if (!configId) throw new Error("Select a domain to track keywords for");
      return addTrackingKeywords({ data: { projectId, configId, keywords } });
    },
    onSuccess: (result) => {
      toast.success(
        `Tracking ${result.added} keyword${result.added !== 1 ? "s" : ""}`,
      );
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingConfigSummaries", projectId],
      });
      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Failed to track keywords"));
    },
  });

  const handleDomainBlur = () => {
    try {
      setDomain(normalizeDomain(domain));
    } catch {
      // Keep invalid partial input editable; submit validation will show the error.
    }
  };

  const isPending = mutation.isPending;
  const confirmDisabled =
    isPending ||
    count === 0 ||
    (mode === "create" ? !domain.trim() : !effectiveConfigId);

  return (
    <Modal
      maxWidth="max-w-md"
      onClose={onClose}
      labelledBy="track-keywords-title"
    >
      <div className="flex items-center justify-between">
        <h2 id="track-keywords-title" className="text-lg font-semibold">
          Track {keywordLabel}
        </h2>
        <button className="btn btn-ghost btn-sm btn-square" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>

      <p className="text-sm text-base-content/60">
        Add the selected keyword{count !== 1 ? "s" : ""} to a tracked domain to
        monitor rankings over time.
      </p>

      {mixedLocations ? (
        <div className="flex items-start gap-1.5 rounded-lg bg-base-200/50 px-3 py-2 text-xs text-base-content/70">
          <Info className="size-3.5 shrink-0 mt-0.5 text-info" />
          <span>
            Your selection spans multiple locations, but rank tracking checks a
            single location. All keywords will be tracked in{" "}
            {locationLabel(defaultLocationCode)}.
          </span>
        </div>
      ) : null}

      {configsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-base-content/50">
          <Loader2 className="size-4 animate-spin" />
          Loading tracked domains…
        </div>
      ) : (
        <>
          {hasConfigs ? (
            <div role="tablist" className="tabs tabs-boxed w-fit">
              <button
                type="button"
                role="tab"
                className={`tab ${mode === "existing" ? "tab-active" : ""}`}
                onClick={() => setModeOverride("existing")}
              >
                Add to existing
              </button>
              <button
                type="button"
                role="tab"
                className={`tab ${mode === "create" ? "tab-active" : ""}`}
                onClick={() => setModeOverride("create")}
              >
                New domain
              </button>
            </div>
          ) : null}

          {mode === "existing" ? (
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Tracked domain</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={effectiveConfigId}
                onChange={(e) => setSelectedConfigId(e.target.value)}
              >
                {configs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.domain} · {locationLabel(config.locationCode)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Target domain</span>
                </label>
                <input
                  type="text"
                  placeholder="example.com"
                  className="input input-bordered w-full"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onBlur={handleDomainBlur}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Country</span>
                </label>
                <LocationSelect
                  value={locationCode}
                  onChange={(newLocationCode) => {
                    setLocationCode(newLocationCode);
                    setLanguageCode(getLanguageCode(newLocationCode));
                  }}
                />
                <div className="mt-1.5 text-xs text-base-content/50">
                  Rankings are checked in this location for every keyword.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => mutation.mutate()}
          disabled={confirmDisabled}
        >
          {isPending && <Loader2 className="size-3.5 animate-spin" />}
          Track {keywordLabel}
        </button>
      </div>
    </Modal>
  );
}
