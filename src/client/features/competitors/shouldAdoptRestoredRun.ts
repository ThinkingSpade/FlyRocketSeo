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
 */
export function shouldAdoptRestoredRun(input: {
  target: string;
  restoredLabel: string | null;
}): boolean {
  if (!input.restoredLabel) return false;
  const target = input.target.trim().toLowerCase();
  if (target === "") return true;
  return target === input.restoredLabel.trim().toLowerCase();
}
