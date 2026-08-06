/* eslint-disable max-lines -- SERP results and their paid-query authorization stay colocated. */
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CircleDollarSign,
  Gauge,
  HelpCircle,
  ListOrdered,
  Search,
} from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSerpOverview } from "@/serverFunctions/serp";
import { serpOverviewSchema } from "@/types/schemas/serp";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import { estimateTrafficShare } from "@/client/features/serp/serpTrafficShare";
import { SerpStrengthCards } from "@/client/features/serp/SerpStrengthCards";
import {
  InsightIcon,
  InsightTile,
  type InsightTone,
} from "@/client/components/InsightTile";
import {
  useAhrefsDomainRatings,
  type DomainRatings,
} from "@/client/features/backlinks/useAhrefsDomainRatings";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import {
  useProjectDomain,
  useProjectMarket,
} from "@/client/hooks/useProjectDomain";
import { useProjectSuggestions } from "@/client/features/insights/useProjectSuggestions";
import { useLastRunInput } from "@/client/features/insights/useLastRunInput";
import { resolvePrefill } from "@/client/features/insights/resolvePrefill";
import {
  useHandoff,
  writeHandoff,
} from "@/client/features/insights/handoffStore";
import { SuggestionChips } from "@/client/features/insights/SuggestionChips";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import {
  buildSerpVerdict,
  serpRowNote,
} from "@/client/features/insights/verdicts/serp";
import { ScopeControl } from "@/client/features/geo/ScopeControl";
import { TargetAreaBanner } from "@/client/features/geo/TargetAreaBanner";
import { useTargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import {
  describeGeoFetchFailure,
  describeGeoUnavailable,
} from "@/client/features/geo/geoUnavailableMessage";
import { useKeywordDifficultyOverview } from "@/client/features/keywords/hooks/useKeywordDifficultyOverview";
import { DifficultyOverviewControl } from "@/client/features/keywords/DifficultyOverviewControl";
import { formatGeoMetricLabel } from "@/client/features/geo/geoMetricLabel";
import {
  buildSerpGeoPayload,
  captureSerpRunGeo,
  describeGeoRunErrorForSerp,
  parseRestoredSerpRunGeo,
  type SerpRunGeo,
} from "@/client/features/serp/serpRunGeo";
import { AppPageShell } from "@/client/components/AppPageShell";
import { Button } from "@cloudflare/kumo/components/button";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Input } from "@cloudflare/kumo/components/input";

type SerpNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

function formatFeatureLabel(type: string): string {
  return type.replace(/_/g, " ");
}

