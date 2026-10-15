type HarvestResult = {
  matched: number;
  harvestedDates: string[];
  skippedDates: string[];
  failedDates: string[];
  /** True when the project has nothing to match a day's file against. */
  noVocabulary?: boolean;
};

type HarvestResultNotice = {
  kind: "error" | "info" | "success";
  message: string;
};

/** Keep a permanent feed skip visibly distinct from a completed harvest. */
export function describeHarvestResult(
  result: HarvestResult,
): HarvestResultNotice[] {
  const notices: HarvestResultNotice[] = [];

  // Checked first and alone: with no vocabulary nothing was attempted, so
  // "already up to date" below would be a false all-clear.
  if (result.noVocabulary) {
    return [
      {
        kind: "info",
        message:
          "Nothing to match yet — this project needs a business profile or tracked keywords first.",
      },
    ];
  }

  if (result.failedDates.length > 0) {
    notices.push({
      kind: "error",
      message: "Could not pull " + result.failedDates.join(", ") + ".",
    });
  }
  if (result.skippedDates.length > 0) {
    notices.push({
      kind: "info",
      message:
        "Skipped " +
        result.skippedDates.join(", ") +
        " — outside the active feed subscription window.",
    });
  }
  if (result.harvestedDates.length > 0) {
    notices.push({
      kind: "success",
      message:
        "Harvested " +
        result.harvestedDates.join(", ") +
        " — " +
        result.matched +
        " matches.",
    });
  }
  if (
    result.failedDates.length === 0 &&
    result.skippedDates.length === 0 &&
    result.harvestedDates.length === 0
  ) {
    notices.push({
      kind: "success",
      message: "Already up to date — every recent day is processed.",
    });
  }

  return notices;
}
