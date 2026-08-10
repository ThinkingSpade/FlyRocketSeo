import { useEffect, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { TablePagination } from "@/client/components/table/TablePagination";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  DEFAULT_COMPETITORS_PAGE_SIZE,
  DEFAULT_KEYWORD_GAP_PAGE_SIZE,
  DEFAULT_LINK_GAP_PAGE_SIZE,
  competitorsPageSchema,
  keywordGapModes,
  type CompetitorRow,
  type CompetitorsTab,
  type KeywordGapMode,
} from "@/types/schemas/competitors";
import { AnalyzeDomainPrompt } from "@/client/components/AnalyzeDomainPrompt";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import { CompetitorsSearchForm } from "./CompetitorsSearchForm";
import { TabBody } from "./CompetitorsTabBody";
import { CompetitorsPageHeader } from "./CompetitorsPageHeader";
import { CompetitorsDiscoveryNotice } from "./CompetitorsDiscoveryNotice";
import { CompetitorsOverviewExtras } from "./CompetitorsOverviewExtras";
import { CompetitorsRestoreNotice } from "./CompetitorsRestoreNotice";
import { CompetitorsRestoredRunBanner } from "./CompetitorsRestoredRunBanner";
import { KeywordGapOverview } from "./KeywordGapOverview";
import {
  useCompetitorsQuery,
  useCompetitorsRun,
  useCompetitorsTargetPrefill,
  useKeywordGapQuery,
  useLinkGapQuery,
} from "./useCompetitorsQueries";
import { buildCompetitorsAuthorizationKey } from "./competitorsAuthorization";
import { shouldAdoptRestoredRun } from "./shouldAdoptRestoredRun";
import { resolveRestoreNotice } from "./resolveRestoreNotice";
import { pickDiscoveryDisclosure } from "./pickDiscoveryDisclosure";
import { writeHandoff } from "@/client/features/insights/handoffStore";
import {
  COMPETITORS_ANALYZE_PREVIEW,
  COMPETITORS_TABS,
  GAP_MODE_LABELS,
  TAB_PAGE_SIZES,
} from "./competitorsPageContent";
import { AppPageShell } from "@/client/components/AppPageShell";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Banner } from "@cloudflare/kumo/components/banner";

/** Derived from a module constant, so it is built once rather than per render. */
const COMPETITORS_TAB_ITEMS = COMPETITORS_TABS.map(({ tab, label }) => ({
  value: tab,
  label,
}));

/**
 * The restored run and the rows to show, once "is this safe to show" has
 * been decided -- pulled out of `CompetitorsPage` (alongside
 * `CompetitorsRestoreNotice`) to keep that component under this repo's
 * line-count lint cap. `restored` is only ever adopted when there is no
 * live answer yet AND `shouldAdoptRestoredRun` agrees, so `restoredRun` and
 * `competitorRows` always move together.
 */
function pickAdoptedRestore<
  Restored extends { label: string; result: { rows: CompetitorRow[] } },
>(
  liveRows: CompetitorRow[] | undefined,
  restored: Restored | null,
  target: string,
): { restoredRun: Restored | null; competitorRows: CompetitorRow[] } {
  const adoptable =
    liveRows == null &&
    shouldAdoptRestoredRun({ target, restoredLabel: restored?.label ?? null });
  const restoredRun = adoptable ? restored : null;
  return {
    restoredRun,
    competitorRows: liveRows ?? restoredRun?.result.rows ?? [],
  };
}

type CompetitorsSearchState = {
  target: string;
  competitor: string;
  tab: CompetitorsTab;
  mode: KeywordGapMode;
  page: number;
};

type CompetitorsNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

