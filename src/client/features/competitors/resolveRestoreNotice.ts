import { shouldAdoptRestoredRun } from "./shouldAdoptRestoredRun";

/**
 * Whether the "your last run expired / couldn't be restored" banner may
 * render, and as which variant.
 *
 * `useAutoRestoredRun` is keyed on projectId+feature only -- it has no idea
 * what target is on screen -- so rendering straight off its `outcome` is
 * exactly the cross-client leak `shouldAdoptRestoredRun` exists to prevent,
 * just via a path that guard didn't cover: an expired run for a DIFFERENT
 * domain than the one now on screen must not be reported as "your last run"
 * (reuses `shouldAdoptRestoredRun` for that, rather than a second
 * comparison), and once a live result exists the stale notice must stop
 * claiming otherwise -- nothing invalidates the restore query on run
 * completion, so without this it would sit there forever.
 *
 * `unreadable` carries no label at all -- the hook only exposes one for the
 * `expired` and `ready` cases -- so it cannot be domain-scoped the same way.
 * Its own copy never names a domain either, so leaving it target-independent
 * is not a wrong-domain claim; it still has to clear once a live result
 * answers the question, which is the failure that genuinely does apply to
 * it too.
 */
export function resolveRestoreNotice(input: {
  target: string;
  hasLiveResult: boolean;
  outcome: "none" | "expired" | "unreadable" | "ready" | null;
  expiredLabel: string | null;
}): "expired" | "unreadable" | null {
  if (input.hasLiveResult) return null;
  if (input.outcome === "expired") {
    const belongsHere = shouldAdoptRestoredRun({
      target: input.target,
      restoredLabel: input.expiredLabel,
    });
    return belongsHere ? "expired" : null;
  }
  if (input.outcome === "unreadable") return "unreadable";
  return null;
}
