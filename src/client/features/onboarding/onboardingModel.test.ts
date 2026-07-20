import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  ONBOARDING_LAST_STEP,
  type OnboardingAnswers,
  onboardingAnswersQueryOptions,
} from "@/client/features/onboarding/onboardingModel";

vi.mock("@/serverFunctions/onboarding", () => ({
  getOnboardingAnswers: vi.fn(),
}));

describe("onboardingModel", () => {
  it("defines a two-step onboarding flow", () => {
    expect(ONBOARDING_LAST_STEP).toBe(1);
  });

  it("uses the shared onboarding answers cache key", () => {
    expect(onboardingAnswersQueryOptions().queryKey).toEqual([
      "onboardingAnswers",
    ]);
  });

  it("only collects MCP setup intent and completion", () => {
    expectTypeOf<OnboardingAnswers>().toEqualTypeOf<{
      mcpSetupIntent: "yes" | "no";
      completed: boolean;
    }>();
  });
});
