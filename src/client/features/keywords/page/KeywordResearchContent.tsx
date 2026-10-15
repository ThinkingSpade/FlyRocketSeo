import { Link } from "@tanstack/react-router";
import { WarningCircle } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@cloudflare/kumo/components/button";
import { getErrorCode } from "@/client/lib/error-messages";
import { BILLING_ROUTE } from "@/shared/billing";
import { resolveKeywordResultUsability } from "@/client/features/keywords/keywordResultUsability";
import { KeywordResearchEmptyState } from "./KeywordResearchEmptyState";
import { KeywordResearchLoadingState } from "./KeywordResearchLoadingState";
import { KeywordResearchNoMetricsState } from "./KeywordResearchNoMetricsState";
import { KeywordResearchNotLoadedState } from "./KeywordResearchNotLoadedState";
import { KeywordResearchResults } from "./KeywordResearchResults";
import type { KeywordResearchControllerState } from "./types";

export function KeywordResearchContent({
  controller,
  projectId,
  ownDomainRating,
  notLoadedKeyword,
  onSearchCountry,
}: {
  controller: KeywordResearchControllerState;
  projectId: string;
  ownDomainRating: number | null;
  notLoadedKeyword: string;
  onSearchCountry: (keyword: string, countryCode: number) => void;
}) {
  if (controller.isLoading) {
    return <KeywordResearchLoadingState />;
  }

  if (controller.searchNotLoaded) {
    return (
      <KeywordResearchNotLoadedState
        keyword={notLoadedKeyword}
        onRun={() => {
          // Run THIS tab's keyword, not whatever the textarea holds.
          controller.controlsForm.setFieldValue("keyword", notLoadedKeyword);
          void controller.controlsForm.handleSubmit();
        }}
      />
    );
  }

  if (controller.researchError) {
    const isCreditsError =
      getErrorCode(controller.researchMutationError) === "INSUFFICIENT_CREDITS";

    return (
      <div className="flex-1 flex items-center justify-center pt-1">
        <div className="w-full max-w-xl rounded-xl border border-error/30 bg-error/10 p-5 text-error space-y-3">
          <div className="flex items-start gap-2">
            <WarningCircle className="mt-0.5 size-4 shrink-0" />
            <p className="text-sm">{controller.researchError}</p>
          </div>
          {isCreditsError ? (
            <Link to={BILLING_ROUTE} className={buttonVariants({ size: "sm" })}>
              Go to Billing
            </Link>
          ) : (
            <Button size="sm" onClick={controller.retrySearch}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (controller.rows.length === 0) {
    return (
      <KeywordResearchEmptyState
        controller={controller}
        projectId={projectId}
      />
    );
  }

  // Rows came back carrying no figures at all — the seed echoed by Google Ads
  // with everything null, which used to render as a table of dashes. Say what
  // happened instead, and offer the geography that would actually answer it.
  const usability = resolveKeywordResultUsability(
    controller.rows,
    controller.searchedKeyword,
  );
  if (usability.kind === "no-metrics") {
    return (
      <KeywordResearchNoMetricsState
        controller={controller}
        rowCount={usability.rowCount}
        onSearchCountry={onSearchCountry}
      />
    );
  }

  return (
    <KeywordResearchResults
      projectId={projectId}
      controller={controller}
      ownDomainRating={ownDomainRating}
    />
  );
}
