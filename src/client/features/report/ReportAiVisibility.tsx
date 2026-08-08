import type { BrandLookupResult } from "@/types/schemas/ai-search";
import { Table } from "@cloudflare/kumo/components/table";

/**
 * Client Report chapter: the project's AI-search visibility, read from the
 * latest stored snapshot (zero API cost). Proof, for the client, that the brand
 * shows up — or where it doesn't yet — in ChatGPT and Google AI Overview.
 */

type ReportBrandVisibility = {
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
        Run an AI brand analysis on the AI Visibility tab to include AI-search
        visibility — how ChatGPT and Google AI Overview cite this brand — in
        this report.
      </p>
    );
  }

  const sov = result.shareOfVoice;
  const sovEntries = sov
    ? sov.entries.toSorted((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0))
    : [];
  const topPages = result.topPages
    .toSorted((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0))
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
              {platform.status === "error" ? "—" : count(platform.mentions)}
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
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Brand</Table.Head>
                  <Table.Head className="text-right">AI mentions</Table.Head>
                  <Table.Head className="text-right">Share</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {sovEntries.map((entry) => (
                  <Table.Row
                    key={entry.label}
                    className={entry.isTarget ? "font-semibold" : undefined}
                  >
                    <Table.Cell>
                      {entry.label}
                      {entry.isTarget ? (
                        <span className="ml-2 text-xs font-normal text-base-content/50">
                          you
                        </span>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {count(entry.mentions)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {entry.sharePct == null
                        ? "—"
                        : `${Math.round(entry.sharePct)}%`}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </div>
      ) : null}

      {topPages.length > 0 ? (
        <div>
          <h3 className="mb-1.5 text-base font-semibold">Top cited pages</h3>
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Page</Table.Head>
                  <Table.Head>Platform</Table.Head>
                  <Table.Head className="text-right">Mentions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {topPages.map((page) => (
                  <Table.Row key={`${page.platform}-${page.url}`}>
                    <Table.Cell className="max-w-[18rem]">
                      <span className="line-clamp-1">
                        {page.domain ?? page.url}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="text-base-content/70">
                      {PLATFORM_LABEL[page.platform]}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {count(page.mentions)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