/** Green under 30, amber to 60, red above — mirrors the difficulty badge. */
function difficultyTone(value: number | null | undefined): InsightTone {
  if (value == null) return "neutral";
  if (value < 30) return "success";
  if (value < 60) return "warning";
  return "error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The project's own DR, or null when there's no domain or Ahrefs hasn't
 *  rated it yet. Split out so the render function states its intent in one
 *  line rather than a ternary. */
function computeOwnDomainRating(
  projectDomain: string | null,
  ratings: DomainRatings | null,
): number | null {
  return projectDomain && ratings ? (ratings[projectDomain] ?? null) : null;
}

/**
 * Shapes this page's fetched result into the verdict model's input. Kept
 * outside the component so wiring glue doesn't compete with layout for the
 * render function's line budget.
 *
 * Excludes the project's own domain from the field before it ever reaches
 * the verdict: if the project already ranks in this SERP, its own DR is not
 * a "competitor" rating, and folding it in would understate how strong the
 * field actually is. Compares with the same bare `===` that
 * `computeOwnDomainRating` above uses for "is this our own domain" (this
 * page does not strip "www." or subdomains for that check, so neither does
 * this, to avoid the two disagreeing about what "our own site" means).
 */
function buildPageSerpVerdict(
  result: NonNullable<Awaited<ReturnType<typeof getSerpOverview>>>,
  ratings: DomainRatings | null,
  ownDomainRating: number | null,
  projectDomain: string | null,
  geo: SerpRunGeo,
) {
  const competitorResults = result.results.filter(
    (item) => !(item.domain && item.domain === projectDomain),
  );

  return buildSerpVerdict({
    keyword: result.keyword,
    ownDomainRating,
    competitorRatings: competitorResults
      .map((item) => (item.domain ? (ratings?.[item.domain] ?? null) : null))
      .filter((value): value is number => value != null),
    resultCount: competitorResults.length,
    paaQuestions: result.paaQuestions,
    // Only a genuinely LOCAL SERP names its area -- a national result stays
    // unqualified, exactly as this verdict read before Task 6.
    areaLabel: geo.serp.scope === "local" ? geo.serp.label : null,
  });
}

/**
 * The `extract` this tab hands to `useLastRunInput`: pulls `keyword` off the
 * stored SERP-overview result. A shape that has drifted (or isn't this
 * feature's result at all) returns null rather than throwing — the tab
 * simply has no last-run value to offer, same contract as the hook itself.
 */
function extractStoredKeyword(result: unknown): string | null {
  if (!isRecord(result)) return null;
  return typeof result.keyword === "string" ? result.keyword : null;
}

/**
 * The submit button, paired with an invisible copy of the "Keyword"/
 * "Location" label row above it. The form aligns its columns with
 * `items-start` so the keyword column's chips (rendered after the input)
 * can never drag the other columns down -- but that only works if every
 * column starts with the same label-row height. This column has no real
 * label, so the phantom one here lands the button's own control at the
 * input's y-offset instead of flush with the "Keyword"/"Location" text.
 * `hidden`/`sm:block` keeps it out of the stacked mobile layout, where
 * nothing pushes the button down and this spacer would only add dead space.
 */
function AnalyzeButton({
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
        Analyze
      </span>
      <Button type="submit" variant="primary" size="sm" disabled={disabled}>
        {isFetching ? <Loader size="sm" /> : <Search className="size-3.5" />}
        Analyze
      </Button>
    </div>
  );
}

/**
 * The keyword/location form. Split out from the page's own render function
 * (like `AnalyzeButton` and `SerpKeywordStatsTiles`) purely to stay inside
 * this file's `max-lines-per-function` budget -- `onSubmit` carries the
 * actual submit LOGIC (geo capture, `run.authorize()`, handoff, navigate),
 * defined once in the parent as `handleAnalyzeSubmit` so this component
 * stays pure layout.
 */
function SerpSearchForm({
  input,
  setInput,
  setInputTouched,
  locationInput,
  setLocationInput,
  setLocationTouched,
  suggestions,
  isFetching,
  onSubmit,
}: {
  input: string;
  setInput: (value: string) => void;
  setInputTouched: (value: boolean) => void;
  locationInput: string;
  setLocationInput: (value: string) => void;
  setLocationTouched: (value: boolean) => void;
  suggestions: ReturnType<typeof useProjectSuggestions>;
  isFetching: boolean;
  onSubmit: (keyword: string) => void;
}) {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            const next = input.trim();
            if (!next) return;
            onSubmit(next);
          }}
        >
          <div className="flex w-full flex-col gap-1.5 sm:max-w-md">
            <label className="form-control w-full">
              <span className="label-text pb-1 text-xs font-medium">
                Keyword
              </span>
              <Input
                type="text"
                size="sm"
                className="w-full"
                placeholder="office coffee service dallas"
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
              disabled={isFetching}
            />
          </div>
          <label className="form-control w-full sm:max-w-56">
            <span className="label-text pb-1 text-xs font-medium">
              Location
            </span>
            <select
              className="select select-bordered select-sm w-full"
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
          <AnalyzeButton
            disabled={!input.trim() || isFetching}
            isFetching={isFetching}
          />
        </form>
      </div>
    </div>
  );
}

/**
 * The keyword-stats KPI row: volume, difficulty, CPC, and organic result
 * count. Split out (like `AnalyzeButton` and `SerpResultsTable` below) so
 * this page's render function doesn't spend its line budget on four
 * near-identical `InsightTile` calls.
 *
 * `geo` is the bundle CAPTURED for this specific run (see
 * `captureSerpRunGeo`/`parseRestoredSerpRunGeo`) -- every label below is
 * derived from it, never from `useTargetAreaScope`'s live area, which this
 * component never even receives.
 */
