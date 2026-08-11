import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import {
  createRankTrackingConfig,
  updateRankTrackingConfig,
} from "@/serverFunctions/rank-tracking";
import { Info, CircleNotch, X } from "@phosphor-icons/react";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import { domainField, normalizeDomain } from "@/types/schemas/domain";
import {
  depthToPages,
  pagesToDepth,
  estimateRankCheckCredits,
} from "@/shared/rank-tracking";
import {
  getLanguageCode,
  getLanguageOptions,
} from "@/client/features/keywords/locations";
import { GeoLocationSelect } from "@/client/features/geo/GeoLocationSelect";
import type { TargetArea } from "@/shared/geo/types";
import { resolveInitialConfigArea } from "./rankTrackingConfigArea";
import { useConfigAreaLookup } from "./useConfigAreaLookup";
import { KeywordSuggestionStep } from "./KeywordSuggestionStep";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";

type Props = {
  projectId: string;
  existingConfig?: RankTrackingConfig | null;
  /**
   * The project's own confirmed target-area scope (whatever grain --
   * metro, city, or the country fallback), for a brand-new config's own
   * initial pick. Omitted entirely by the one caller that always edits an
   * existing config (`$configId.tsx`) -- `resolveInitialConfigArea` never
   * consults this once `existingConfig` is set, so passing it there would be
   * inert. See that function's own doc comment for why editing never takes
   * this over the config's own stored location.
   */
  defaultArea?: TargetArea;
  /** Prefills the domain field for a brand-new config, so an inbound
   *  "track this domain" link lands on a filled form. Ignored when editing:
   *  an existing config's own domain always wins. */
  defaultDomain?: string;
  onClose: () => void;
  onSaved: (createdConfigId?: string) => void;
  onConfigCreated?: () => void;
};

/** Split out of the main component purely to keep that function under this
 *  codebase's max-lines-per-function budget -- self-contained (only reads
 *  its own props), so extracting it changes no behaviour. */
function CostEstimateSummary({
  devices,
  serpDepth,
  schedule,
}: {
  devices: "both" | "desktop" | "mobile";
  serpDepth: number;
  schedule: RankTrackingConfig["scheduleInterval"];
}) {
  // Scheduled checks run through the cheaper task queue; manual configs only
  // ever pay the live price.
  const { costUsd: costPerKeyword } = estimateRankCheckCredits(
    1,
    devices,
    serpDepth,
    schedule === "manual" ? "live" : "queued",
  );
  const checksPerMonth =
    schedule === "daily" ? 30 : schedule === "weekly" ? 4 : 1;
  return (
    <div className="rounded-lg bg-base-200/50 px-3 py-2.5 text-xs text-base-content/70 space-y-0.5">
      <div>
        <span className="font-mono font-semibold text-base-content">
          ~${costPerKeyword.toFixed(4)}
        </span>{" "}
        per keyword per check
      </div>
      {schedule !== "manual" && (
        <div>
          50 keywords would cost{" "}
          <span className="font-mono font-semibold text-base-content">
            ~${(costPerKeyword * 50 * checksPerMonth).toFixed(2)}
          </span>
          /month
        </div>
      )}
    </div>
  );
}

