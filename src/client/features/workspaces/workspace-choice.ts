import type {
  Workspace,
  WorkspaceListing,
} from "@/serverFunctions/workspaces-handler";

type WorkspaceChoice = {
  /**
   * The workspace currently in effect, or null when the session's active
   * organization is not one of the listed ones — a delegated organization, or
   * a membership removed since the page loaded. The menu still renders in that
   * case: a user standing somewhere unlisted is precisely the person who needs
   * a way out, which is the state that caused the outage this feature answers.
   */
  active: Workspace | null;
  workspaces: Workspace[];
};

/**
 * What the switcher should render — or null, meaning render nothing at all.
 *
 * A control that offers one option is not a control, it is furniture. Hosted
 * deployments set `allowUserToCreateOrganization: false`, so nearly every
 * account has exactly one workspace and would otherwise carry a permanent
 * dropdown that can only ever reselect where they already are. The switcher
 * appears when there is a genuine choice and is absent otherwise.
 */
export function getWorkspaceChoice(
  listing: WorkspaceListing | undefined,
): WorkspaceChoice | null {
  if (!listing || listing.workspaces.length < 2) {
    return null;
  }

  return {
    active:
      listing.workspaces.find(
        (workspace) => workspace.id === listing.activeWorkspaceId,
      ) ?? null,
    workspaces: listing.workspaces,
  };
}
