import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  remembered: null as string | null,
  effects: [] as Array<() => void>,
  navigate: vi.fn(),
  clear: vi.fn<() => void>(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  // Explicit route effects are component contracts, not authenticated E2E.
  useEffect: (effect: () => void) => state.effects.push(effect),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [{ id: "project-a" }, { id: "project-b" }],
    error: null,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/serverFunctions/projects", () => ({ getProjects: vi.fn() }));
vi.mock("@/client/lib/active-project", () => ({
  getLastProjectId: () => state.remembered,
  clearLastProjectId: () => state.clear(),
}));
import { AuthenticatedHome } from "./AuthenticatedHome";

beforeEach(() => {
  state.effects = [];
  state.remembered = null;
  vi.clearAllMocks();
});
function enterHome() {
  renderToStaticMarkup(createElement(AuthenticatedHome));
  state.effects.forEach((effect) => effect());
}
describe("root entry leads to the selected site's command center", () => {
  it("opens Overview, not a paid research workflow, for a new visitor", () => {
    enterHome();
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/p/$projectId",
      params: { projectId: "project-a" },
    });
  });
  it("preserves a remembered project that belongs to the current organization", () => {
    state.remembered = "project-b";
    enterHome();
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/p/$projectId",
      params: { projectId: "project-b" },
    });
    expect(state.clear).not.toHaveBeenCalled();
  });
  it("clears an unrecognized project instead of navigating to it", () => {
    state.remembered = "foreign-project";
    enterHome();
    expect(state.clear).toHaveBeenCalledOnce();
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/p/$projectId",
      params: { projectId: "project-a" },
    });
  });
});
