import { describe, expect, it } from "vitest";
import { getWorkspaceChoice } from "./workspace-choice";

const TEAM = { id: "team-org", name: "Acme", slug: "acme" };
const CLIENT = { id: "client-org", name: "Beta", slug: "beta" };

describe("getWorkspaceChoice", () => {
  it("renders nothing for a user with exactly one workspace", () => {
    // `allowUserToCreateOrganization: false` means this is the ordinary
    // account, so this branch is the one nearly everyone gets. A dropdown
    // whose only entry is where you already are is clutter, not a control.
    expect(
      getWorkspaceChoice({
        activeWorkspaceId: "team-org",
        workspaces: [TEAM],
      }),
    ).toBeNull();
  });

  it("renders nothing when there are no workspaces to offer", () => {
    // Cloudflare Access and local_noauth: the user's only organization is
    // their delegated one, which is never listed.
    expect(
      getWorkspaceChoice({
        activeWorkspaceId: "delegated-user-1",
        workspaces: [],
      }),
    ).toBeNull();
  });

  it("renders nothing before the list has loaded", () => {
    expect(getWorkspaceChoice(undefined)).toBeNull();
  });

  it("resolves the active workspace when there is a real choice", () => {
    expect(
      getWorkspaceChoice({
        activeWorkspaceId: "client-org",
        workspaces: [TEAM, CLIENT],
      }),
    ).toEqual({ active: CLIENT, workspaces: [TEAM, CLIENT] });
  });

  it("still offers the menu when the active organization is unlisted", () => {
    // This is the outage, exactly: a session pointing at a workspace the user
    // cannot see listed. Hiding the control here would reproduce the dead end
    // it exists to open.
    expect(
      getWorkspaceChoice({
        activeWorkspaceId: "delegated-user-1",
        workspaces: [TEAM, CLIENT],
      }),
    ).toEqual({ active: null, workspaces: [TEAM, CLIENT] });
  });
});
