import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { ExportToSheetsButton } from "@/client/components/table/ExportToSheetsButton";
import type { SerpResultItem } from "@/types/keywords";
import { Button } from "@cloudflare/kumo/components/button";

export function SerpAnalysisCard({
  items,
  keyword,
  loading,
  error,
  onRetry,
  page,
  pageSize,
  onPageChange,
  analyzeKeyword,
  onAnalyze,
}: {
  items: SerpResultItem[];
  keyword?: string | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  /** The keyword an Analyze click would run, when none is loaded yet --
   *  normally whichever row the table has highlighted. */
  analyzeKeyword?: string | null;
  onAnalyze?: () => void;
}) {
  const totalPages = Math.ceil(items.length / pageSize);
  const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);

  if (loading) return <SerpAnalysisLoadingState />;
  if (error) {
    return (
      <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error space-y-2">
        <p>{error}</p>
        {onRetry ? (
          <Button size="xs" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <SerpAnalysisEmptyState
        keyword={keyword}
        analyzeKeyword={analyzeKeyword}
        onAnalyze={onAnalyze}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-base-content/50">
          {items.length} organic results
        </div>
        <ExportToSheetsButton
          headers={["Rank", "Title", "URL", "Domain"]}
          rows={items.map((item) => [
            item.rank,
            item.title ?? "",
            item.url,
            item.domain,
          ])}
          feature="serp_analysis"
        />
      </div>
      <SerpAnalysisTable items={pageItems} />
      <SerpAnalysisPagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}

function SerpAnalysisTable({ items }: { items: SerpResultItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-xs w-full">
        <thead>
          <tr className="text-xs text-base-content/60">
            <th className="w-8">#</th>
            <th>Page</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.rank}-${item.url}`}
              className="hover:bg-base-200/50"
            >
              <td className="font-mono text-base-content/50 text-xs">
                {item.rank}
              </td>
              <td className="min-w-0 max-w-0">
                <div className="flex flex-col gap-0.5">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline truncate flex items-center gap-1"
                    title={item.title}
                  >
                    {item.title || item.url}
                    <ExternalLink className="size-3 shrink-0 opacity-40" />
                  </a>
                  <span className="text-xs text-base-content/40 truncate">
                    {item.domain}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SerpAnalysisPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-base-200">
      <span className="text-xs text-base-content/50">
        Page {page + 1} of {totalPages}
      </span>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="xs"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </Button>
        <Button
          variant="ghost"
          size="xs"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function SerpAnalysisLoadingState() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="h-8 rounded bg-base-200 animate-pulse"
          style={{ animationDelay: `${index * 50}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Three genuinely different situations the previous copy collapsed into one.
 *
 * It read "No SERP details available for this keyword yet. Try clicking
 * another keyword to load data." in every case -- including the most common
 * one, where no keyword had EVER been selected for SERP analysis. The panel
 * offered no control that would load anything, so it described a data gap
 * while actually being a dead end: the only thing that fetches a SERP is a
 * table row click, and nothing on screen said so.
 */
function SerpAnalysisEmptyState({
  keyword,
  analyzeKeyword,
  onAnalyze,
}: {
  keyword?: string | null;
  analyzeKeyword?: string | null;
  onAnalyze?: () => void;
}) {
  // A keyword WAS analyzed and genuinely came back with no organic results.
  if (keyword) {
    return (
      <div className="py-8 text-center text-sm text-base-content/60">
        <p>No organic results came back for “{keyword}”.</p>
        <p className="mt-1 text-base-content/50">
          Pick another keyword to try a different SERP.
        </p>
      </div>
    );
  }

  // Nothing analyzed yet, but there is a row to analyze -- give it a control
  // instead of describing the absence.
  if (analyzeKeyword && onAnalyze) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm text-base-content/60">
          See who currently ranks for “{analyzeKeyword}”.
        </p>
        <Button type="button" size="sm" onClick={onAnalyze}>
          Analyze this SERP
        </Button>
        <p className="text-sm text-base-content/50">
          Uses SERP credits. Clicking any keyword row does the same thing.
        </p>
      </div>
    );
  }

  return (
    <div className="py-8 text-center text-sm text-base-content/50">
      <p>Search for keywords, then pick one to see who ranks for it.</p>
    </div>
  );
}
