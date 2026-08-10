import { useEffect, useState } from "react";
import { Network, Search } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getTopicClusters } from "@/serverFunctions/topic-clusters";
import { topicClusterPlanSchema } from "@/types/schemas/topic-clusters";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { useProjectMarket } from "@/client/hooks/useProjectDomain";
import { ClusterPlan } from "@/client/features/topic-clusters/ClusterPlan";
import { ScopeControl } from "@/client/features/geo/ScopeControl";
import { TargetAreaBanner } from "@/client/features/geo/TargetAreaBanner";
import { ProjectProfileCard } from "@/client/features/profiles/ProjectProfileCard";
import { useTargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import {
  captureClusterAreaLabel,
  extractStoredConfirmedAreaLabel,
} from "@/client/features/topic-clusters/clusterAreaLabel";
import { useProjectSuggestions } from "@/client/features/insights/useProjectSuggestions";
import { useLastRunInput } from "@/client/features/insights/useLastRunInput";
import { resolvePrefill } from "@/client/features/insights/resolvePrefill";
import {
  useHandoff,
  writeHandoff,
} from "@/client/features/insights/handoffStore";
import { SuggestionChips } from "@/client/features/insights/SuggestionChips";
import { AppPageShell } from "@/client/components/AppPageShell";
import { Button } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Input } from "@cloudflare/kumo/components/input";

type ClustersNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The `extract` this tab hands to `useLastRunInput`: pulls `topic` off the
 * stored cluster-plan result. A shape that has drifted (or isn't this
 * feature's result at all) returns null rather than throwing — the tab
 * simply has no last-run value to offer, same contract as the hook itself.
 */
function extractStoredTopic(result: unknown): string | null {
  if (!isRecord(result)) return null;
  return typeof result.topic === "string" ? result.topic : null;
}

/**
 * The submit button, paired with an invisible copy of the "Seed topic"/
 * "Location" label row above it. The form aligns its columns with
 * `items-start` so the topic column's chips (rendered after the input) can
 * never drag the other columns down -- but that only works if every column
 * starts with the same label-row height. This column has no real label, so
 * the phantom one here lands the button's own control at the input's
 * y-offset instead of flush with the "Seed topic"/"Location" text.
 * `hidden`/`sm:block` keeps it out of the stacked mobile layout, where
 * nothing pushes the button down and this spacer would only add dead space.
 */
function PlanClustersButton({
  disabled,
  isFetching,
}: {
  disabled: boolean;
  isFetching: boolean;
}) {
  return (
    <div className="form-control">
      <span
        aria-hidden="true"
        className="label-text hidden pb-1 text-xs font-medium invisible sm:block"
      >
        Plan clusters
      </span>
      <Button type="submit" variant="primary" size="sm" disabled={disabled}>
        {isFetching ? <Loader size="sm" /> : <Search className="size-3.5" />}
        Plan clusters
      </Button>
    </div>
  );
}

export function TopicClustersPage({
  projectId,
  navigate,
  query,
  locationCode,
}: {
  projectId: string;
  navigate: ClustersNavigate;
  query: string;
  locationCode: number | undefined;
}) {
  const market = useProjectMarket(projectId);
  // The URL's own `loc` param always wins; the project's configured market
  // only fills in for a tab opened with no location in the URL at all.
  const activeLocation = locationCode ?? market.locationCode;
  // The header ScopeControl's own state -- a SEPARATE concept from the
  // country-only `locationInput` field below, which stays untouched here.
  // Must never be read into `run`'s key or `clustersQuery`'s queryKey;
  // wiring the chosen area into the actual fetch is Task 6's job.
  const targetAreaScope = useTargetAreaScope(projectId, activeLocation);

  const suggestions = useProjectSuggestions(projectId, "topic-gap");
  const handoff = useHandoff(projectId);
  // This page already imports RUN_FEATURES for its RecentRunsList; reuse the
  // same feature key so both read one cache entry.
  const lastRun = useLastRunInput(
    projectId,
    RUN_FEATURES.topicClusters,
    extractStoredTopic,
  );

  // The URL param wins, then a topic carried from another tab, then what this
  // tab last ran, then the topic-gap ranking. Resolved only for the field's
  // initial value — after that the user owns the input.
  const prefill = resolvePrefill({
    kind: "keyword",
    searchParam: query,
    handoff,
    lastRun,
    suggestions,
    projectDefault: null,
  });

  const [input, setInput] = useState(query);
  const [locationInput, setLocationInput] = useState(String(activeLocation));
  const [inputTouched, setInputTouched] = useState(false);
  const [locationTouched, setLocationTouched] = useState(false);

  // Every prefill source above resolves after first paint, so the `useState`
  // initializer can never see it. Seed the field once a value lands, but
  // never fight the user: bail as soon as they've typed or picked a chip
  // (inputTouched), and even before that, bail if the field is non-empty.
  useEffect(() => {
    if (inputTouched) return;
    if (input.trim() !== "") return;
    if (prefill.value === "") return;
    setInput(prefill.value);
  }, [inputTouched, input, prefill.value]);

  // `activeLocation` has the same deferred-arrival problem as the topic
  // prefill above, and it's worse here: on a cold load (hard refresh,
  // bookmark, shared link) the `["projects"]` query behind `useProjectMarket`
  // hasn't resolved on first render, so `activeLocation` reads the US
  // fallback and `locationInput` locks onto it via the `useState` initializer.
  // Without this effect the select would silently keep showing "United
  // States" even after the project's real market arrives a render later --
  // and the metered lookup below bills a wrong-country analysis with no
  // error and no visual cue. Bail on an explicit `loc` URL param (it already
  // won at first paint, synchronously -- there's nothing to re-sync) and on
  // a location the user picked themselves (locationTouched), so precedence
  // stays URL param > user selection > project market > US fallback.
  // Depending on the primitive `activeLocation` (not the `market` object)
  // keeps this from re-running every render: an unstable object dependency
  // has caused a real render loop in this codebase before.
  useEffect(() => {
    if (locationCode != null) return;
    if (locationTouched) return;
    setLocationInput(String(activeLocation));
  }, [locationCode, locationTouched, activeLocation]);

  const [runInput, setRunInput] = useState<{
    topic: string;
    locationCode: number;
  } | null>(null);
  // Defect 2 fix: the confirmed-area label CAPTURED for the run in
  // `runInput` -- set in the same breath as `runInput` itself (submit /
  // "Run again" below), never recomputed from live scope afterward (see
  // clusterAreaLabel.ts's own header). Null both before any run this
  // session AND when that run captured no confirmed area -- disambiguated
  // from "not captured yet" by always gating reads on `restoredRun` below,
  // never on this value's own nullability.
  const [runConfirmedAreaLabel, setRunConfirmedAreaLabel] = useState<
    string | null
  >(null);
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, input.trim(), Number(locationInput)),
  );

  const clustersQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: runInput != null,
    queryKey: ["topic-clusters", projectId, runInput],
    queryFn: () =>
      getTopicClusters({
        data: {
          projectId,
          topic: runInput?.topic ?? "",
          locationCode: runInput?.locationCode ?? activeLocation,
          // Sent purely so the server can persist it in this run's history
          // -- this tab's own numbers never use it (see the schema's own
          // doc comment).
          confirmedAreaLabel: runConfirmedAreaLabel,
        },
      }),
  });
  // Restoring the project's last plan is free: it reads a stored row plus the
  // R2 object that run already paid for, never a metered fetch.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.topicClusters,
    schema: topicClusterPlanSchema,
    enabled: runInput == null,
    runId: selectedRunId,
  });
  const plan = clustersQuery.data ?? restored?.result;
  const restoredRun = clustersQuery.data == null ? restored : null;
  // Whichever source `plan` itself just came from (mirrors the line above):
  // a restored plan reads ITS OWN persisted caveat state; a live/just-re-run
  // plan reads what was captured for THIS submission. Gating on
  // `restoredRun` (not `runConfirmedAreaLabel ?? ...`) matters because a
  // captured value of null is legitimate here -- it means "this run had no
  // confirmed area", not "nothing captured yet".
  const effectiveConfirmedAreaLabel = restoredRun
    ? extractStoredConfirmedAreaLabel(restoredRun.params)
    : runConfirmedAreaLabel;
  const errorMessage = clustersQuery.isError
    ? getStandardErrorMessage(clustersQuery.error)
    : null;

  return (
    <AppPageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Network className="size-6" />
            Topic Clusters
          </h1>
          <p className="text-sm text-base-content/60">
            Turn one topic into a hub-and-spoke content plan: the hub
            page&rsquo;s keyword set plus the subtopic clusters worth their own
            articles — each one a click away from a full content brief.
          </p>
        </div>
        <ScopeControl
          area={targetAreaScope.area}
          onChange={targetAreaScope.onChange}
          hasConfirmedArea={targetAreaScope.hasConfirmedArea}
          onClear={targetAreaScope.onClear}
        />
      </div>

      <TargetAreaBanner projectId={projectId} />
      <ProjectProfileCard projectId={projectId} />

      <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
        <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
            onSubmit={(event) => {
              event.preventDefault();
              const next = input.trim();
              if (!next) return;
              // Captured HERE, at authorize()-time -- never recomputed from
              // live scope afterward (Defect 2 fix).
              setRunConfirmedAreaLabel(
                captureClusterAreaLabel(
                  targetAreaScope.hasConfirmedArea,
                  targetAreaScope.area,
                ),
              );
              setRunInput({
                topic: next,
                locationCode: Number(locationInput),
              });
              run.authorize();
              writeHandoff(projectId, {
                kind: "keyword",
                value: next,
                locationCode: Number(locationInput),
                source: "Topic Clusters",
                at: Date.now(),
              });
              navigate({
                search: (prev) => ({
                  ...prev,
                  q: next,
                  loc: Number(locationInput),
                }),
                replace: false,
              });
            }}
          >
            <div className="flex w-full flex-col gap-1.5 sm:max-w-md">
              <label className="form-control w-full">
                <span className="label-text pb-1 text-xs font-medium">
                  Seed topic
                </span>
                <Input
                  passwordManagerIgnore
                  type="text"
                  size="sm"
                  className="w-full"
                  placeholder="office vending machines"
                  value={input}
                  onChange={(event) => {
                    setInputTouched(true);
                    setInput(event.target.value);
                  }}
                />
              </label>
              <SuggestionChips
                suggestions={suggestions}
                value={input}
                onSelect={(next) => {
                  setInputTouched(true);
                  setInput(next);
                }}
                disabled={clustersQuery.isFetching}
              />
            </div>
            <label className="form-control w-full sm:max-w-56">
              <span className="label-text pb-1 text-xs font-medium">
                Location
              </span>
              <select
                className="app-select app-select-sm w-full"
                value={locationInput}
                onChange={(event) => {
                  setLocationTouched(true);
                  setLocationInput(event.target.value);
                }}
              >
                {LOCATION_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <PlanClustersButton
              disabled={!input.trim() || clustersQuery.isFetching}
              isFetching={clustersQuery.isFetching}
            />
          </form>
        </div>
      </div>

      {errorMessage ? (
        <Banner variant="error" className="text-sm">
          {errorMessage}
        </Banner>
      ) : null}

      {runInput == null ? (
        <RecentRunsList
          projectId={projectId}
          feature={RUN_FEATURES.topicClusters}
          activeRunId={selectedRunId}
          onSelect={setSelectedRunId}
        />
      ) : null}

      {restoredRun ? (
        <RestoredRunBanner
          label={restoredRun.label}
          lastRanAt={restoredRun.lastRanAt}
          runCount={restoredRun.runCount}
          onRunAgain={() => {
            setInput(restoredRun.result.topic);
            setLocationInput(String(restoredRun.result.locationCode));
            // A genuine new user-authorized run, so it captures the
            // CURRENT live scope -- same as a fresh submit (Defect 2 fix).
            setRunConfirmedAreaLabel(
              captureClusterAreaLabel(
                targetAreaScope.hasConfirmedArea,
                targetAreaScope.area,
              ),
            );
            setRunInput({
              topic: restoredRun.result.topic,
              locationCode: restoredRun.result.locationCode,
            });
            run.authorize(
              createMeteredRunKey(
                projectId,
                restoredRun.result.topic,
                restoredRun.result.locationCode,
              ),
            );
            navigate({
              search: (prev) => ({
                ...prev,
                q: restoredRun.result.topic,
                loc: restoredRun.result.locationCode,
              }),
              replace: false,
            });
          }}
        />
      ) : null}

      {runInput == null && !restoredRun ? (
        <div className="relative flex flex-col rounded-xl border border-dashed border-base-300">
          <div className="flex flex-auto flex-col items-center py-12 text-center gap-2">
            <p className="font-medium">Enter a topic to plan a cluster</p>
            <p className="max-w-md text-sm text-base-content/60">
              Hub-and-spoke content is how sites own a topic: one pillar page
              plus focused articles interlinked around it.
            </p>
          </div>
        </div>
      ) : null}

      {runInput != null && clustersQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader size="base" />
        </div>
      ) : null}

      {plan ? (
        <ClusterPlan
          plan={plan}
          projectId={projectId}
          // Task 6: Topic Clusters' keyword-idea source (Labs
          // keyword_suggestions) has no metro-capable equivalent, so
          // volume/difficulty here are always national -- the CONFIRMED
          // area (not "whether it applied") lets the verdict flag that
          // mismatch instead of silently ignoring a metro the header
          // ScopeControl visibly shows.
          //
          // Defect 2 fix: this used to read `targetAreaScope` live on every
          // render, so switching the header control after `plan` loaded
          // instantly relabelled an already-rendered plan as describing a
          // DIFFERENT city than the one it was actually planned for.
          // `effectiveConfirmedAreaLabel` instead reads whatever was
          // CAPTURED for this specific plan (or, for a restored plan, what
          // that run itself persisted) -- see its own definition above.
          confirmedAreaLabel={effectiveConfirmedAreaLabel}
        />
      ) : null}
    </AppPageShell>
  );
}