export function RankTrackingConfigModal({
  projectId,
  existingConfig,
  defaultArea,
  defaultDomain,
  onClose,
  onSaved,
  onConfigCreated,
}: Props) {
  const isEdit = !!existingConfig;
  const [step, setStep] = useState<"config" | "keywords">("config");
  const [domain, setDomain] = useState(
    existingConfig?.domain ?? defaultDomain ?? "",
  );
  const [devices, setDevices] = useState<"both" | "desktop" | "mobile">(
    existingConfig?.devices ?? "mobile",
  );
  const [area, setArea] = useState<TargetArea>(() =>
    resolveInitialConfigArea({
      existingLocationCode: existingConfig?.locationCode ?? null,
      defaultArea: defaultArea ?? null,
    }),
  );
  // True once the user picks a location themselves -- stops the async
  // by-code resolution below from clobbering that choice if it lands after
  // the user has already moved on.
  const [areaTouched, setAreaTouched] = useState(false);
  // Resolves an EXISTING config's stored non-country locationCode (the bare
  // "Location #<code>" gap) via the free geo_locations by-code read, once it
  // comes back -- see useConfigAreaLookup.ts's own doc comment.
  useConfigAreaLookup(
    existingConfig?.locationCode ?? null,
    areaTouched,
    setArea,
  );
  // Derived from the AREA's own parent country, not its (possibly
  // sub-country) locationCode directly -- getLanguageCode/getLanguageOptions
  // are keyed by country code, and a metro/city code isn't one (same fix
  // shape as resolveGeo.ts's own languageForCountry).
  const [languageCode, setLanguageCode] = useState(
    existingConfig?.languageCode ?? getLanguageCode(area.parentCountryCode),
  );
  const languageOptions = useMemo(
    () => getLanguageOptions(area.parentCountryCode),
    [area.parentCountryCode],
  );
  const [serpDepth, setSerpDepth] = useState(existingConfig?.serpDepth ?? 40);
  const [schedule, setSchedule] = useState<
    RankTrackingConfig["scheduleInterval"]
  >(existingConfig?.scheduleInterval ?? "weekly");
  const [createdConfigId, setCreatedConfigId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (normalizedDomain: string) =>
      createRankTrackingConfig({
        data: {
          projectId,
          domain: normalizedDomain,
          devices,
          serpDepth,
          locationCode: area.locationCode,
          languageCode,
          scheduleInterval: schedule,
        },
      }),
    onSuccess: (result) => {
      captureClientEvent("rank_tracking:config_create");
      toast.success("Domain added for rank tracking");
      setCreatedConfigId(result.configId);
      onConfigCreated?.();
      setStep("keywords");
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Failed to save config"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (normalizedDomain: string) =>
      updateRankTrackingConfig({
        data: {
          projectId,
          configId: existingConfig!.id,
          domain: normalizedDomain,
          devices,
          serpDepth,
          locationCode: area.locationCode,
          languageCode,
          scheduleInterval: schedule,
        },
      }),
    onSuccess: () => {
      captureClientEvent("rank_tracking:config_update");
      toast.success("Configuration updated");
      onSaved();
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Failed to update config"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (!domain.trim()) {
      toast.error("Please enter a domain");
      return;
    }
    const parsedDomain = domainField.safeParse(domain);
    if (!parsedDomain.success) {
      toast.error("Please enter a valid domain");
      return;
    }
    setDomain(parsedDomain.data);
    if (isEdit) {
      updateMutation.mutate(parsedDomain.data);
    } else {
      createMutation.mutate(parsedDomain.data);
    }
  };

  const handleDomainBlur = () => {
    try {
      setDomain(normalizeDomain(domain));
    } catch {
      // Keep invalid partial input editable; submit validation will show the error.
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (step === "keywords" && createdConfigId) {
    const closeKeywordStep = () => onSaved(createdConfigId);

    return (
      <Modal
        maxWidth="max-w-3xl"
        onClose={closeKeywordStep}
        labelledBy="keyword-suggestions-title"
      >
        <KeywordSuggestionStep
          configId={createdConfigId}
          projectId={projectId}
          domain={domain}
          locationCode={area.locationCode}
          languageCode={languageCode}
          onDone={(id) => onSaved(id)}
          onClose={closeKeywordStep}
        />
      </Modal>
    );
  }

  return (
    <Modal
      maxWidth="max-w-lg"
      onClose={onClose}
      labelledBy="rank-config-modal-title"
    >
      <div className="flex items-center justify-between">
        <h2 id="rank-config-modal-title" className="text-lg font-semibold">
          {isEdit ? "Edit Domain Config" : "Add Domain"}
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

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="form-control">
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-medium">Target Domain</span>
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
            <span className="font-medium">Location</span>
          </label>
          <GeoLocationSelect
            value={area}
            onChange={(nextArea) => {
              setAreaTouched(true);
              setArea(nextArea);
              setLanguageCode(getLanguageCode(nextArea.parentCountryCode));
            }}
          />
          {!isEdit && defaultArea && defaultArea.kind !== "country" ? (
            <div className="mt-1.5 text-xs text-base-content/50">
              Defaulted from your confirmed target area — change it above to
              track a different market.
            </div>
          ) : null}
        </div>

        <div className="form-control">
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-medium">Language</span>
          </label>
          <select
            className="app-select w-full"
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            disabled={languageOptions.length <= 1}
          >
            {languageOptions.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-control">
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-medium">Devices</span>
          </label>
          <select
            className="app-select w-full"
            value={devices}
            onChange={(e) => {
              const value = e.target.value;
              if (
                value === "both" ||
                value === "desktop" ||
                value === "mobile"
              ) {
                setDevices(value);
              }
            }}
          >
            <option value="both">Desktop + Mobile</option>
            <option value="desktop">Desktop only</option>
            <option value="mobile">Mobile only</option>
          </select>
          <div className="mt-1.5 text-xs text-base-content/50">
            Most Google searches come from mobile, but select this based on your
            customer.
          </div>
          {devices === "both" && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-info">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>
                Tracking both devices uses 2x credits per keyword check
              </span>
            </div>
          )}
        </div>

        <div className="form-control">
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-medium">Schedule</span>
          </label>
          <select
            className="app-select w-full"
            value={schedule}
            onChange={(e) => {
              const value = e.target.value;
              if (
                value === "daily" ||
                value === "weekly" ||
                value === "monthly" ||
                value === "manual"
              ) {
                setSchedule(value);
              }
            }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly (end of month)</option>
            <option value="manual">Manual only</option>
          </select>
          {schedule === "daily" && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>Daily checks use 7x more credits than weekly</span>
            </div>
          )}
        </div>

        <div className="form-control">
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-medium">Search Depth</span>
          </label>
          <select
            className="app-select w-full"
            value={depthToPages(serpDepth)}
            onChange={(e) => setSerpDepth(pagesToDepth(Number(e.target.value)))}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((pages) => (
              <option key={pages} value={pages}>
                {pages} {pages === 1 ? "page" : "pages"} (top {pages * 10}{" "}
                results)
              </option>
            ))}
          </select>
          <div className="mt-1.5 text-xs text-base-content/50">
            10 pages is ~8x more expensive than 1 page
          </div>
        </div>

        <CostEstimateSummary
          devices={devices}
          serpDepth={serpDepth}
          schedule={schedule}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isPending || !domain.trim()}
          >
            {isPending && <CircleNotch className="size-3.5 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Domain"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
