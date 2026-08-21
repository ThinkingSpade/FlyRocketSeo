type HarvestResult = {
  matched: number;
  harvestedDates: string[];
  skippedDates: string[];
  failedDates: string[];
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
