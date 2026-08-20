import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import {
  listWorkspacesForContext,
  switchActiveWorkspaceForUser,
  type Workspace,
} from "./workspaces-handler";

const TEAM: Workspace = { id: "team-org", name: "Acme", slug: "acme" };
const CLIENT: Workspace = { id: "client-org", name: "Beta", slug: "beta" };
const DELEGATED: Workspace = {
  id: "delegated-user-1",
  name: "owner workspace",
  slug: "owner",
};

function createSwitchDependencies(memberships: Workspace[]) {
  return {
    listWorkspacesForUser: vi.fn().mockResolvedValue(memberships),
    isHostedServerAuthMode: vi.fn().mockResolvedValue(true),
    setActiveOrganization: vi.fn().mockResolvedValue(undefined),
  };
}

describe("listWorkspacesForContext", () => {
  it("lists only the memberships read for this user", async () => {
    const listWorkspacesForUser = vi.fn().mockResolvedValue([TEAM, CLIENT]);

    await expect(
      listWorkspacesForContext(
        { userId: "user-1", organizationId: "team-org" },
        { listWorkspacesForUser },
      ),
    ).resolves.toEqual({
      activeWorkspaceId: "team-org",
      workspaces: [TEAM, CLIENT],
    });
    expect(listWorkspacesForUser).toHaveBeenCalledWith("user-1");
  });

  it("drops a delegated organization the query let through", async () => {
    // The SQL already excludes these. This is the second spelling of the same
    // rule, because the outage that motivated the switcher was two spellings
    // of "delegated" drifting apart.
    const listWorkspacesForUser = vi.fn().mockResolvedValue([DELEGATED, TEAM]);

    await expect(
      listWorkspacesForContext(
        { userId: "user-1", organizationId: "team-org" },
        { listWorkspacesForUser },
      ),
    ).resolves.toMatchObject({ workspaces: [TEAM] });
  });

  it("reports an active organization that is not in the list", async () => {
    // A session sitting on a delegated organization is exactly the state that
    // stranded the owner. The active id is still reported, so the UI can show
    // "you are somewhere unlisted" rather than silently claiming otherwise.
    const listWorkspacesForUser = vi.fn().mockResolvedValue([TEAM, CLIENT]);

    await expect(
      listWorkspacesForContext(
        { userId: "user-1", organizationId: "delegated-user-1" },
        { listWorkspacesForUser },
      ),
    ).resolves.toMatchObject({ activeWorkspaceId: "delegated-user-1" });
  });
});

describe("switchActiveWorkspaceForUser", () => {
  it("activates a workspace the user belongs to", async () => {
    const dependencies = createSwitchDependencies([TEAM, CLIENT]);

    await expect(
      switchActiveWorkspaceForUser(
        { userId: "user-1", requestedWorkspaceId: "client-org" },
        dependencies,
      ),
    ).resolves.toMatchObject({ activeWorkspaceId: "client-org" });
    expect(dependencies.setActiveOrganization).toHaveBeenCalledWith(
      "client-org",
    );
  });

  it("REJECTS an organization the user is not a member of", async () => {
    // The whole point of the feature. The id is client-supplied, so a request
    // naming someone else's workspace must fail rather than resolve to it —
    // honouring it would hand this session another tenant's projects, keywords
    // and Search Console data.
    const dependencies = createSwitchDependencies([TEAM]);

    await expect(
      switchActiveWorkspaceForUser(
        { userId: "user-1", requestedWorkspaceId: "someone-elses-org" },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dependencies.setActiveOrganization).not.toHaveBeenCalled();
  });

  it("reads the membership list fresh for the requesting user", async () => {
    // The check must run against THIS user's rows, not a list the caller
    // brought with them.
    const dependencies = createSwitchDependencies([TEAM]);

    await switchActiveWorkspaceForUser(
      { userId: "user-1", requestedWorkspaceId: "team-org" },
      dependencies,
    );

    expect(dependencies.listWorkspacesForUser).toHaveBeenCalledWith("user-1");
  });

  it("rejects a delegated organization even with a membership row", async () => {
    // Every user has a membership row for their own delegated organization, so
    // membership alone would let this through. `resolveHostedContext`
    // re-resolves away from it on the next request, so activating it is a
    // no-op the user experiences as the app ignoring them.
    const dependencies = createSwitchDependencies([DELEGATED, TEAM]);

    await expect(
      switchActiveWorkspaceForUser(
        { userId: "user-1", requestedWorkspaceId: "delegated-user-1" },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(dependencies.setActiveOrganization).not.toHaveBeenCalled();
  });

  it("does not treat a workspace merely named like a delegated one as delegated", async () => {
    // The rule is an id prefix, and ids are opaque; a real workspace whose id
    // contains the word elsewhere must still be selectable.
    const lookalike: Workspace = {
      id: "org-delegated-team",
      name: "Delegated Team",
      slug: "delegated-team",
    };
    const dependencies = createSwitchDependencies([lookalike]);

    await expect(
      switchActiveWorkspaceForUser(
        { userId: "user-1", requestedWorkspaceId: "org-delegated-team" },
        dependencies,
      ),
    ).resolves.toMatchObject({ activeWorkspaceId: "org-delegated-team" });
  });

  it("refuses outside hosted mode, before touching the session", async () => {
    // Cloudflare Access and local_noauth re-derive the active organization from
    // the user id on every request. A switch there would look like it worked
    // and be gone by the next page load.
    const dependencies = createSwitchDependencies([TEAM, CLIENT]);
    dependencies.isHostedServerAuthMode.mockResolvedValue(false);

    await expect(
      switchActiveWorkspaceForUser(
        { userId: "user-1", requestedWorkspaceId: "client-org" },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dependencies.setActiveOrganization).not.toHaveBeenCalled();
  });
});
