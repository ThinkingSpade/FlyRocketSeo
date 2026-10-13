import type { z } from "zod";
import type { trendsResultSchema } from "@/types/schemas/trends";

/** Describe the observation itself, including a restored run's original window. */
export function TrendsObservationDetails({
  result,
  regionLabel,
}: {
  result: z.infer<typeof trendsResultSchema>;
  regionLabel: string | null;
}) {
  return (
    <div className="text-xs text-base-content/60">
      <p>
        {result.contractVersion === 2 && result.scope ? (
          <>
            {result.dataSource} ·{" "}
            {result.scope.locationCode == null
              ? "Worldwide"
              : (regionLabel ?? `Region ${result.scope.locationCode}`)}{" "}
            · Language {result.scope.languageCode} · {result.scope.dateFrom} to{" "}
            {result.scope.dateTo}
          </>
        ) : (
          "Source and market unverified for this historical observation"
        )}
        {result.fetchedAt
          ? ` · Captured ${result.fetchedAt.slice(0, 10)} at ${result.fetchedAt.slice(11, 19)} UTC`
          : " · Capture time unknown"}
      </p>
      <p>
        Relative interest ranges from 0 to 100. Zero means insufficient data;
        gaps are unavailable observations. These values are not search counts.
      </p>
    </div>
  );
}