function SerpKeywordStatsTiles({
  projectId,
  result,
  geo,
}: {
  projectId: string;
  result: NonNullable<Awaited<ReturnType<typeof getSerpOverview>>>;
  geo: SerpRunGeo;
}) {
  const difficultyOverview = useKeywordDifficultyOverview(projectId);
  const loadedDifficulty = difficultyOverview.byKeyword.get(
    result.keyword.toLowerCase(),
  )?.keywordDifficulty;
  const difficultyValue =
    loadedDifficulty !== undefined
      ? loadedDifficulty
      : (result.keywordStats?.keywordDifficulty ?? null);

  // Volume/CPC came back null-difficulty from Google Ads (a metro's genuine
  // local scope, see SerpOverviewService's own header) -- Labs, the sole
  // difficulty source, can still answer at country level. If the main run
  // was ALREADY Labs (national scope) and still got null, Labs itself has
  // no data for this term -- a second identical Labs call would just waste
  // a click, so the affordance only appears when it can plausibly help.
  const canBackfillDifficulty =
    geo.volume.provider === "google_ads" && geo.difficulty.provider === "labs";
  const difficultyUnavailableMessage = describeGeoUnavailable(
    "Keyword difficulty",
    geo.difficulty,
  );
  const showDifficultyAffordance =
    difficultyValue == null &&
    (canBackfillDifficulty || difficultyUnavailableMessage != null);

  // Defect 3 fix: the server attempted these enrichments and they threw --
  // distinct from a tile simply reading "—" because there was nothing to
  // show. Named messages, not a boolean render, so the user learns WHAT
  // failed and for WHICH geography rather than guessing from a blank tile.
  const keywordStatsFailureMessage = result.keywordStatsUnavailable
    ? describeGeoFetchFailure("Keyword volume and CPC", geo.volume)
    : null;
  const domainTrafficFailureMessage = result.domainTrafficUnavailable
    ? describeGeoFetchFailure("Domain traffic", geo.domainAnalytics)
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InsightTile
          icon={BarChart3}
          label={formatGeoMetricLabel("Volume", geo.volume)}
          value={formatCount(result.keywordStats?.searchVolume)}
          tone="primary"
        />
        <InsightTile
          icon={Gauge}
          label={formatGeoMetricLabel("Difficulty", geo.difficulty)}
          value={difficultyValue ?? "—"}
          tone={difficultyTone(difficultyValue)}
        />
        <InsightTile
          icon={CircleDollarSign}
          label={formatGeoMetricLabel("CPC", geo.volume)}
          value={
            result.keywordStats?.cpc != null
              ? `$${result.keywordStats.cpc.toFixed(2)}`
              : "—"
          }
          tone="info"
        />
        <InsightTile
          icon={ListOrdered}
          label={formatGeoMetricLabel("Organic results", geo.serp)}
          value={result.totalOrganic}
          // Only the top MAX_RESULTS are fetched (serpOverviewMapping.ts) --
          // when that's fewer than the total, the table below isn't the whole
          // picture, which the bare count alone can't tell you. Once nothing
          // was truncated, this would just repeat the value above it.
          hint={
            result.results.length < result.totalOrganic
              ? `Top ${result.results.length} shown`
              : undefined
          }
        />
      </div>
      {showDifficultyAffordance ? (
        <DifficultyOverviewControl
          count={1}
          unavailableMessage={difficultyUnavailableMessage}
          isLoading={difficultyOverview.isLoading}
          isError={difficultyOverview.isError}
          loaded={false}
          onLoad={() =>
            difficultyOverview.load({
              keywords: [result.keyword],
              locationCode: geo.difficulty.locationCode,
              languageCode: geo.difficulty.languageCode,
            })
          }
        />
      ) : null}
      {keywordStatsFailureMessage ? (
        <p className="text-xs text-base-content/50">
          {keywordStatsFailureMessage}
        </p>
      ) : null}
      {domainTrafficFailureMessage ? (
        <p className="text-xs text-base-content/50">
          {domainTrafficFailureMessage}
        </p>
      ) : null}
    </div>
  );
}

