import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { OnboardingAccountMenu } from "@/client/features/onboarding/OnboardingAccountMenu";
import { PostSignupOnboarding } from "@/client/features/onboarding/PostSignupOnboarding";
import {
  ONBOARDING_LAST_STEP,
  type OnboardingAnswers,
  onboardingAnswersQueryOptions,
} from "@/client/features/onboarding/onboardingModel";
import { captureClientEvent } from "@/client/lib/posthog";
import { queryClient } from "@/client/tanstack-db";
import { useSession } from "@/lib/auth-client";
import { saveOnboardingAnswers } from "@/serverFunctions/onboarding";

const clampStep = (step: number) =>
  Math.min(Math.max(0, Math.trunc(step)), ONBOARDING_LAST_STEP);

export const Route = createFileRoute("/_authenticated/onboarding/")({
  // Step lives in the URL so it survives refresh and works with back/forward.
  validateSearch: (search: Record<string, unknown>): { step: number } => {
    const raw = Number(search.step);
    return { step: Number.isFinite(raw) ? clampStep(raw) : 0 };
  },
  // Send users who already finished onboarding home before rendering. Running
  // this in beforeLoad (not a component effect) means it can't race with the
  // navigation we trigger after the final step.
  beforeLoad: async () => {
    const data = await queryClient.ensureQueryData(
      onboardingAnswersQueryOptions(),
    );
    if (data.completedAt) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const { data: session } = useSession();
  const onboardingQuery = useQuery(onboardingAnswersQueryOptions());

  if (!onboardingQuery.data) {
    return null;
  }

  const firstName = session?.user?.name?.split(" ")[0] || "";

  return <OnboardingFlow firstName={firstName} email={session?.user?.email} />;
}

function OnboardingFlow({
  firstName,
  email,
}: {
  firstName: string;
  email: string | undefined;
}) {
  const navigate = useNavigate();
  const { step } = Route.useSearch();
  const [finishError, setFinishError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (answers: OnboardingAnswers) =>
      saveOnboardingAnswers({ data: answers }),
    onError: (error) => {
      console.error("Failed to save onboarding answers", error);
    },
  });

  const goToStep = (next: number) =>
    void navigate({ to: "/onboarding", search: { step: clampStep(next) } });

  const handleNext = () => {
    goToStep(step + 1);
  };

  const handleSkip = () => {
    goToStep(step + 1);
  };

  const handleFinish = async (mcpSetupIntent: "yes" | "no") => {
    setFinishError(null);
    const completedAt = new Date().toISOString();

    try {
      await saveMutation.mutateAsync({ mcpSetupIntent, completed: true });
    } catch {
      setFinishError("We couldn't save your setup. Please try again.");
      return;
    }

    queryClient.setQueryData(onboardingAnswersQueryOptions().queryKey, (old) =>
      old
        ? {
            ...old,
            completedAt,
            gscNudgeDismissedAt: completedAt,
            answers: { ...old.answers, mcpSetupIntent },
          }
        : old,
    );
    captureClientEvent("onboarding:completed", {
      wants_mcp_setup: mcpSetupIntent === "yes",
    });
    if (mcpSetupIntent === "yes") {
      void navigate({ to: "/ai", replace: true });
    } else {
      void navigate({ to: "/", replace: true });
    }
  };

  return (
    <PostSignupOnboarding
      firstName={firstName}
      step={step}
      onNext={handleNext}
      onBack={() => goToStep(step - 1)}
      onSkip={handleSkip}
      onFinish={handleFinish}
      isSaving={saveMutation.isPending}
      finishError={finishError}
      accountMenu={<OnboardingAccountMenu email={email} />}
    />
  );
}