export function CompetitorsPage({
  projectId,
  navigate,
  searchState,
}: {
  projectId: string;
  navigate: CompetitorsNavigate;
  searchState: CompetitorsSearchState;
}) {
  const { target, competitor, tab, mode, page } = searchState;
  const [targetInput, setTargetInput] = useState(target);
  const [competitorInput, setCompetitorInput] = useState(competitor);
  // `useCompetitorsRun` captures the project's market into state at the
  // moment a run is authorized rather than reading it live -- see its own
  // doc comment for why that matters for billing safety.
  const run = useCompetitorsRun(
    projectId,
    buildCompetitorsAuthorizationKey(projectId, searchState),
  );
  const { authorized, market } = run;
  // Keep inputs in sync when the URL changes (e.g. via a table row action).
  useEffect(() => setTargetInput(target), [target]);
  useEffect(() => setCompetitorInput(competitor), [competitor]);
  const projectDomain = useProjectDomain(projectId);
  // Restoring reads a stored row plus the R2 object that run already paid
  // for and can never trigger a metered fetch, so it runs whenever this tab
  // has no live result -- not only when the target box is empty, which was
  // almost never true (the target input is prefilled from the project
  // domain) and forced a paid click on every visit. Declared before
  // `useCompetitorsTargetPrefill` so its `label` can feed that hook's
  // last-run prefill tier.
  //
  // Only the competitor list restores. Keyword gap and link gap need a chosen
  // competitor and are separately metered, so they stay on demand.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored, outcome, expired } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.competitors,
    schema: competitorsPageSchema,
    enabled: tab === "competitors",
    runId: selectedRunId,
  });
  useCompetitorsTargetPrefill({
    projectId,
    target,
    targetInput,
    setTargetInput,
    projectDomain,
    lastRun: restored?.label ?? null,
  });

  const updateSearch = (update: Partial<CompetitorsSearchState>) => {
    navigate({
      search: (previous) => ({ ...previous, ...update }),
      replace: false,
    });
  };

  const competitorsQuery = useCompetitorsQuery({
    projectId,
    target,
    page: tab === "competitors" ? page : 1,
    pageSize: DEFAULT_COMPETITORS_PAGE_SIZE,
    locationCode: market.locationCode,
    languageCode: market.languageCode,
    enabled: tab === "competitors",
    authorized,
    runNonce: run.runNonce,
  });
  const { restoredRun, competitorRows } = pickAdoptedRestore(
    competitorsQuery.data?.rows,
    restored,
    target,
  );
  const { discoveryMode, seedSize, hiddenCount, hasResult } =
    pickDiscoveryDisclosure(competitorsQuery.data, restoredRun);
  const restoreNotice = resolveRestoreNotice({
    target,
    hasLiveResult: competitorsQuery.data != null,
    outcome,
    expiredLabel: expired?.label ?? null,
  });
  const gapQuery = useKeywordGapQuery({
    projectId,
    target,
    competitor,
    mode,
    page: tab === "gap" ? page : 1,
    pageSize: DEFAULT_KEYWORD_GAP_PAGE_SIZE,
    locationCode: market.locationCode,
    languageCode: market.languageCode,
    enabled: tab === "gap",
    authorized,
    runNonce: run.runNonce,
  });
  const linkGapQuery = useLinkGapQuery({
    projectId,
    target,
    competitor,
    page: tab === "links" ? page : 1,
    pageSize: DEFAULT_LINK_GAP_PAGE_SIZE,
    enabled: tab === "links",
    authorized,
    runNonce: run.runNonce,
  });

  const tabQueries: Record<
    CompetitorsTab,
    UseQueryResult<{
      rows: unknown[];
      totalCount: number | null;
      fetchedAt: string;
    }>
  > = {
    competitors: competitorsQuery,
    gap: gapQuery,
    links: linkGapQuery,
  };
  const activeQuery = tabQueries[tab];
  const errorMessage = activeQuery.isError
    ? getStandardErrorMessage(activeQuery.error)
    : null;

  const needsCompetitor = tab === "gap" || tab === "links";
  const pageSize = TAB_PAGE_SIZES[tab];
  const rowsOnPage = activeQuery.data?.rows.length ?? 0;
  const totalCount = activeQuery.data?.totalCount ?? null;

  return (
    <AppPageShell>
      <CompetitorsPageHeader
        fetchedAt={activeQuery.data?.fetchedAt}
        onRefresh={() => run.authorize()}
        refreshing={activeQuery.isFetching && !activeQuery.isPending}
      />

      <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
        <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
          <CompetitorsSearchForm
            targetInput={targetInput}
            competitorInput={competitorInput}
            needsCompetitor={needsCompetitor}
            isFetching={activeQuery.isFetching}
            onTargetChange={setTargetInput}
            onCompetitorChange={setCompetitorInput}
            onSubmit={() => {
              const nextTarget = targetInput.trim();
              if (!nextTarget) return;
              const nextCompetitor = competitorInput.trim();
              const nextPage =
                nextTarget === target && nextCompetitor === competitor
                  ? page
                  : 1;
              // A competitors run just happened for this target -- the next
              // tab opened should inherit it.
              writeHandoff(projectId, {
                kind: "domain",
                value: nextTarget,
                source: "Competitors",
                at: Date.now(),
              });
              run.authorize(
                buildCompetitorsAuthorizationKey(projectId, {
                  ...searchState,
                  target: nextTarget,
                  competitor: nextCompetitor,
                  page: nextPage,
                }),
              );
              updateSearch({
                target: nextTarget,
                competitor: nextCompetitor,
                page: nextPage,
              });
            }}
          />

          {tab === "gap" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-base-content/60">Show</span>
              <SegmentedToggle
                showLabels
                items={keywordGapModes.map((gapMode) => ({
                  value: gapMode,
                  label: GAP_MODE_LABELS[gapMode],
                }))}
                value={mode}
                onChange={(nextMode) =>
                  updateSearch({ mode: nextMode, page: 1 })
                }
              />
            </div>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <Banner variant="error" className="text-sm">
          {errorMessage}
        </Banner>
      ) : null}

      {!target && tab === "competitors" ? (
        <RecentRunsList
          projectId={projectId}
          feature={RUN_FEATURES.competitors}
          activeRunId={selectedRunId}
          onSelect={setSelectedRunId}
        />
      ) : null}

      {tab === "competitors" ? (
        <>
          <CompetitorsRestoredRunBanner
            restoredRun={restoredRun}
            projectId={projectId}
            searchState={searchState}
            authorize={run.authorize}
            updateSearch={updateSearch}
            setTargetInput={setTargetInput}
          />
          <CompetitorsRestoreNotice notice={restoreNotice} expired={expired} />
        </>
      ) : null}

      {!target && !restoredRun && !restoreNotice ? (
        <AnalyzeDomainPrompt
          domain={projectDomain}
          title="See who you're up against"
          description="Find the domains competing for this project's keywords, then compare head-to-head."
          preview={COMPETITORS_ANALYZE_PREVIEW}
          onAnalyze={() => {
            if (!projectDomain) return;
            setTargetInput(projectDomain);
            writeHandoff(projectId, {
              kind: "domain",
              value: projectDomain,
              source: "Competitors",
              at: Date.now(),
            });
            run.authorize(
              buildCompetitorsAuthorizationKey(projectId, {
                ...searchState,
                target: projectDomain,
                page: 1,
              }),
            );
            updateSearch({ target: projectDomain, page: 1 });
          }}
          isBusy={competitorsQuery.isFetching}
        />
      ) : null}

      {tab === "competitors" && hasResult ? (
        <CompetitorsDiscoveryNotice
          projectId={projectId}
          discoveryMode={discoveryMode}
          seedSize={seedSize}
          hiddenCount={hiddenCount}
        />
      ) : null}

      {tab === "competitors" && target ? (
        <CompetitorsOverviewExtras
          projectId={projectId}
          target={target}
          rows={competitorRows}
        />
      ) : null}

      {tab === "gap" && target && competitor ? (
        <KeywordGapOverview
          projectId={projectId}
          target={target}
          competitor={competitor}
          pageSize={DEFAULT_KEYWORD_GAP_PAGE_SIZE}
          activeMode={mode}
          locationCode={market.locationCode}
          languageCode={market.languageCode}
          authorized={authorized}
          runNonce={run.runNonce}
          onModeChange={(nextMode) => updateSearch({ mode: nextMode, page: 1 })}
        />
      ) : null}

      <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
        <div className="border-b border-base-300 px-4 py-3">
          <Tabs
            variant="segmented"
            value={tab}
            onValueChange={(next) => {
              // Kumo hands back a plain string; resolve it against the source
              // list to recover CompetitorsTab without an assertion, and drop
              // anything that is not ours rather than trusting it.
              const selected = COMPETITORS_TABS.find((t) => t.tab === next);
              if (selected) updateSearch({ tab: selected.tab, page: 1 });
            }}
            tabs={COMPETITORS_TAB_ITEMS}
          />
        </div>

        <TabBody
          tab={tab}
          projectId={projectId}
          target={target}
          competitor={competitor}
          competitorRows={competitorRows}
          discoveryMode={discoveryMode}
          seedSize={seedSize}
          competitorsState={{
            isError: competitorsQuery.isError,
            isFetching: competitorsQuery.isFetching,
            // A restored past run is a real answer too, even though no live
            // query ran for it -- but only an ADOPTED one (see
            // `pickAdoptedRestore`), which is exactly what `hasResult` (from
            // `pickDiscoveryDisclosure`) means.
            hasResult,
          }}
          gapQuery={gapQuery}
          linkGapQuery={linkGapQuery}
          onCompareCompetitor={(domain) => {
            run.authorize(
              buildCompetitorsAuthorizationKey(projectId, {
                ...searchState,
                competitor: domain,
                tab: "gap",
                mode: "missing",
                page: 1,
              }),
            );
            updateSearch({
              tab: "gap",
              competitor: domain,
              mode: "missing",
              page: 1,
            });
          }}
        />

        {rowsOnPage > 0 || page > 1 ? (
          <TablePagination
            page={page}
            pageSize={pageSize}
            pageSizes={[pageSize]}
            totalCount={totalCount}
            hasNextPage={rowsOnPage === pageSize}
            isLoading={activeQuery.isFetching}
            onPageChange={(nextPage) => updateSearch({ page: nextPage })}
            onPageSizeChange={() => {}}
          />
        ) : null}
      </div>
    </AppPageShell>
  );
}
