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
export function useAutoPagedRun(input: {
  /** Everything that makes this a different question. */
  identity: string;
  /** Whether the current key is authorized right now. */
  authorized: boolean;
  /** Position within the answer; a change here is what this hook reacts to. */
  position: string;
  authorize: () => void;
}) {
  const { identity, authorized, position, authorize } = input;

  const authorizedIdentity = useRef<string | null>(null);
  if (authorized) authorizedIdentity.current = identity;

  // `authorize` is rebuilt every render by its own hook, so it is deliberately
  // not a dependency: including it would re-run this on every render, and the
  // guards below already make a redundant call a no-op.
  useEffect(() => {
    if (authorized) return;
    if (authorizedIdentity.current !== identity) return;
    authorize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, identity, position]);
}
