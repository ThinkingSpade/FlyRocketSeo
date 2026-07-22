import type { BrandLookupResult } from "@/types/schemas/ai-search";

/**
 * Client Report chapter: the project's AI-search visibility, read from the
 * latest stored snapshot (zero API cost). Proof, for the client, that the brand
 * shows up — or where it doesn't yet — in ChatGPT and Google AI Overview.
 */

export type ReportBrandVisibility = {
  target: string | null;
  latestCapturedOn: string | null;
  latestResult: BrandLookupResult | null;
} | null;

function count(value: number | null): string {
  return value == null ? "—" : value.toLocaleString("en-US");
}

const PLATFORM_LABEL: Record<"chat_gpt" | "google", string> = {
  chat_gpt: "ChatGPT",
  google: "Google AI Overview",
};

export function ReportAiVisibility({
  visibility,
}: {
  visibility: ReportBrandVisibility;
}) {
  const result = visibility?.latestResult ?? null;

  if (!result || !result.hasData) {
    return (
      <p className="text-sm text-base-content/60">
        Run an AI brand analysis on the Brand Lookup tab to include AI-search
        visibility — how ChatGPT and Google AI Overview cite this brand — in
        this report.
      </p>
    );
  }

  const sov = result.shareOfVoice;
  const sovEntries = sov
    ? [...sov.entries].sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0))
    : [];
  const topPages = [...result.topPages]
    .sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-base-content/80">
        As of {visibility?.latestCapturedOn ?? "the latest analysis"},{" "}
        <span className="font-semibold">{result.resolvedTarget}</span> was cited
        in an estimated{" "}
        <span className="font-semibold">{count(result.totalMentions)}</span> AI
        answers. Here is how that breaks down by platform:
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {result.perPlatform.map((platform) => (
          <div
            key={platform.platform}
            className="rounded-lg border border-base-300 bg-base-100 p-3"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
              {PLATFORM_LABEL[platform.platform]}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {platform.status === "error"
                ? "—"
                : count(platform.mentions)}
            </p>
            <p className="text-xs text-base-content/50">mentions</p>
          </div>
        ))}
      </div>

      {sovEntries.length > 0 ? (
        <div>
          <h3 className="mb-1.5 text-base font-semibold">
            Share of voice vs. competitors
          </h3>
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th className="text-right">AI mentions</th>
                  <th className="text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {sovEntries.map((entry) => (
                  <tr
                    key={entry.label}
                    className={entry.isTarget ? "font-semibold" : undefined}
                  >
                    <td>
                      {entry.label}
                      {entry.isTarget ? (
                        <span className="ml-2 text-xs font-normal text-base-content/50">
                          you
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right tabular-nums">
                      {count(entry.mentions)}
                    </td>
                    <td className="text-right tabular-nums">
                      {entry.sharePct == null
                        ? "—"
                        : `${Math.round(entry.sharePct)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {topPages.length > 0 ? (
        <div>
          <h3 className="mb-1.5 text-base font-semibold">Top cited pages</h3>
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Platform</th>
                  <th className="text-right">Mentions</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((page) => (
                  <tr key={`${page.platform}-${page.url}`}>
                    <td className="max-w-[18rem]">
                      <span className="line-clamp-1">
                        {page.domain ?? page.url}
                      </span>
                    </td>
                    <td className="text-base-content/70">
                      {PLATFORM_LABEL[page.platform]}
                    </td>
                    <td className="text-right tabular-nums">
                      {count(page.mentions)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
