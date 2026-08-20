import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  CircleNotch,
  UserMinus,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { getDomainKeywordSuggestions } from "@/serverFunctions/domain";
import { addTrackingKeywords } from "@/serverFunctions/rank-tracking";
import { isLabsLocationCode } from "@/client/features/keywords/locations";
import {
  useKeywordFit,
  useProjectProfile,
} from "@/client/features/profiles/useProjectProfile";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  AppDataTable,
  makeSelectionColumn,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import {
  suggestionColumns,
  type SuggestedKeyword,
} from "./keywordSuggestionColumns";
import {
  applyShiftRangeSelection,
  type SelectionAnchor,
} from "@/client/components/table/tableSelection";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { pickPreSelectedSuggestions } from "./suggestionPreSelection";
import { Button } from "@cloudflare/kumo/components/button";

const PRE_SELECT_COUNT = 20;

type Props = {
  configId: string;
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  onDone: (configId: string) => void;
  onClose: () => void;
};

export function KeywordSuggestionStep({
  configId,
  projectId,
  domain,
  locationCode,
  languageCode,
  onDone,
  onClose,
}: Props) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [hasInitialized, setHasInitialized] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "traffic", desc: true },
  ]);
  const selectAnchorRef = useRef<SelectionAnchor | null>(null);

  // Ranked-keyword suggestions are Labs-backed; countries served from Google
  // Ads keyword data (e.g. Iceland) have no ranking data to suggest from.
  const labsSupported = isLabsLocationCode(locationCode);
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, domain, locationCode, languageCode),
  );
  const suggestionsQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    queryKey: [
      "domainKeywordSuggestions",
      projectId,
      domain,
      locationCode,
      languageCode,
    ],
    queryFn: () =>
      getDomainKeywordSuggestions({
        data: { projectId, domain, locationCode, languageCode },
      }),
    enabled: labsSupported,
  });

  const data = suggestionsQuery.data ?? [];

  // Free, client-side, over rows this step already fetched -- see
  // useProjectProfile. Nothing here is metered, so a verdict costs nothing
  // even though what it guards (a RECURRING rank check) does.
  const { profile, isLoading: profileLoading } = useProjectProfile(projectId);
  const suggestedKeywords = useMemo(
    () => (suggestionsQuery.data ?? []).map((item) => item.keyword),
    [suggestionsQuery.data],
  );
  const fit = useKeywordFit(profile, suggestedKeywords);

  const columns = useMemo<ColumnDef<SuggestedKeyword>[]>(
    () => [
      makeSelectionColumn<SuggestedKeyword>(selectAnchorRef),
      ...suggestionColumns(fit),
    ],
    [fit],
  );

  const [wrongFitSkipped, setWrongFitSkipped] = useState(0);

  // Pre-select the top rows by traffic, minus anything the profile rules out.
  // What gets ticked here is what gets BILLED, on a schedule: traffic alone
  // pre-selected "<trade> salary" for a tradesman and re-checked it forever.
  useEffect(() => {
    const items = suggestionsQuery.data;
    if (!items || items.length === 0 || hasInitialized) return;
    // Waits for the profile read to settle first. The suggestions call is
    // metered and slow, but it can still land first on a warm cache, and
    // initializing then would tick rows against an empty verdict map and
    // never revisit them -- the exact bug this pass exists to remove.
    if (profileLoading) return;
    const preSelection = pickPreSelectedSuggestions(
      items,
      fit,
      PRE_SELECT_COUNT,
    );
    setRowSelection(preSelection.selection);
    setWrongFitSkipped(preSelection.wrongFitCount);
    setHasInitialized(true);
  }, [suggestionsQuery.data, hasInitialized, fit, profileLoading]);

  const table = useAppTable({
    data,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    withSorting: true,
    enableRowSelection: true,
  });

  const selectedCount = Object.keys(rowSelection).filter(
    (k) => rowSelection[k],
  ).length;

  const addMutation = useMutation({
    mutationFn: (keywords: string[]) =>
      addTrackingKeywords({ data: { projectId, configId, keywords } }),
    onSuccess: (result) => {
      toast.success(`Added ${result.added} keywords for tracking`);
      onDone(configId);
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Failed to add keywords"));
    },
  });

  const handleAdd = () => {
    const selectedKeywords = table
      .getSelectedRowModel()
      .rows.map((row) => row.original.keyword);
    if (selectedKeywords.length > 0) {
      addMutation.mutate(selectedKeywords);
    }
  };

  const sectionHeader = (title: string) => (
    <div className="flex items-center justify-between">
      <h2 id="keyword-suggestions-title" className="text-lg font-semibold">
        {title}
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
  );

  if (!labsSupported) {
    return (
      <>
        {sectionHeader("Add keywords manually")}
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-xs text-base-content/50">
            Ranked-keyword suggestions aren't available for this country.
            Continue and add the keywords you want to track manually.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-2"
            onClick={onClose}
          >
            Continue
          </Button>
        </div>
      </>
    );
  }

  if (!run.authorized) {
    return (
      <>
        {sectionHeader("Find keywords to track")}
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-base-content/60">
            Find keywords that {domain} already ranks for.
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => run.authorize()}
          >
            Find keywords for {domain}
          </Button>
        </div>
      </>
    );
  }

  // Loading state
  if (suggestionsQuery.isLoading) {
    return (
      <>
        {sectionHeader("Finding your top keywords...")}
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <CircleNotch className="size-8 animate-spin text-primary" />
          <p className="text-xs text-base-content/50">
            This usually takes a few seconds
          </p>
        </div>
      </>
    );
  }

  // Error state
  if (suggestionsQuery.isError) {
    return (
      <>
        {sectionHeader("Couldn't fetch keywords")}
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <WarningCircle className="size-8 text-error" />
          <p className="text-xs text-base-content/50">
            You can skip this step and add keywords manually later.
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="primary" size="sm" onClick={onClose}>
              Skip
            </Button>
          </div>
        </div>
      </>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <>
        {sectionHeader("No rankings found")}
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-xs text-base-content/50">
            We couldn't find any keywords {domain} currently ranks for. You can
            add keywords manually.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-2"
            onClick={onClose}
          >
            Skip
          </Button>
        </div>
      </>
    );
  }

  // Data loaded
  return (
    <div className="flex flex-col gap-3">
      {sectionHeader("Choose keywords to track")}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm text-base-content/60">
          We found {data.length} keywords {domain} ranks for.
        </p>
        {wrongFitSkipped > 0 ? (
          // Said out loud rather than left as silently-unticked rows: the
          // user is about to authorize a repeating charge and is entitled to
          // know what we left out of it, and why.
          <p className="flex items-center gap-1.5 text-sm text-base-content/60">
            <UserMinus className="size-3.5 shrink-0 text-base-content/40" />
            {wrongFitSkipped} look{wrongFitSkipped === 1 ? "s" : ""} aimed at a
            different customer, so{" "}
            {wrongFitSkipped === 1 ? "it is" : "they are"} left unticked — tick{" "}
            {wrongFitSkipped === 1 ? "it" : "them"} if you want{" "}
            {wrongFitSkipped === 1 ? "it" : "them"} tracked.
          </p>
        ) : null}
      </div>

      <AppDataTable
        table={table}
        className="w-full"
        wrapperClassName="overflow-y-auto max-h-[400px] border border-base-300 rounded-lg"
        stickyHeader
        getRowProps={(row) => ({
          className: "hover:bg-base-200/50 cursor-pointer",
          onClick: (event) => {
            if (applyShiftRangeSelection(event, row, table, selectAnchorRef)) {
              return;
            }

            row.toggleSelected();
          },
        })}
      />

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-base-content/60">
          {selectedCount} of {data.length} selected
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Skip
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleAdd}
            disabled={addMutation.isPending || selectedCount === 0}
          >
            {addMutation.isPending && (
              <CircleNotch className="size-3.5 animate-spin" />
            )}
            Save Keyword{selectedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
