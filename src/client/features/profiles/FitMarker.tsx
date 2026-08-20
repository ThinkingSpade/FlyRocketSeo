import { UserMinus } from "@phosphor-icons/react";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";

/**
 * The "somebody else's customer" mark beside a keyword.
 *
 * Only `wrong-customer` renders. The other verdicts are either fine or merely
 * uncertain, and marking those would train people to ignore the glyph on the
 * rows where it matters.
 *
 * The reason is the profile line the user typed, carried both as the
 * accessible name and as a `<title>` so it reaches a pointer hover too — a row
 * dropped or demoted by this is legible as a wrong exclusion line rather than
 * an unexplained absence.
 *
 * Shared because three tables grew a byte-identical copy: Keyword Research,
 * Saved Keywords and Rank Tracking's suggestion step. A verdict that renders
 * differently depending on which table you are looking at is worse than no
 * verdict.
 */
export function FitMarker({ fit }: { fit: FitResult | undefined }) {
  if (fit?.verdict !== "wrong-customer") return null;
  return (
    <UserMinus
      className="size-3.5 shrink-0 text-base-content/40"
      aria-label={fit.reason}
    >
      <title>{fit.reason}</title>
    </UserMinus>
  );
}
