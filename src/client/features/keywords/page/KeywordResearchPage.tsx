import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "@tanstack/react-form";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { getErrorCode } from "@/client/lib/error-messages";
import { BILLING_ROUTE } from "@/shared/billing";
import { useKeywordResearchController } from "@/client/features/keywords/state/useKeywordResearchController";
import type { KeywordResearchControllerInput } from "@/client/features/keywords/state/useKeywordResearchController";
import type { KeywordControlsValues } from "@/client/features/keywords/hooks/useKeywordControlsForm";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import { useKeywordSearchParams } from "@/client/features/keywords/state/keywordControllerInternals";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";
import type {
  KeywordSearchTabInput,
  SearchTab,
} from "@/client/features/search-tabs/types";
import { SearchTabStrip } from "@/client/features/search-tabs/SearchTabStrip";
import { useSearchTabNavigation } from "@/client/features/search-tabs/useSearchTabNavigation";
import { resolveKeywordResultUsability } from "@/client/features/keywords/keywordResultUsability";
import { KeywordResearchEmptyState } from "./KeywordResearchEmptyState";
import { KeywordResearchNoMetricsState } from "./KeywordResearchNoMetricsState";
import { KeywordSaveDialog } from "./KeywordSaveDialog";
import { KeywordResearchLoadingState } from "./KeywordResearchLoadingState";
import { KeywordResearchResults } from "./KeywordResearchResults";
import { RestoreRail } from "@/client/features/analysis-runs/RestoreRail";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import {
  useProjectDomain,
  useProjectMarket,
} from "@/client/hooks/useProjectDomain";
import { useAhrefsDomainRatings } from "@/client/features/backlinks/useAhrefsDomainRatings";
import { TargetAreaBanner } from "@/client/features/geo/TargetAreaBanner";
import { ProjectProfileCard } from "@/client/features/profiles/ProjectProfileCard";
import { useTargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import { useProjectSuggestions } from "@/client/features/insights/useProjectSuggestions";
import { resolvePrefill } from "@/client/features/insights/resolvePrefill";
import {
  useHandoff,
  writeHandoff,
} from "@/client/features/insights/handoffStore";
import { KeywordResearchSearchBar } from "./KeywordResearchSearchBar";
import type { KeywordResearchControllerState } from "./types";
import { AppPageShell } from "@/client/components/AppPageShell";
import { Button } from "@cloudflare/kumo/components/button";

type Props = Omit<KeywordResearchControllerInput, "onFormSubmit">;
type KeywordSearchTab = SearchTab & { input: KeywordSearchTabInput };

function isKeywordSearchTab(tab: SearchTab): tab is KeywordSearchTab {
  return tab.input.type === "keyword";
}

export function KeywordResearchPage(input: Props) {
  const setSearchParams = useKeywordSearchParams();
  const projectId = input.projectId;
  // This tab's scope state. Unlike the other five geo-aware tabs, the picker
  // it drives lives INSIDE the search form (KeywordResearchSearchBar) rather
  // than in this header: a country-only control sitting next to the Search
  // button, with the metro-capable one in the header, meant a DFW project
  // read as un-targetable. Still passed as the controller's own 2nd
  // argument, not folded into `controllerInput`, so it reaches
  // resolveRunGeo() without changing `Props`' shape.
  const market = useProjectMarket(projectId);
  const targetAreaScope = useTargetAreaScope(projectId, market.locationCode);

  const navigateToKeywordInput = useCallback(
    (tabInput: KeywordSearchTabInput | null) => {
      if (!tabInput) {
        setSearchParams({
          q: undefined,
          loc: undefined,
          kLimit: undefined,
          mode: undefined,
          cs: undefined,
        });
        return;
      }

      setSearchParams({
        q: tabInput.keyword,
        loc:
          tabInput.locationCode === DEFAULT_LOCATION_CODE
            ? undefined
            : tabInput.locationCode,
        kLimit: tabInput.resultLimit === 150 ? undefined : tabInput.resultLimit,
        mode: tabInput.mode === "auto" ? undefined : tabInput.mode,
        cs: tabInput.clickstream ? true : undefined,
      });
    },
    [setSearchParams],
  );

  const urlInput = useMemo<KeywordSearchTabInput | null>(() => {
    const keywords = parseKeywordInput(input.keywordInput);
    const keyword = keywords[0];
    if (!keyword) return null;
    return {
      type: "keyword",
      keyword,
      locationCode: input.locationCode,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
    };
  }, [
    input.clickstream,
    input.keywordInput,
    input.keywordMode,
    input.locationCode,
    input.resultLimit,
  ]);
  const searchTabs = useSearchTabNavigation({
    storageKey: `keyword:${projectId}`,
    urlInput,
    getLabel: useCallback(
      (tabInput) => (tabInput.type === "keyword" ? tabInput.keyword : ""),
      [],
    ),
    navigateToInput: useCallback(
      (tabInput) => {
        navigateToKeywordInput(tabInput?.type === "keyword" ? tabInput : null);
      },
      [navigateToKeywordInput],
    ),
  });

  const activeTab = useMemo<KeywordSearchTab | null>(() => {
    if (!urlInput) return null;
    const tab = searchTabs.tabs.find(
      (candidate) => candidate.id === searchTabs.activeTabId,
    );
    return tab && isKeywordSearchTab(tab) ? tab : null;
  }, [searchTabs.activeTabId, searchTabs.tabs, urlInput]);

  const onFormSubmit = useCallback(
    (value: KeywordControlsValues) => {
      const keywords = parseKeywordInput(value.keyword);
      if (keywords.length === 0) return;

      const inputs: KeywordSearchTabInput[] = keywords.map((keyword) => ({
        type: "keyword",
        keyword,
        locationCode: value.locationCode,
        resultLimit: value.resultLimit,
        mode: value.mode,
        clickstream: value.clickstream,
      }));

      let activeInput: KeywordSearchTabInput | null = null;
      for (const tabInput of inputs) {
        const result = searchTabs.openTab(tabInput);
        if (result.tab?.input.type === "keyword") {
          activeInput = result.tab.input;
        }
      }
      if (activeInput) {
        navigateToKeywordInput(activeInput);
        // Hands the active (last-opened) keyword to whichever tab the user
        // opens next -- the same cross-tab channel SERP Overview and Content
        // Optimizer already write to.
        writeHandoff(projectId, {
          kind: "keyword",
          value: activeInput.keyword,
          locationCode: activeInput.locationCode,
          source: "Keyword Research",
          at: Date.now(),
        });
      }
    },
    [navigateToKeywordInput, projectId, searchTabs],
  );
  const showRecentSearches = useCallback(() => {
    searchTabs.setActiveTab(null);
    navigateToKeywordInput(null);
  }, [navigateToKeywordInput, searchTabs]);
  const getOpenKeywordTabs = useCallback(
    () =>
      searchTabs.tabs.flatMap((tab) =>
        tab.input.type === "keyword"
          ? [
              {
                keyword: tab.input.keyword,
                locationCode: tab.input.locationCode,
                resultLimit: tab.input.resultLimit,
                mode: tab.input.mode,
                clickstream: tab.input.clickstream,
              },
            ]
          : [],
      ),
    [searchTabs.tabs],
  );

  const controllerInput = useMemo<Props>(
    () =>
      activeTab
        ? {
            ...input,
            keywordInput: activeTab.input.keyword,
            locationCode: activeTab.input.locationCode,
            hasExplicitLocationCode: true,
            resultLimit: activeTab.input.resultLimit,
            keywordMode: activeTab.input.mode,
            clickstream: activeTab.input.clickstream,
            getOpenKeywordTabs,
            keywordTabsLimit: searchTabs.limit,
          }
        : {
            ...input,
            getOpenKeywordTabs,
            keywordTabsLimit: searchTabs.limit,
          },
    [activeTab, getOpenKeywordTabs, input, searchTabs.limit],
  );
  const controller = useKeywordResearchController(
    { ...controllerInput, onFormSubmit },
    targetAreaScope.area,
  );
  useEffect(() => {
    controller.controlsForm.setErrorMap({ onSubmit: undefined });
    controller.controlsForm.setFieldMeta("keyword", (meta) => ({
      ...meta,
      errorMap: {
        ...meta.errorMap,
        onSubmit: undefined,
      },
      errorSourceMap: {
        ...meta.errorSourceMap,
        onSubmit: undefined,
      },
    }));
  }, [controller.controlsForm, searchTabs.tabs]);

  const suggestions = useProjectSuggestions(projectId, "high-volume");
  const handoff = useHandoff(projectId);
  // Ahrefs' free, keyless DR lookup (same source SERP Overview already
  // reads) -- not a metered call, so fetching just this project's own domain
  // costs nothing and needs no authorization gate.
  const projectDomain = useProjectDomain(projectId);
  const { ratings: ownDomainRatings, loadRatings: loadOwnDomainRating } =
    useAhrefsDomainRatings(projectId);
  useEffect(() => {
    if (projectDomain) void loadOwnDomainRating([projectDomain]);
  }, [projectDomain, loadOwnDomainRating]);
  const ownDomainRating =
    projectDomain && ownDomainRatings
      ? (ownDomainRatings[projectDomain] ?? null)
      : null;
  // Unlike SERP/Content, a stored keyword-research run's `resultJson` (rows,
  // source, diagnostics) carries no keyword field of its own -- the seed
  // keyword only exists as the analysis run's `label` column (research.ts:
  // `label: uniqueKeywords.join(", ")`). `controller.restoredRun` already
  // surfaces that label for the "Run again" button below, so it doubles as
  // this tab's last-run signal instead of a `useLastRunInput` call that could
  // never find a keyword inside the JSON to extract.
  const lastRun = controller.restoredRun?.label ?? null;

  // The live form value, read here (not just inside the search bar) because
  // the prefill effect below needs to know whether the field is still empty
  // and whether the user has already touched it -- `isDirty` is TanStack
  // Form's own per-field "changed since the last reset" flag.
  const currentKeyword = useStore(
    controller.controlsForm.store,
    (state) => state.values.keyword,
  );
  const keywordIsDirty = useStore(
    controller.controlsForm.store,
    (state) => state.fieldMeta.keyword?.isDirty ?? false,
  );

  // The URL param wins, then a keyword carried from another tab, then what
  // this tab last ran, then the high-volume ranking. Resolved only for the
  // field's initial value -- after that the user owns the input.
  const prefill = resolvePrefill({
    kind: "keyword",
    searchParam: input.keywordInput,
    handoff,
    lastRun,
    suggestions,
    projectDefault: null,
  });

  // Every prefill source above resolves after first paint, so the form's
  // `defaultValues` can never see it. Seed the field once a value lands, but
  // never fight the user: bail as soon as they've typed or picked a chip
  // (keywordIsDirty), and even before that, bail if the field is non-empty (a
  // `q` param already won, or a search tab is active). `dontUpdateMeta` keeps
  // this programmatic fill from masquerading as the user's own edit -- only a
  // real keystroke or chip click should flip `isDirty`.
  useEffect(() => {
    if (keywordIsDirty) return;
    if (currentKeyword.trim() !== "") return;
    if (prefill.value === "") return;
    controller.controlsForm.setFieldValue("keyword", prefill.value, {
      dontUpdateMeta: true,
    });
  }, [keywordIsDirty, currentKeyword, prefill.value, controller.controlsForm]);

  return (
    <AppPageShell>
      <div>
        <h1 className="text-2xl font-semibold">Keyword Research</h1>
        <p className="text-sm text-base-content/70">
          Discover keyword ideas, search demand, and ranking opportunities.
        </p>
      </div>

      <TargetAreaBanner projectId={projectId} />

      <ProjectProfileCard projectId={projectId} />

      <KeywordResearchSearchBar
        controller={controller}
        suggestions={suggestions}
        scope={targetAreaScope}
        projectCountryCode={market.locationCode}
        projectId={projectId}
      />

      <RestoreRail
        projectId={projectId}
        feature={RUN_FEATURES.keywordResearch}
        selectedRunId={controller.selectedRunId}
        onSelectRun={controller.setSelectedRunId}
        idle={!controller.hasSearched || controller.restoredRun != null}
        restoredRun={controller.restoredRun}
        onRunAgain={() => {
          if (!controller.restoredRun) return;
          controller.controlsForm.setFieldValue(
            "keyword",
            controller.restoredRun.label,
          );
          void controller.controlsForm.handleSubmit();
        }}
      />

      {controller.hasSearched ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            data-testid="keyword-research-recent-searches"
            variant="ghost"
            size="sm"
            className="w-fit px-0 text-base-content/70 hover:bg-transparent"
            onClick={showRecentSearches}
          >
            <ArrowLeft className="size-4" />
            Recent searches
          </Button>
          <SearchTabStrip
            projectId={projectId}
            tabs={searchTabs.tabs}
            activeTabId={searchTabs.activeTabId}
            onSelect={searchTabs.selectTab}
            onClose={searchTabs.closeTab}
            onViewed={searchTabs.markTabViewed}
          />
        </div>
      ) : null}
      <KeywordResearchContent
        controller={controller}
        projectId={input.projectId}
        ownDomainRating={ownDomainRating}
        onSearchCountry={(keyword, countryCode) => {
          // Re-run THE RESULT'S keyword, not whatever the textarea happens to
          // hold. A restored run leaves the form empty, so submitting the
          // draft failed validation and the button did nothing; a user who had
          // started typing a new search would instead have spent a metered
          // request on that draft under a button describing the old one.
          controller.controlsForm.setFieldValue("keyword", keyword);
          // And re-run it against the country the button NAMES -- the parent
          // of the area being abandoned -- not the project's own country.
          // Those differ whenever the two disagree (a UK project scoped to
          // Dallas), and resetting to the project country there would charge
          // for the UK under a button reading "Search United States instead".
          controller.controlsForm.setFieldValue("locationCode", countryCode);
          // Both halves at once, exactly as the picker's own Clear does:
          // dropping the area alone would leave the country control still
          // pointing at whatever the area implied (see resolveRunGeo.ts).
          targetAreaScope.onClear();
          void controller.controlsForm.handleSubmit();
        }}
      />
      <KeywordSaveDialog controller={controller} />
    </AppPageShell>
  );
}

