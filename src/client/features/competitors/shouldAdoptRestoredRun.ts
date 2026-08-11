import { normalizeDomain } from "@/types/schemas/domain";

/**
 * Best-effort domain normalization for a comparison that must stay a pure
 * boolean function even against malformed input: `normalizeDomain` throws on
 * a string `new URL()` can't parse (stray spaces, an unfinished paste), and a
 * target on screen can be exactly that mid-typed value. Returns `null`
 * instead of throwing so the caller can treat "couldn't tell" as "not a
 * match" rather than crashing the page.
 */
export function safeNormalizeDomain(input: string): string | null {
  try {
    return normalizeDomain(input);
  } catch {
    return null;
  }
}

/**
 * Whether a restored run may be rendered for the target on screen.
 *
 * Restoring is free (a D1 row plus the R2 object that run already paid for),
 * so the old gate -- restore ONLY when no target is set -- bought nothing and
 * cost the user a paid click every visit: the target input is prefilled from
 * the project domain, so a target was almost always present and the restore
 * almost never ran.
 *
 * The real constraint is narrower, and it is about correctness rather than
 * money: never show one client's cached run under another client's domain.
 *
 * Both sides go through the SAME `normalizeDomain` before comparing. The
 * stored `restoredLabel` is already normalized server-side
 * (`normalizeDomainInput(input.target, true)` in `CompetitorsService.ts`,
 * which strips scheme/`www.`/path the same way), but `target` here comes
 * straight from raw form input (`CompetitorsPage.tsx`'s `targetInput.trim()`)
 * with none of that applied. Comparing a bare `trim().toLowerCase()` against
 * it meant pasting `https://www.example.com/` could never match a label
 * stored as `example.com` -- the run would be silently dropped, and with it
 * the expired notice this same mismatch also suppresses (see
 * `resolveRestoreNotice.ts`), landing back on "Press Analyze…" for a run
 * that, from the vendor's point of view, already exists.
 */
export function shouldAdoptRestoredRun(input: {
  target: string;
  restoredLabel: string | null;
}): boolean {
  if (!input.restoredLabel) return false;
  const target = input.target.trim();
  if (target === "") return true;
  const normalizedTarget = safeNormalizeDomain(target);
  const normalizedLabel = safeNormalizeDomain(input.restoredLabel);
  if (normalizedTarget === null || normalizedLabel === null) return false;
  return normalizedTarget === normalizedLabel;
}
