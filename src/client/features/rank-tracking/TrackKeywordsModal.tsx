import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, CircleNotch, X } from "@phosphor-icons/react";
import {
  addTrackingKeywords,
  createRankTrackingConfig,
  getRankTrackingConfigSummaries,
} from "@/serverFunctions/rank-tracking";
import { Modal } from "@/client/components/Modal";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { LocationSelect } from "@/client/components/LocationSelect";
import {
  getLanguageCode,
  LOCATIONS,
} from "@/client/features/keywords/locations";
import { domainField, normalizeDomain } from "@/types/schemas/domain";
import {
  estimateRankCheckCredits,
  scheduleLabel,
} from "@/shared/rank-tracking";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import { Button } from "@cloudflare/kumo/components/button";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Input } from "@cloudflare/kumo/components/input";

// Keep the shortcut's rank-check shape aligned with the full config flow, but
// leave recurring spend off until the user explicitly chooses a schedule.
const DEFAULT_SERP_DEPTH = 40;
const DEFAULT_DEVICES = "mobile";
const DEFAULT_SCHEDULE = "manual";

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

function checksPerMonth(
  schedule: RankTrackingConfig["scheduleInterval"],
): number {
  if (schedule === "daily") return 30;
  if (schedule === "weekly") return 4;
  if (schedule === "monthly") return 1;
  return 0;
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
  const [schedule, setSchedule] =
    useState<RankTrackingConfig["scheduleInterval"]>(DEFAULT_SCHEDULE);

  const count = keywords.length;
  const keywordLabel = `${count} keyword${count !== 1 ? "s" : ""}`;
  const selectedConfig = configs.find(
    (config) => config.id === effectiveConfigId,
  );
  const effectiveSchedule =
    mode === "create"
      ? schedule
      : (selectedConfig?.scheduleInterval ?? "manual");
  const recurringCost =
    effectiveSchedule === "manual"
      ? null
      : estimateRankCheckCredits(
          count,
          mode === "create"
            ? DEFAULT_DEVICES
            : (selectedConfig?.devices ?? DEFAULT_DEVICES),
          mode === "create"
            ? DEFAULT_SERP_DEPTH
            : (selectedConfig?.serpDepth ?? DEFAULT_SERP_DEPTH),
          "queued",
        ).costUsd * checksPerMonth(effectiveSchedule);

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
            scheduleInterval: schedule,
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
    configsQuery.isError ||
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
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
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

      {configsQuery.isError ? (
        <InlineQueryError
          message="Tracked domains could not be loaded."
          retrying={configsQuery.isFetching}
          onRetry={() => void configsQuery.refetch()}
        />
      ) : configsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-base-content/50">
          <CircleNotch className="size-4 animate-spin" />
          Loading tracked domains…
        </div>
      ) : (
        <>
          {/* `segmented`, not `underline`: this is a choice between two
              mutually exclusive forms inside a modal, which is what the old
              `tabs-boxed` was saying. The page-level strips are underline. */}
          {hasConfigs ? (
            <Tabs
              variant="segmented"
              value={mode}
              onValueChange={(next) => {
                if (next === "existing" || next === "create") {
                  setModeOverride(next);
                }
              }}
              tabs={[
                { value: "existing", label: "Add to existing" },
                { value: "create", label: "New domain" },
              ]}
            />
          ) : null}

          {mode === "existing" ? (
            <div className="form-control">
              <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-medium">Tracked domain</span>
              </label>
              <select
                className="app-select w-full"
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
                <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="font-medium">Target domain</span>
                </label>
                <Input
                  passwordManagerIgnore
                  type="text"
                  placeholder="example.com"
                  className="w-full"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onBlur={handleDomainBlur}
                />
              </div>

              <div className="form-control">
                <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="font-medium">Country</span>
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

              <div className="form-control">
                <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="font-medium">Schedule</span>
                </label>
                <select
                  className="app-select w-full"
                  value={schedule}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      value === "manual" ||
                      value === "daily" ||
                      value === "weekly" ||
                      value === "monthly"
                    ) {
                      setSchedule(value);
                    }
                  }}
                >
                  <option value="manual">Manual only (no auto-spend)</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <div className="mt-1.5 text-xs text-base-content/50">
                  Recurring checks are off unless you explicitly choose a
                  schedule.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!configsQuery.isLoading && !configsQuery.isError ? (
        <div className="flex items-start gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2.5 text-xs text-base-content/70">
          <Info className="mt-0.5 size-3.5 shrink-0 text-base-content/45" />
          {recurringCost == null ? (
            <span>
              {mode === "create"
                ? "Manual only: creating this tracker will not schedule paid checks."
                : "This tracked domain is manual only, so these keywords will not create recurring spend."}
            </span>
          ) : (
            <span>
              {scheduleLabel(effectiveSchedule)} paid checks for these{" "}
              {keywordLabel} will add approximately{" "}
              <span className="font-mono font-semibold text-base-content">
                ${recurringCost.toFixed(2)}/month
              </span>
              .
            </span>
          )}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={confirmDisabled}
        >
          {isPending && <CircleNotch className="size-3.5 animate-spin" />}
          Track {keywordLabel}
        </Button>
      </div>
    </Modal>
  );
}
