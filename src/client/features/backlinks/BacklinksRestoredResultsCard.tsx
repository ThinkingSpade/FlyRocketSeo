import { LinkBreak } from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Empty } from "@cloudflare/kumo/components/empty";
import type { BacklinksRestoredResultsPresentation } from "./backlinksRestoredState";

export function BacklinksRestoredResultsCard({
  presentation,
  onRefresh,
}: {
  presentation: Extract<
    BacklinksRestoredResultsPresentation,
    { kind: "empty" }
  >;
  onRefresh: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <Empty
        size="sm"
        className="rounded-none border-0 bg-base-100"
        icon={<LinkBreak className="size-8 text-base-content/35" />}
        title={presentation.title}
        description={presentation.description}
        contents={
          presentation.errorMessage || presentation.actionLabel ? (
            <div className="flex w-full max-w-xl flex-col items-center gap-3">
              {presentation.errorMessage ? (
                <Banner
                  variant="error"
                  className="text-left"
                  description={presentation.errorMessage}
                />
              ) : null}
              {presentation.actionLabel ? (
                <Button
                  type="button"
                  variant="primary"
                  loading={presentation.actionLoading}
                  onClick={onRefresh}
                >
                  {presentation.actionLabel}
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
