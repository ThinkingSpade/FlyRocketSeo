import { useEffect, useRef } from "react";

/**
 * Re-authorizes a metered run when the user moves *within* an analysis they
 * already started.
 *
 * `page` and `mode` sit inside this tab's authorization key, so turning a page
 * or switching gap mode de-authorized the run: every query disabled, the table
 * reverted to "Press Analyze to discover organic competitors", and the rows the
 * user had already paid for vanished with no explanation.
 *
 * The distinction that makes this safe is identity. Identity is the part of the
 * key that decides WHICH data set you are looking at — the project, the target,
 * the competitor, the tab. Change one of those and you are asking a new
 * question, which still needs an explicit Analyze. Change only where you are
 * inside the answer and this re-authorizes so the table refetches.
 *
 * It therefore never fires on a tab the user merely opened: nothing is
 * authorized yet, so there is no matching identity to re-authorize against.
 */

/** What was authorized last, as this hook sees it. `null` until the first
 *  authorized render — nothing to re-authorize against yet. */
export type AuthorizedRunSnapshot = {
  identity: string;
  position: string;
} | null;

export const NO_AUTHORIZED_RUN: AuthorizedRunSnapshot = null;

type AutoPagedRunState = {
  /** Everything that makes this a different question. */
  identity: string;
  /** Whether the current key is authorized right now. */
  authorized: boolean;
  /** Position within the answer; a change here is what this hook reacts to. */
  position: string;
};

/** Records identity+position while a run is authorized, and holds the last
 *  authorized pair otherwise -- that pair is what the re-authorize decision
 *  below compares against. */
export function trackAuthorizedRun(
  previous: AuthorizedRunSnapshot,
  state: AutoPagedRunState,
): AuthorizedRunSnapshot {
  return state.authorized
    ? { identity: state.identity, position: state.position }
    : previous;
}

/**
 * Whether the auto-run should re-authorize this render.
 *
 * The load-bearing clause is the last one: the position must actually have
 * MOVED. Without it this fires during the gap between a user-initiated
 * `authorize(keyForFutureUrl)` and the URL landing (the router writes match
 * stores after an `await` inside `startTransition`, a commit later). In that
 * gap `authorized` is already false — the authorized key is the future one —
 * while `identity` still reads the pre-navigation value, so a call with no
 * override would re-key to the STALE current key and silently overwrite what
 * the user just authorized. The first Analyze on a new domain then did
 * nothing, and once the URL landed the identity guard blocked any recovery.
 *
 * Requiring a moved position closes that gap precisely, because nothing else
 * can produce it: the authorization key is built from the same search state
 * this hook reads, so with identity AND position unchanged the current key is
 * unchanged too, and the only thing that can have de-authorized it is an
 * explicit `authorize` for a URL that has not landed yet. Paging and gap-mode
 * switches -- the reason this hook exists -- always move the position, so they
 * still re-run without a second click.
 */
export function shouldReauthorizePagedRun(
  snapshot: AuthorizedRunSnapshot,
  state: AutoPagedRunState,
): boolean {
  if (state.authorized) return false;
  if (snapshot === null) return false;
  if (snapshot.identity !== state.identity) return false;
  return snapshot.position !== state.position;
}

export function useAutoPagedRun(
  input: AutoPagedRunState & { authorize: () => void },
) {
  const { identity, authorized, position, authorize } = input;
  const state = { identity, authorized, position };

  const authorizedRun = useRef<AuthorizedRunSnapshot>(NO_AUTHORIZED_RUN);
  authorizedRun.current = trackAuthorizedRun(authorizedRun.current, state);

  // `authorize` is rebuilt every render by its own hook, so it is deliberately
  // not a dependency: including it would re-run this on every render, and the
  // guards below already make a redundant call a no-op.
  useEffect(() => {
    if (
      shouldReauthorizePagedRun(authorizedRun.current, {
        identity,
        authorized,
        position,
      })
    ) {
      authorize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, identity, position]);
}
