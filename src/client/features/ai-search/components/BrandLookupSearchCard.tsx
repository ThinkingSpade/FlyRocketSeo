import type { FormEvent } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { applyBillingMarkupUsd } from "@/shared/billing";
import {
  BRAND_LOOKUP_COMPETITOR_RAW_COST_USD,
  BRAND_LOOKUP_RAW_COST_USD,
} from "@/shared/analysis-costs";
import { BRAND_LOOKUP_MAX_INPUT_LENGTH } from "@/types/schemas/ai-search";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";

type Props = {
  query: string;
  onQueryChange: (next: string) => void;
  competitors: string;
  onCompetitorsChange: (next: string) => void;
  onSubmit: (event: FormEvent) => void;
  isLoading: boolean;
  validationError: { field: "query" | "competitors"; message: string } | null;
};

// Hosted customers are billed the marked-up USD; self-hosted users pay
// DataForSEO directly at the raw rate.
const markup = (rawUsd: number) =>
  isHostedClientAuthMode() ? applyBillingMarkupUsd(rawUsd) : rawUsd;

const BRAND_LOOKUP_DISPLAYED_COST_USD = markup(BRAND_LOOKUP_RAW_COST_USD);
const BRAND_LOOKUP_COMPETITOR_DISPLAYED_COST_USD = markup(
  BRAND_LOOKUP_COMPETITOR_RAW_COST_USD,
);

export function BrandLookupSearchCard({
  query,
  onQueryChange,
  competitors,
  onCompetitorsChange,
  onSubmit,
  isLoading,
  validationError,
}: Props) {
  const hasCompetitors = competitors.trim().length > 0;
  const queryError = validationError?.field === "query";
  const competitorsError = validationError?.field === "competitors";

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-4 p-6 text-sm">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* Kumo's Input has no icon slot, so the search glyph is
                positioned over a padded input rather than sharing a wrapper
                with it — which also stops the icon being a click target that
                does not focus the field. */}
            <div className="relative flex flex-1 items-center">
              <MagnifyingGlass className="pointer-events-none absolute left-3 size-4 text-base-content/60" />
              <Input
                type="text"
                placeholder="Enter a brand name or domain"
                value={query}
                maxLength={BRAND_LOOKUP_MAX_INPUT_LENGTH}
                onChange={(event) => onQueryChange(event.target.value)}
                variant={queryError ? "error" : "default"}
                aria-invalid={queryError || undefined}
                aria-describedby={
                  queryError ? "brand-lookup-input-error" : undefined
                }
                autoComplete="off"
                spellCheck={false}
                className="w-full pl-9"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="shrink-0 px-6"
              disabled={isLoading}
            >
              {isLoading ? "Looking up..." : "Look up"}
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            <Input
              type="text"
              placeholder="Add competitors (comma-separated)"
              value={competitors}
              onChange={(event) => onCompetitorsChange(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full"
              variant={competitorsError ? "error" : "default"}
              aria-label="Competitors"
              aria-invalid={competitorsError || undefined}
              aria-describedby={
                competitorsError ? "brand-lookup-input-error" : undefined
              }
            />
            <p className="text-xs text-base-content/60">
              Add up to 5 competitor brands or domains to see your Share of
              Voice.
            </p>
          </div>
        </form>

        {validationError ? (
          <p id="brand-lookup-input-error" className="text-sm text-error">
            {validationError.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 text-xs text-base-content/60">
          <p className="tabular-nums">
            Est.{" "}
            <span className="font-medium text-base-content/80">
              ${BRAND_LOOKUP_DISPLAYED_COST_USD.toFixed(2)}
            </span>
            {hasCompetitors ? (
              <span>
                {" "}
                plus ~$
                {BRAND_LOOKUP_COMPETITOR_DISPLAYED_COST_USD.toFixed(2)} to
                compare competitors
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}
