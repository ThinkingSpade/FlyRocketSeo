/** Delegated authentication has no Better Auth session. Server functions still
 * enforce the account/project boundary; this controls only navigation UI. */
export function canUseWorkspaceShortcuts(
  hosted: boolean,
  hasSession: boolean,
): boolean {
  return !hosted || hasSession;
}