export function SerpOverviewPage({
  projectId,
  navigate,
  query,
  locationCode,
}: {
  projectId: string;
  navigate: SerpNavigate;
  query: string;
  locationCode: number | undefined;
}) {
  const market = useProjectMarket(projectId);
  const projectDomain = useProjectDomain(projectId);
  // The URL's own `loc` param always wins; the project's configured market
  // only fills in for a tab opened with no location in the URL at all.
  const activeLocation = locationCode ?? market.locationCode;

  const suggestions = useProjectSuggestions(projectId, "striking-distance");
  const handoff = useHandoff(projectId);
  // This page already imports RUN_FEATURES for its RecentRunsList; reuse the
  // same feature key so both read one cache entry.
  const lastRun = useLastRunInput(
    projectId,
    RUN_FEATURES.serpOverview,
    extractStoredKeyword,
  );

  // The URL param wins, then a keyword carried from another tab, then what
  // this tab last ran, then the striking-distance ranking. Resolved only for
  // the field's initial value — after that the user owns the input.
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

  // `activeLocation` has the same deferred-arrival problem as the keyword
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

  // The confirmed target area (or the project's country, before anything is
  // confirmed) that `ScopeControl` shows in the header. Live and reactive --
  // it must NEVER be read directly into `run`'s key, `serpQuery`, or any
  // label below. `captureSerpRunGeo` is the only thing allowed to read it,
  // and only at the exact moment a run is authorized (see `runGeo` below).
  const targetAreaScope = useTargetAreaScope(projectId, activeLocation);

  const [runInput, setRunInput] = useState<{
    keyword: string;
    locationCode: number;
    languageCode: string;
  } | null>(null);
  // The geo CAPTURED for the run currently in `runInput` -- set in the same
  // breath as `runInput` itself (submit handler / "Run again" below), never
  // recomputed later. This is what every label on this page reads; changing
  // `targetAreaScope` after a run has already fired cannot touch it.
  const [runGeo, setRunGeo] = useState<SerpRunGeo | null>(null);
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, input.trim(), Number(locationInput)),
  );

  const serpQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: runInput != null,
    queryKey: ["serp-overview", projectId, runInput],
    queryFn: () =>
      getSerpOverview({
        data: {
          projectId,
          keyword: runInput?.keyword ?? "",
          locationCode: runInput?.locationCode ?? activeLocation,
          languageCode: runInput?.languageCode,
          // Defect 2 fix: the country-only pair for the Labs domain-traffic
          // enrichment -- deliberately separate from locationCode/languageCode
          // above, which stay whatever this run's SERP/keyword-stats geography
          // resolved to (a metro code for a local run). See serpRunGeo.ts's
          // own captureSerpRunGeo and SerpOverviewService.ts's
          // resolveDomainAnalyticsLocation.
          domainAnalyticsLocationCode: runGeo?.domainAnalytics.locationCode,
          domainAnalyticsLanguageCode: runGeo?.domainAnalytics.languageCode,
          // Defect 1 fix: sent purely so the server can persist it in this
          // run's history -- never read back to decide anything about THIS
          // request, which is already fully determined by the fields above.
          geo: runGeo ? buildSerpGeoPayload(runGeo) : undefined,
        },
      }),
  });

  // With no keyword in the URL the query above stays disabled, so the tab would
  // otherwise show only a prompt. Restoring the project's last run fills it in
  // for free: it reads a stored row plus the R2 object that run already paid
  // for, and can never trigger a metered fetch.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.serpOverview,
    schema: serpOverviewSchema,
    enabled: runInput == null,
    runId: selectedRunId,
  });
  const result = serpQuery.data ?? restored?.result;
  const restoredRun = serpQuery.data == null ? restored : null;
  // `runGeo` only ever gets set alongside `runInput` (see the submit handler
  // and "Run again" below), so the two are never out of sync: whenever a
  // live run is active, `runGeo` describes it; otherwise (a restored run,
  // gated on `runInput == null` same as `restoredRun` above) this falls back
  // to that run's OWN persisted geo bundle (Defect 1 fix) -- never today's
  // live scope control, and never reconstructed from the bare stored
  // locationCode/languageCode (see `parseRestoredSerpRunGeo`'s own doc
  // comment for why that used to mislabel a local run).
  const effectiveGeo: SerpRunGeo | null =
    runGeo ??
    (restoredRun ? parseRestoredSerpRunGeo(restoredRun.params) : null);
  const errorMessage = serpQuery.isError
    ? describeGeoRunErrorForSerp(
        effectiveGeo,
        getStandardErrorMessage(serpQuery.error),
      )
    : null;

  // Ahrefs DR enrichment (free + KV-cached server side) for each result domain.
  const { ratings, loadRatings } = useAhrefsDomainRatings(projectId);
  useEffect(() => {
    if (!result) return;
    const domains = result.results
      .map((item) => item.domain)
      .filter((domain): domain is string => Boolean(domain));
    if (domains.length > 0) void loadRatings(domains);
  }, [result, loadRatings]);

  // Read once and threaded into both the verdict and the results table below,
  // so the two can never disagree about what "our own site" means.
  const ownDomainRating = computeOwnDomainRating(projectDomain, ratings);

  // Captures geo at the exact moment this run is authorized -- never
  // recomputed later from the live scope control (see resolveRunGeo.ts).
  // Closes over the CURRENT render's `locationInput`, exactly like every
  // other read of it in this handler; that's fine, a submit is synchronous.
  const handleAnalyzeSubmit = (keyword: string) => {
    const geo = captureSerpRunGeo(targetAreaScope.area, Number(locationInput));
    setRunGeo(geo);
    setRunInput({
      keyword,
      locationCode: geo.serp.locationCode,
      languageCode: geo.serp.languageCode,
    });
    run.authorize();
    // The handoff and URL both stay at the plain session country -- other
    // tabs' own country pickers can't render a metro code, and this is a
    // hint for THEIR field, not a record of what this run resolved to.
    writeHandoff(projectId, {
      kind: "keyword",
      value: keyword,
      locationCode: Number(locationInput),
      source: "SERP Overview",
      at: Date.now(),
    });
    navigate({
      search: (prev) => ({ ...prev, q: keyword, loc: Number(locationInput) }),
      replace: false,
    });
  };

  return (
    <AppPageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ListOrdered className="size-6" />
            SERP Overview
          </h1>
          <p className="text-sm text-base-content/60">
            See who ranks in the live top results for any keyword — with each
            page&rsquo;s authority, estimated traffic, and backlinks — plus the
            SERP features and People-Also-Ask questions you&rsquo;d compete
            with.
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

      <SerpSearchForm
        input={input}
        setInput={setInput}
        setInputTouched={setInputTouched}
        locationInput={locationInput}
        setLocationInput={setLocationInput}
        setLocationTouched={setLocationTouched}
        suggestions={suggestions}
        isFetching={serpQuery.isFetching}
        onSubmit={handleAnalyzeSubmit}
      />

      {errorMessage ? (
        <Banner variant="error" className="text-sm">
          {errorMessage}
        </Banner>
      ) : null}

      {runInput == null ? (
        <RecentRunsList
          projectId={projectId}
          feature={RUN_FEATURES.serpOverview}
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
            setInput(restoredRun.result.keyword);
            setLocationInput(String(restoredRun.result.locationCode));
            // A genuine new user-authorized run, so it captures the CURRENT
            // live scope control -- same as a fresh submit, just seeded from
            // the restored run's own keyword/location instead of the form.
            const geo = captureSerpRunGeo(
              targetAreaScope.area,
              restoredRun.result.locationCode,
            );
            setRunGeo(geo);
            setRunInput({
              keyword: restoredRun.result.keyword,
              locationCode: geo.serp.locationCode,
              languageCode: geo.serp.languageCode,
            });
            run.authorize(
              createMeteredRunKey(
                projectId,
                restoredRun.result.keyword,
                restoredRun.result.locationCode,
              ),
            );
            // A re-run is a genuine, user-authorized run for this keyword --
            // the next tab opened should inherit it, same as a fresh submit.
            writeHandoff(projectId, {
              kind: "keyword",
              value: restoredRun.result.keyword,
              locationCode: restoredRun.result.locationCode,
              source: "SERP Overview",
              at: Date.now(),
            });
            navigate({
              search: (prev) => ({
                ...prev,
                q: restoredRun.result.keyword,
                loc: restoredRun.result.locationCode,
              }),
              replace: false,
            });
          }}
        />
      ) : null}

      {runInput == null && !restoredRun ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-12 text-center">
            <p className="font-medium">Enter a keyword to get started</p>
            <p className="max-w-md text-sm text-base-content/60">
              Analyze any SERP to size up the competition before you target a
              keyword.
            </p>
          </div>
        </div>
      ) : null}

      {result && effectiveGeo ? (
        <>
          <SerpKeywordStatsTiles
            projectId={projectId}
            result={result}
            geo={effectiveGeo}
          />

          {result.serpFeatures.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                SERP features
              </span>
              {result.serpFeatures.map((feature) => (
                <Badge
                  key={feature.type}
                  variant="neutral"
                  className="capitalize"
                >
                  {formatFeatureLabel(feature.type)}
                  {feature.count > 1 ? ` ×${feature.count}` : ""}
                </Badge>
              ))}
            </div>
          ) : null}

          <SerpStrengthCards results={result.results} ratings={ratings} />

          <NextStepsCard
            verdict={buildPageSerpVerdict(
              result,
              ratings,
              ownDomainRating,
              projectDomain,
              effectiveGeo,
            )}
            projectId={projectId}
            tab="SERP Overview"
          />

          <SerpResultsTable
            result={result}
            ratings={ratings}
            ownDomainRating={ownDomainRating}
            geo={effectiveGeo}
          />

          {result.paaQuestions.length > 0 ? (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body gap-2 p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <InsightIcon icon={HelpCircle} tone="info" />
                  People also ask
                </h2>
                <ul className="list-inside list-disc space-y-1 text-sm text-base-content/80">
                  {result.paaQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-base-content/40">
            Top {result.results.length} of {result.totalOrganic} organic results
            · fetched {new Date(result.fetchedAt).toLocaleString()} · DR via
            Ahrefs
          </p>
        </>
      ) : null}

      {runInput != null && serpQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader size="base" />
        </div>
      ) : null}
    </AppPageShell>
  );
}

