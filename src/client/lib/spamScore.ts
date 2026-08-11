type SpamScoreDescription = {
  formatted: string;
  tier: "unavailable" | "low" | "review" | "high";
  label:
    | "Not available"
    | "Low signal"
    | "Worth reviewing"
    | "High-risk signal";
  guidance: string | null;
  tone: "neutral" | "warning" | "error";
  className: "text-base-content/60" | "text-warning" | "text-error";
  reviewRecommended: boolean;
};

const REVIEW_GUIDANCE = "Review referring domains before taking action.";

/**
 * Gives every backlink spam score the same 0-100 interpretation. A tier can
 * prompt a review, but it is never evidence that a link should be disavowed.
 */
export function describeSpamScore(
  value: number | null | undefined,
): SpamScoreDescription {
  if (value == null || !Number.isFinite(value)) {
    return {
      formatted: "—",
      tier: "unavailable",
      label: "Not available",
      guidance: null,
      tone: "neutral",
      className: "text-base-content/60",
      reviewRecommended: false,
    };
  }

  const rounded = Math.round(value);
  if (value >= 60) {
    return {
      formatted: String(rounded),
      tier: "high",
      label: "High-risk signal",
      guidance: REVIEW_GUIDANCE,
      tone: "error",
      className: "text-error",
      reviewRecommended: true,
    };
  }

  if (value >= 30) {
    return {
      formatted: String(rounded),
      tier: "review",
      label: "Worth reviewing",
      guidance: REVIEW_GUIDANCE,
      tone: "warning",
      className: "text-warning",
      reviewRecommended: true,
    };
  }

  return {
    formatted: String(rounded),
    tier: "low",
    label: "Low signal",
    guidance: null,
    tone: "neutral",
    className: "text-base-content/60",
    reviewRecommended: false,
  };
}
