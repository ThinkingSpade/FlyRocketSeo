type Analysis = {
  url: string;
  title: string;
  h2: string[];
};

/** Expandable per-competitor section structure — how each ranking page
 *  actually organizes the topic. */
export function CompetitorOutlines({ analyses }: { analyses: Analysis[] }) {
  const withOutlines = analyses.filter((analysis) => analysis.h2.length > 0);
  if (withOutlines.length === 0) return null;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
        <h2 className="text-sm font-semibold">Competitor outlines</h2>
        <p className="text-xs text-base-content/60">
          The exact section structure of each ranking page — expand one to see
          how they organize the topic.
        </p>
        {withOutlines.map((analysis) => (
          <details
            key={analysis.url}
            className="rounded-lg border border-base-300 px-3 py-2"
          >
            <summary className="cursor-pointer text-sm font-medium">
              {analysis.title || analysis.url}
              <span className="ml-2 text-xs font-normal text-base-content/50">
                {analysis.h2.length} sections
              </span>
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-base-content/70">
              {analysis.h2.map((heading) => (
                <li key={heading}>{heading}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}
