import { describe, expect, it } from "vitest";
import { canUseWorkspaceShortcuts } from "./workspaceShortcuts";

describe("workspace shortcut availability", () => {
  it("keeps commands available in delegated/local mode without a hosted session", () => {
    expect(canUseWorkspaceShortcuts(false, false)).toBe(true);
  });
  it("does not expose hosted workspace commands to signed-out visitors", () => {
    expect(canUseWorkspaceShortcuts(true, false)).toBe(false);
  });
  it("allows an authenticated hosted workspace", () => {
    expect(canUseWorkspaceShortcuts(true, true)).toBe(true);
  });
});
