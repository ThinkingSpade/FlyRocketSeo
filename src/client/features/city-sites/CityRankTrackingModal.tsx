import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleNotch } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@cloudflare/kumo/components/button";
import { InputArea } from "@cloudflare/kumo/components/input";
import { Select } from "@cloudflare/kumo/components/select";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  planCityRankTracking,
  setupCityRankTracking,
} from "@/serverFunctions/citySites";
import {
  parseKeywordTemplates,
  toRankScheduleInterval,
  usesCityToken,
  type RankScheduleInterval,
} from "@/shared/city-subdomains/cityKeywordTemplates";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import { CityRankPlanSummary } from "./CityRankPlanSummary";

const PLAN_DEBOUNCE_MS = 400;
const SERP_DEPTHS = [10, 20, 50, 100] as const;

const INTERVALS: { value: RankScheduleInterval; label: string }[] = [
  { value: "manual", label: "Manual — only when you run it" },
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
];

const TEMPLATE_PLACEHOLDER = `plumber {city}
emergency plumber {city} {state}
plumber near me`;

/**
 * Sets up rank tracking across many city subdomains at once.
 *
 * The schedule defaults to MANUAL, deliberately. Every other control in this
 * app spends only when someone presses it; a scheduled config is the one thing
 * that spends afterwards, on a cron, without anyone present. Creating hundreds
 * of those from a bulk selection is exactly where a surprise bill comes from,
 * so recurring spend here is opt-in and priced on screen before the button is
 * available to press.
 */
export function CityRankTrackingModal({
  projectId,
  citySiteIds,
  onClose,
}: {
  projectId: string;
  citySiteIds: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [templateText, setTemplateText] = React.useState("");
  const [devices, setDevices] =
    React.useState<RankTrackingConfig["devices"]>("desktop");
  const [serpDepth, setSerpDepth] = React.useState<number>(100);
  const [interval, setInterval] =
    React.useState<RankScheduleInterval>("manual");
  const [debouncedText, setDebouncedText] = React.useState("");
  const [progress, setProgress] = React.useState<{
    created: number;
    running: boolean;
  }>({ created: 0, running: false });

  React.useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedText(templateText),
      PLAN_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [templateText]);

  const templates = React.useMemo(
    () => parseKeywordTemplates(debouncedText),
    [debouncedText],
  );
  const settings = React.useMemo(
    () => ({ templates, devices, serpDepth, interval }),
    [templates, devices, serpDepth, interval],
  );

  const planQuery = useQuery({
    queryKey: ["cityRankPlan", projectId, citySiteIds, settings],
    queryFn: () =>
      planCityRankTracking({ data: { projectId, citySiteIds, ...settings } }),
    // No templates means nothing to price; the endpoint would reject it too.
    enabled: templates.length > 0,
  });

  const plan = templates.length > 0 ? planQuery.data : undefined;
  const eligibleCount = plan?.eligible.length ?? 0;
  const noCityToken =
    templates.length > 0 &&
    !templates.some((template) => usesCityToken(template));

  const setupMutation = useMutation({
    mutationFn: async () => {
      setProgress({ created: 0, running: true });
      let offset = 0;
      let created = 0;
      const failures: string[] = [];
      // Each round either creates something or steps past a failure, so this
      // bounds the loop without capping a legitimate run.
      const maxRounds = eligibleCount + 10;

      for (let round = 0; round < maxRounds; round += 1) {
        const result = await setupCityRankTracking({
          data: { projectId, citySiteIds, ...settings, offset },
        });
        created += result.created;
        failures.push(...result.failed.map((failure) => failure.host));
        setProgress({ created, running: true });
        if (result.done) break;
        offset = result.nextOffset;
      }
      return { created, failures };
    },
    onSuccess: async ({ created, failures }) => {
      await queryClient.invalidateQueries({
        queryKey: ["citySites", projectId],
      });
      if (created > 0) {
        toast.success(
          `Tracking ${created.toLocaleString()} cit${created === 1 ? "y" : "ies"}`,
        );
      }
      if (failures.length > 0) {
        toast.error(
          `${failures.length.toLocaleString()} could not be set up: ${failures.slice(0, 3).join(", ")}`,
        );
      }
      onClose();
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not set up tracking")),
    onSettled: () => setProgress((current) => ({ ...current, running: false })),
  });

  const busy = setupMutation.isPending;

  return (
    <Modal
      maxWidth="max-w-xl"
      onClose={busy ? undefined : onClose}
      labelledBy="city-rank-title"
    >
      <h2 id="city-rank-title" className="text-lg font-semibold">
        Track ranks for {citySiteIds.length.toLocaleString()} cit
        {citySiteIds.length === 1 ? "y" : "ies"}
      </h2>
      <p className="text-sm text-base-content/60">
        Each city gets its own rank tracking, checked at that city&rsquo;s own
        location.
      </p>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Keywords to track</span>
        <InputArea
          className="h-28 w-full font-mono text-xs"
          placeholder={TEMPLATE_PLACEHOLDER}
          value={templateText}
          disabled={busy}
          onChange={(event) => setTemplateText(event.target.value)}
        />
        <span className="text-xs text-base-content/55">
          One per line. <code>{"{city}"}</code> and <code>{"{state}"}</code> are
          filled in per city — <code>plumber {"{city}"}</code> becomes{" "}
          <code>plumber austin</code>.
        </span>
      </label>

      {noCityToken ? (
        <p className="rounded-lg border border-base-300 bg-base-200/40 px-3 py-2 text-xs text-base-content/70">
          None of these use <code>{"{city}"}</code>, so every city is tracked on
          the same keywords. That is fine for terms like{" "}
          <code>plumber near me</code>, which the city&rsquo;s own location
          already localizes.
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <Field label="Devices">
          <Select
            aria-label="Devices"
            size="sm"
            className="w-full"
            value={devices}
            disabled={busy}
            onValueChange={(value) =>
              setDevices(
                value === "both"
                  ? "both"
                  : value === "mobile"
                    ? "mobile"
                    : "desktop",
              )
            }
          >
            <Select.Option value="desktop">Desktop</Select.Option>
            <Select.Option value="mobile">Mobile</Select.Option>
            <Select.Option value="both">Both (2x cost)</Select.Option>
          </Select>
        </Field>

        <Field label="Depth">
          <Select
            aria-label="Depth"
            size="sm"
            className="w-full"
            value={serpDepth}
            disabled={busy}
            onValueChange={(value) => setSerpDepth(Number(value))}
          >
            {SERP_DEPTHS.map((depth) => (
              <Select.Option key={depth} value={depth}>
                Top {depth}
              </Select.Option>
            ))}
          </Select>
        </Field>

        <Field label="Schedule">
          <Select
            aria-label="Schedule"
            size="sm"
            className="w-full"
            value={interval}
            disabled={busy}
            onValueChange={(value) =>
              setInterval(toRankScheduleInterval(String(value)))
            }
          >
            {INTERVALS.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
        </Field>
      </div>

      <CityRankPlanSummary
        plan={plan}
        loading={templates.length > 0 && planQuery.isLoading}
        interval={interval}
      />

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy || eligibleCount === 0}
          onClick={() => setupMutation.mutate()}
        >
          {busy ? (
            <>
              <CircleNotch className="size-4 animate-spin" />
              Setting up {progress.created.toLocaleString()} of{" "}
              {eligibleCount.toLocaleString()}
            </>
          ) : (
            `Set up ${eligibleCount.toLocaleString()} cit${eligibleCount === 1 ? "y" : "ies"}`
          )}
        </Button>
      </div>
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
