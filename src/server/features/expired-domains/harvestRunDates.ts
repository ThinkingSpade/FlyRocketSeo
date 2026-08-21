type CompletedHarvestRun = {
  droppedOn: string;
  skipReason: string | null;
};

/**
 * Split completed run rows for display without treating a permanent skip as a
 * successful harvest. A null skip reason means the feed was actually read.
 */
export function partitionHarvestRunDates(
  rows: readonly CompletedHarvestRun[],
): { harvestedDates: string[]; skippedDates: string[] } {
  const harvestedDates: string[] = [];
  const skippedDates: string[] = [];

  for (const row of rows) {
    if (row.skipReason === null) harvestedDates.push(row.droppedOn);
    else skippedDates.push(row.droppedOn);
  }

  return { harvestedDates, skippedDates };
}
