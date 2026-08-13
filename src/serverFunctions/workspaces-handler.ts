import { isDelegatedOrganizationId } from "@/server/auth/delegated-organization-id";
import { AppError } from "@/server/lib/errors";

/** One selectable workspace, as the switcher shows it. */
export type Workspace = {
  id: string;
  name: string;
  slug: string;
};

export type WorkspaceListing = {
  /**
   * The workspace this request resolved to — which is not necessarily one of
   * `workspaces`. Under Cloudflare Access and local_noauth it is the user's
   * delegated organization, which is deliberately not listed.
   */
  activeWorkspaceId: string;
  workspaces: Workspace[];
};

type ListDependencies = {
  listWorkspacesForUser: (userId: string) => Promise<Workspace[]>;
};

type SwitchDependencies = ListDependencies & {
  isHostedServerAuthMode: () => Promise<boolean>;
  setActiveOrganization: (organizationId: string) => Promise<void>;
};

/**
 * Belt to the repository's braces.
 *
 * The delegated exclusion already lives in SQL. It is re-applied here in
 * TypeScript because the outage this feature exists to prevent was exactly a
 * drift between a SQL rule and a TypeScript one: two spellings of "delegated"
 * that stopped agreeing. Both spellings now come from the same module, and a
 * row that slips past one still cannot reach the menu.
 */
function excludeDelegated(workspaces: Workspace[]): Workspace[] {
  return workspaces.filter(
    (workspace) => !isDelegatedOrganizationId(workspace.id),
  );
}

export async function listWorkspacesForContext(
  context: { userId: string; organizationId: string },
  dependencies: ListDependencies,
): Promise<WorkspaceListing> {
  const workspaces = await dependencies.listWorkspacesForUser(context.userId);

  return {
    activeWorkspaceId: context.organizationId,
    workspaces: excludeDelegated(workspaces),
  };
}

/**
 * Point the session at another workspace, after proving the user belongs there.
 *
 * The id arrives from the browser, so it is an assertion, not a fact. It is
 * checked against the membership rows read fresh for THIS user on THIS request
 * — the same list the switcher is allowed to display — and a miss is a refusal,
 * never a fallback to something adjacent. Deriving the check from that one list
 * rather than writing a second membership predicate is the point: a second
 * predicate is a second thing to keep in sync, and cross-tenant access is what
 * falling out of sync would cost.
 *
 * The check must stay ahead of `setActiveOrganization`. Better Auth performs
 * its own membership check, but it has no opinion about delegated
 * organizations, and relying on someone else's authorization for a tenant
 * boundary means inheriting their definition of it.
 */
export async function switchActiveWorkspaceForUser(
  input: { userId: string; requestedWorkspaceId: string },
  dependencies: SwitchDependencies,
): Promise<WorkspaceListing> {
  // Only hosted sessions carry an active organization at all. Cloudflare Access
  // and local_noauth re-derive one per request from the user's id, so a switch
  // there would appear to work and be gone by the next request.
  if (!(await dependencies.isHostedServerAuthMode())) {
    throw new AppError(
      "FORBIDDEN",
      "Switching workspaces requires a hosted session.",
    );
  }

  const workspaces = excludeDelegated(
    await dependencies.listWorkspacesForUser(input.userId),
  );
  const target = workspaces.find(
    (workspace) => workspace.id === input.requestedWorkspaceId,
  );

  if (!target) {
    throw new AppError("FORBIDDEN", "You are not a member of that workspace.");
  }

  await dependencies.setActiveOrganization(target.id);

  return { activeWorkspaceId: target.id, workspaces };
}
