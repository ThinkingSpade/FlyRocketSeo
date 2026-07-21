import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Globe2, Tags } from "lucide-react";
import { InsightIcon, InsightTile } from "@/client/components/InsightTile";
import { getProjects } from "@/serverFunctions/projects";
import {
  computeBrandedSplit,
  defaultBrandTerms,
  parseBrandTerms,
  type QueryTotals,
} from "./brandedSplit";

function formatCount(value: number): string {
  return value.toLocaleString();
}

/**
 * Branded vs non-branded split of the report's query totals. Brand terms are
 * editable (prefilled from the project domain) and recompute instantly —
 * classification is client-side over rows the report already returned.
 */
export function BrandedSplitCard({
  projectId,
  queryTotals,
}: {
  projectId: string;
  queryTotals: QueryTotals[];
}) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 60_000,
  });
  const domain =
    projectsQuery.data?.find((project) => project.id === projectId)?.domain ??
    "";

  const [termsInput, setTermsInput] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    // Prefill once from the domain stem; never clobber user edits.
    if (!touched && domain) {
      setTermsInput(defaultBrandTerms(domain).join(", "));
    }
  }, [domain, touched]);

  const split = useMemo(
    () => computeBrandedSplit(queryTotals, parseBrandTerms(termsInput)),
    [queryTotals, termsInput],
  );

  if (queryTotals.length === 0) return null;
  const share = split.brandedClickShare;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <InsightIcon icon={Tags} tone="primary" />
            Branded vs non-branded
          </h2>
          <label className="flex items-center gap-2 text-xs text-base-content/60">
            Brand terms
            <input
              type="text"
              className="input input-bordered input-xs w-56"
              placeholder="brand, brand misspelling"
              value={termsInput}
              onChange={(event) => {
                setTouched(true);
                setTermsInput(event.target.value);
              }}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <InsightTile
            icon={BadgeCheck}
            label="Branded click share"
            value={share != null ? `${Math.round(share * 100)}%` : "—"}
            tone="primary"
            hint="Of clicks in the analyzed queries"
          />
          <InsightTile
            icon={BadgeCheck}
            label="Branded"
            value={formatCount(split.branded.clicks)}
            hint={`${formatCount(split.branded.queries)} queries`}
            tone="info"
          />
          <InsightTile
            icon={Globe2}
            label="Non-branded"
            value={formatCount(split.nonBranded.clicks)}
            hint={`${formatCount(split.nonBranded.queries)} queries`}
            tone="success"
          />
          <InsightTile
            icon={Globe2}
            label="Non-branded impressions"
            value={formatCount(split.nonBranded.impressions)}
            hint="Your SEO growth surface"
          />
        </div>

        {share != null ? (
          <div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-base-200">
              <div
                className="h-full bg-primary/70"
                style={{ width: `${Math.round(share * 100)}%` }}
                title={`Branded: ${formatCount(split.branded.clicks)} clicks`}
              />
              <div
                className="h-full bg-success/60"
                style={{ width: `${100 - Math.round(share * 100)}%` }}
                title={`Non-branded: ${formatCount(split.nonBranded.clicks)} clicks`}
              />
            </div>
            <p className="mt-1 text-xs text-base-content/50">
              Non-branded clicks are the SEO-won kind — branded demand mostly
              finds you anyway.
              {split.topBranded.length > 0
                ? ` Top branded: ${split.topBranded
                    .map((row) => `“${row.query}”`)
                    .join(", ")}.`
                : ""}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
