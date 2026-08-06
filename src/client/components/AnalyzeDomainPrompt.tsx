import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import { Button } from "@cloudflare/kumo/components/button";

export type AnalyzePreviewItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

/**
 * Project-aware empty state for the metered tabs: names the project's own
 * domain, runs that tab's analysis in one click, and previews what comes
 * back. Nothing is fetched until the click — the tabs stay zero-auto-cost
 * while no longer opening as a bare form.
 */
export function AnalyzeDomainPrompt({
  domain,
  title,
  description,
  preview,
  onAnalyze,
  isBusy = false,
}: {
  /** The project's domain; the prompt hides itself when there isn't one. */
  domain: string | null | undefined;
  title: string;
  description: string;
  preview: AnalyzePreviewItem[];
  onAnalyze: () => void;
  isBusy?: boolean;
}) {
  if (!domain) return null;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-5">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-base-content/60">
            {description}
          </p>
        </div>

        <div>
          {/* `loading` replaces the hand-rolled spinner/icon swap AND the
              separate `disabled` — Kumo's button disables interaction while
              loading, so the two could no longer disagree. */}
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={isBusy}
            onClick={onAnalyze}
          >
            <Search className="size-3.5" />
            Analyze {domain}
          </Button>
        </div>

        {preview.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {preview.map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-base-300 p-3"
              >
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <InsightIcon icon={item.icon} />
                  {item.title}
                </div>
                <p className="mt-1 text-xs text-base-content/55">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
