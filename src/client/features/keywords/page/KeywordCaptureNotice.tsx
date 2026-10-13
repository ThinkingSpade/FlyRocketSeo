import type { KeywordObservation } from "@/types/keywords";

export function KeywordCaptureNotice({
  observation,
  restored,
  rowCount,
}: {
  observation: KeywordObservation | null;
  restored: boolean;
  rowCount: number;
}) {
  return (
    <p
      className="shrink-0 text-xs text-base-content/60"
      data-testid="keyword-capture-notice"
    >
      {observation ? (
        <>
          {observation.source} estimates · {observation.locationCode}/
          {observation.languageCode} · Captured{" "}
          {observation.fetchedAt.slice(0, 10)} (UTC).{" "}
          {Date.now() - Date.parse(observation.fetchedAt) > 24 * 60 * 60 * 1000
            ? "Older saved observation. "
            : ""}
        </>
      ) : (
        <>
          Legacy result: original capture and provider scope are unknown;
          uncertain monthly trends are hidden.{" "}
        </>
      )}
      {restored ? "Restored without a provider request. " : ""}
      {rowCount} returned keywords; this is a limited provider sample. Missing
      metrics remain unknown; advertising competition differs from organic
      difficulty.
    </p>
  );
}
