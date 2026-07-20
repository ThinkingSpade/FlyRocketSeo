import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { ONBOARDING_LAST_STEP } from "@/client/features/onboarding/onboardingModel";
import { SearchConsoleOnboardingStep } from "@/client/features/onboarding/SearchConsoleOnboardingStep";

type PostSignupOnboardingProps = {
  firstName: string;
  step: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: (mcpSetupIntent: "yes" | "no") => void;
  isSaving: boolean;
  finishError: string | null;
  accountMenu: ReactNode;
};

export function PostSignupOnboarding({
  firstName,
  step,
  onNext,
  onBack,
  onSkip,
  onFinish,
  isSaving,
  finishError,
  accountMenu,
}: PostSignupOnboardingProps) {
  return (
    <div className="w-full max-w-md space-y-6">
      {accountMenu}

      <div className="text-center space-y-3">
        <img
          src="/transparent-logo.svg"
          alt="FlyRocketSEO"
          className="mx-auto size-10 rounded-lg"
        />
        <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
          Step {step + 1} of {ONBOARDING_LAST_STEP + 1}
        </p>
        <h1 className="text-xl font-semibold">
          {firstName
            ? `Welcome to FlyRocketSEO, ${firstName}!`
            : "Welcome to FlyRocketSEO!"}
        </h1>
        <p className="text-sm text-base-content/60">
          Connect the tools you want to use.
        </p>
      </div>

      <div className="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
        {step === 0 ? (
          <SearchConsoleOnboardingStep />
        ) : (
          <McpRecommendation
            isSaving={isSaving}
            error={finishError}
            onBack={onBack}
            onSetup={() => onFinish("yes")}
            onSkip={() => onFinish("no")}
          />
        )}

        {step < ONBOARDING_LAST_STEP ? (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={step === 0 || isSaving}
              onClick={onBack}
            >
              Back
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm text-base-content/55"
                disabled={isSaving}
                onClick={onSkip}
              >
                Skip
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isSaving}
                onClick={onNext}
              >
                Continue
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function McpRecommendation({
  isSaving,
  error,
  onBack,
  onSetup,
  onSkip,
}: {
  isSaving: boolean;
  error: string | null;
  onBack: () => void;
  onSetup: () => void;
  onSkip: () => void;
}) {
  const capabilities = [
    "Keyword research",
    "Competitor research",
    "Link prospecting",
  ];

  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="btn btn-ghost btn-sm -ml-2 mb-2 self-start gap-1.5 text-base-content/60"
        disabled={isSaving}
        onClick={onBack}
      >
        <ArrowLeft className="size-4" />
        Back
      </button>
      <h2 className="text-lg font-semibold">Set up FlyRocketSEO MCP?</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-base-content/70">
        The most powerful way to use FlyRocketSEO — use AI to supercharge your
        SEO skills.
      </p>

      <ul className="mt-4 w-full space-y-2">
        {capabilities.map((capability) => (
          <li key={capability} className="flex items-center gap-2.5 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-base-200 text-base-content">
              <Check className="size-3" />
            </span>
            <span className="text-base-content/80">{capability}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-primary mt-5 w-full"
        disabled={isSaving}
        onClick={onSetup}
      >
        {isSaving ? (
          "Saving…"
        ) : (
          <>
            Yes, set up MCP
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm mt-2 w-full text-base-content/60"
        disabled={isSaving}
        onClick={onSkip}
      >
        Not now
      </button>
      {error ? (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
