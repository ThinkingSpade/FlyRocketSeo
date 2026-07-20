import { queryOptions } from "@tanstack/react-query";
import { getOnboardingAnswers } from "@/serverFunctions/onboarding";

export const ONBOARDING_LAST_STEP = 1;

/** The only answers collected by the setup-only onboarding flow. */
export type OnboardingAnswers = {
  mcpSetupIntent: "yes" | "no";
  completed: boolean;
};

export const onboardingAnswersQueryOptions = () =>
  queryOptions({
    queryKey: ["onboardingAnswers"],
    queryFn: () => getOnboardingAnswers(),
  });