function SerpResultsTable({
  result,
  ratings,
  ownDomainRating,
  geo,
}: {
  result: NonNullable<Awaited<ReturnType<typeof getSerpOverview>>>;
  ratings: DomainRatings | null;
  ownDomainRating: number | null;
  geo: SerpRunGeo;
}) {
  // Ahrefs-style estimate: keyword volume spread over a standard
  // CTR-by-position curve. Client-side, no extra API spend.
  const trafficShare = estimateTrafficShare(
    result.keywordStats?.searchVolume,
    result.results.map((item) => item.rank),
  );

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-14">#</th>
              <th>Result</th>
              {trafficShare ? (
                <th
                  className="text-right"
                  title="Estimated monthly clicks for this result: search volume × a standard CTR-by-position curve"
                >
                  {formatGeoMetricLabel("Est. clicks", geo.volume)}
                </th>
              ) : null}
              <th className="text-right">DR</th>
              <th
                className="text-right"
                title="Estimated monthly organic traffic for the whole domain"
              >
                {formatGeoMetricLabel("Domain traffic", geo.domainAnalytics)}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((item) => {
              const estimate =
                item.rank != null ? trafficShare?.get(item.rank) : undefined;
              const rowNote = serpRowNote(
                {
                  domainRating: item.domain
                    ? (ratings?.[item.domain] ?? null)
                    : null,
                },
                { ownDomainRating },
              );
              return (
                <tr key={`${item.rank}-${item.url}`}>
                  <td className="align-top">
                    <div className="flex items-center gap-1 tabular-nums">
                      {item.rank ?? "—"}
                      {item.isNew ? (
                        <Badge variant="success">new</Badge>
                      ) : item.isUp ? (
                        <ArrowUp className="size-3 text-success" />
                      ) : item.isDown ? (
                        <ArrowDown className="size-3 text-error" />
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-xl align-top">
                    <a
                      href={item.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-1 font-medium hover:underline"
                    >
                      {item.title ?? item.url ?? "—"}
                    </a>
                    <div className="line-clamp-1 text-xs text-success/80">
                      {item.url}
                    </div>
                    {rowNote ? (
                      <div className="text-xs text-base-content/45">
                        {rowNote}
                      </div>
                    ) : null}
                    {item.description ? (
                      <div className="line-clamp-2 text-xs text-base-content/60">
                        {item.description}
                      </div>
                    ) : null}
                  </td>
                  {trafficShare ? (
                    <td className="text-right align-top">
                      <div className="tabular-nums">
                        {estimate ? formatCount(estimate.clicks) : "—"}
                      </div>
                      {estimate ? (
                        <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-base-200">
                          <div
                            className="h-full rounded-full bg-primary/60"
                            style={{
                              width: `${Math.round(estimate.relative * 100)}%`,
                            }}
                          />
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="text-right align-top tabular-nums">
                    {item.domain != null && ratings?.[item.domain] != null
                      ? ratings[item.domain]
                      : "—"}
                  </td>
                  <td className="text-right align-top tabular-nums">
                    {formatCount(item.domainEtv)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
