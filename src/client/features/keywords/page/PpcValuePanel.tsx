import { CircleDollarSign } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import type { KeywordResearchRow } from "@/types/keywords";
import {
  buildPpcKeywords,
  totalMonthlyCost,
  type PpcVerdict,
} from "@/client/features/keywords/ppcValue";

/**
 * The paid-search read on the current result set: what this traffic would cost
 * to buy, and where earning it beats paying for it.
 *
 * Derived from the volume, CPC and difficulty already on each row, so it costs
 * nothing and needs no extra call.
 */

const LIMIT = 10;

const VERDICT_LABEL: Record<PpcVerdict, string> = {
  "rank-it": "Rank it",
  "buy-it": "Buy it",
  balanced: "Either",
};

const VERDICT_CLASS: Record<PpcVerdict, string> = {
  "rank-it": "badge-success",
  "buy-it": "badge-warning",
  balanced: "badge-ghost",
};

const VERDICT_HINT: Record<PpcVerdict, string> = {
  "rank-it": "Expensive clicks, but rankable — earning it pays back",
  "buy-it": "Cheap clicks and hard to rank — paying is the shortcut",
  balanced: "Neither lever is clearly better",
};

function usd(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function PpcValuePanel({ rows }: { rows: KeywordResearchRow[] }) {
  const keywords = buildPpcKeywords(rows, LIMIT);
  if (keywords.length === 0) return null;

  const total = totalMonthlyCost(keywords);
  const rankIt = keywords.filter((k) => k.verdict === "rank-it").length;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <InsightIcon icon={CircleDollarSign} />
          Buy vs rank
        </h3>
        <p className="text-xs text-base-content/60">
          Buying this month&rsquo;s clicks for the {keywords.length} priciest
          keywords here would cost about{" "}
          <span className="font-medium text-base-content/80">{usd(total)}</span>{" "}
          a month.
          {rankIt > 0 ? (
            <>
              {" "}
              <span className="font-medium text-base-content/80">
                {rankIt}
              </span>{" "}
              of them {rankIt === 1 ? "is" : "are"} expensive per click but
              realistic to rank for.
            </>
          ) : null}{" "}
          Costs assume a 25% click-through rate — a sizing estimate, not a
          traffic forecast.
        </p>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Keyword</th>
                <th className="text-right">Volume</th>
                <th className="text-right">CPC</th>
                <th className="text-right">Difficulty</th>
                <th className="text-right">Cost / mo</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((keyword) => (
                <tr key={keyword.keyword}>
                  <td className="max-w-xs truncate" title={keyword.keyword}>
                    {keyword.keyword}
                  </td>
                  <td className="text-right tabular-nums">
                    {keyword.searchVolume.toLocaleString()}
                  </td>
                  <td className="text-right tabular-nums">
                    ${keyword.cpc.toFixed(2)}
                  </td>
                  <td className="text-right tabular-nums text-base-content/60">
                    {keyword.keywordDifficulty ?? "—"}
                  </td>
                  <td className="text-right tabular-nums font-medium">
                    {usd(keyword.monthlyCostUsd)}
                  </td>
                  <td>
                    <span
                      className={`badge badge-sm ${VERDICT_CLASS[keyword.verdict]}`}
                      title={VERDICT_HINT[keyword.verdict]}
                    >
                      {VERDICT_LABEL[keyword.verdict]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
