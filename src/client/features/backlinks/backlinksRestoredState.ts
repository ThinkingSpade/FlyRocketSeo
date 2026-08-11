export type BacklinksRestoredRefreshPhase =
  | "idle"
  | "loading"
  | "failed"
  | "succeeded";

export type BacklinksRestoredResultsPresentation =
  | { kind: "loaded" }
  | {
      kind: "empty";
      title: "Individual links aren't loaded";
      description: string;
      actionLabel: "Refresh & load links" | "Try again" | null;
      actionLoading: boolean;
      errorMessage: string | null;
    };

const RESTORED_RESULTS_TITLE = "Individual links aren't loaded" as const;
const RESTORED_RESULTS_DESCRIPTION =
  "This saved run kept the summary. Loading individual links starts a fresh lookup.";

export function hasBacklinksTarget(target: string): boolean {
  return target.trim() !== "";
}

export function resolveBacklinksRestoredResults({
  phase,
  storedTarget,
  canOpenTab,
}: {
  phase: BacklinksRestoredRefreshPhase;
  storedTarget: string;
  canOpenTab: boolean;
}): BacklinksRestoredResultsPresentation {
  if (phase === "succeeded") return { kind: "loaded" };

  if (phase === "loading") {
    return {
      kind: "empty",
      title: RESTORED_RESULTS_TITLE,
      description: RESTORED_RESULTS_DESCRIPTION,
      actionLabel: "Refresh & load links",
      actionLoading: true,
      errorMessage: null,
    };
  }

  if (phase === "failed") {
    return {
      kind: "empty",
      title: RESTORED_RESULTS_TITLE,
      description: RESTORED_RESULTS_DESCRIPTION,
      actionLabel: "Try again",
      actionLoading: false,
      errorMessage:
        "Individual links couldn't be loaded. The saved summary is still available.",
    };
  }

  if (!hasBacklinksTarget(storedTarget)) {
    return {
      kind: "empty",
      title: RESTORED_RESULTS_TITLE,
      description: "This saved run can't load its links. Enter a target above.",
      actionLabel: null,
      actionLoading: false,
      errorMessage: null,
    };
  }

  if (!canOpenTab) {
    return {
      kind: "empty",
      title: RESTORED_RESULTS_TITLE,
      description: "Close a tab to load these links.",
      actionLabel: null,
      actionLoading: false,
      errorMessage: null,
    };
  }

  return {
    kind: "empty",
    title: RESTORED_RESULTS_TITLE,
    description: RESTORED_RESULTS_DESCRIPTION,
    actionLabel: "Refresh & load links",
    actionLoading: false,
    errorMessage: null,
  };
}

export function advanceBacklinksRestoredRefresh({
  phase,
  expectedRunNonce,
  currentRunNonce,
  rowsSucceeded,
  rowsFailed,
}: {
  phase: Exclude<BacklinksRestoredRefreshPhase, "idle">;
  expectedRunNonce: number;
  currentRunNonce: number;
  rowsSucceeded: boolean;
  rowsFailed: boolean;
}): Exclude<BacklinksRestoredRefreshPhase, "idle"> {
  if (phase !== "loading" || expectedRunNonce !== currentRunNonce) {
    return phase;
  }
  if (rowsSucceeded) return "succeeded";
  if (rowsFailed) return "failed";
  return phase;
}