function KeywordResearchContent({
  controller,
  projectId,
  ownDomainRating,
  onSearchCountry,
}: {
  controller: KeywordResearchControllerState;
  projectId: string;
  ownDomainRating: number | null;
  onSearchCountry: (keyword: string, countryCode: number) => void;
}) {
  if (controller.isLoading) {
    return <KeywordResearchLoadingState />;
  }

  if (controller.researchError) {
    const isCreditsError =
      getErrorCode(controller.researchMutationError) === "INSUFFICIENT_CREDITS";

    return (
      <div className="flex-1 flex items-center justify-center pt-1">
        <div className="w-full max-w-xl rounded-xl border border-error/30 bg-error/10 p-5 text-error space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="text-sm">{controller.researchError}</p>
          </div>
          {isCreditsError ? (
            <Link to={BILLING_ROUTE} className="btn btn-sm">
              Go to Billing
            </Link>
          ) : (
            <Button size="sm" onClick={controller.retrySearch}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (controller.rows.length === 0) {
    return (
      <KeywordResearchEmptyState
        controller={controller}
        projectId={projectId}
      />
    );
  }

  // Rows came back carrying no figures at all — the seed echoed by Google Ads
  // with everything null, which used to render as a table of dashes. Say what
  // happened instead, and offer the geography that would actually answer it.
  const usability = resolveKeywordResultUsability(
    controller.rows,
    controller.searchedKeyword,
  );
  if (usability.kind === "no-metrics") {
    return (
      <KeywordResearchNoMetricsState
        controller={controller}
        rowCount={usability.rowCount}
        onSearchCountry={onSearchCountry}
      />
    );
  }

  return (
    <KeywordResearchResults
      projectId={projectId}
      controller={controller}
      ownDomainRating={ownDomainRating}
    />
  );
}
