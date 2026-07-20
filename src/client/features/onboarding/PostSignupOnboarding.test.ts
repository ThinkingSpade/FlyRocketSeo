import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PostSignupOnboarding } from "@/client/features/onboarding/PostSignupOnboarding";

vi.mock("@/client/features/onboarding/SearchConsoleOnboardingStep", () => ({
  SearchConsoleOnboardingStep: () => "Search Console setup",
}));

vi.mock("@/serverFunctions/onboarding", () => ({
  getOnboardingAnswers: vi.fn(),
}));

const handlers = {
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSkip: vi.fn(),
  onFinish: vi.fn(),
};

function renderOnboarding(
  props: Pick<
    Parameters<typeof PostSignupOnboarding>[0],
    "step" | "isSaving" | "finishError"
  >,
) {
  return renderToStaticMarkup(
    createElement(PostSignupOnboarding, {
      firstName: "Ada",
      ...handlers,
      accountMenu: null,
      ...props,
    }),
  );
}

describe("PostSignupOnboarding", () => {
  it("renders Search Console as the first of two skippable steps", () => {
    const html = renderOnboarding({
      step: 0,
      isSaving: false,
      finishError: null,
    });

    expect(html).toContain("Step 1 of 2");
    expect(html).toContain("Welcome to FlyRocketSEO, Ada!");
    expect(html).toContain("Search Console setup");
    expect(html).toContain("Skip");
    expect(html).toContain("Continue");
    expect(html).not.toContain("What tasks matter to you most?");
  });

  it("renders MCP as the final step with a retryable inline error", () => {
    const html = renderOnboarding({
      step: 1,
      isSaving: false,
      finishError: "We couldn't save your setup. Please try again.",
    });

    expect(html).toContain("Step 2 of 2");
    expect(html).toContain("Set up FlyRocketSEO MCP?");
    expect(html).toContain("Yes, set up MCP");
    expect(html).toContain("Not now");
    expect(html).toContain('role="alert"');
    expect(html).toContain(
      "We couldn&#x27;t save your setup. Please try again.",
    );
  });

  it("shows save progress while the final write is pending", () => {
    const html = renderOnboarding({
      step: 1,
      isSaving: true,
      finishError: null,
    });

    expect(html).toContain("Saving…");
    expect(html).toContain("disabled");
  });
});
