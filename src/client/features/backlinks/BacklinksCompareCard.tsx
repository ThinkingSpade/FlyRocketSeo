import { useState } from "react";
import { Plus, Swords, X } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import { MAX_COMPARE_COMPETITORS } from "@/types/schemas/backlinks-compare";
import type {
  BacklinksCompareResult,
  BacklinksComparisonRow,
} from "@/types/schemas/backlinks-compare";
import { Button } from "@cloudflare/kumo/components/button";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Input } from "@cloudflare/kumo/components/input";

/**
 * "You vs them" for the link profile. The whole table comes from five `bulk_*`
 * calls that each cover every target at once, so a fourth competitor costs the
 * same as the first.
 *
 * Nothing fires until Compare is pressed, and editing the chips afterwards
 * drops the authorization rather than refetching.
 */

function formatNumber(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

function formatSigned(value: number | null): string {
  if (value == null) return "—";
  const rounded = Math.round(value);
  return rounded > 0
    ? `+${rounded.toLocaleString()}`
    : rounded.toLocaleString();
}

function CompetitorChips({
  competitors,
  onRemove,
}: {
  competitors: string[];
  onRemove: (value: string) => void;
}) {
  if (competitors.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {competitors.map((competitor) => (
        <Badge
          key={competitor}
          variant="outline"
          className="gap-1 py-2.5 font-normal"
        >
          {competitor}
          <button
            type="button"
            className="opacity-60 hover:opacity-100"
            onClick={() => onRemove(competitor)}
            aria-label={`Remove ${competitor}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

function CompetitorInput({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (value: string) => boolean;
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (onAdd(draft)) setDraft("");
  };

  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        type="text"
        size="sm"
        className="min-w-0 flex-1"
        placeholder={
          disabled
            ? `Up to ${MAX_COMPARE_COMPETITORS} competitors`
            : "competitor.com"
        }
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Competitor domain"
      />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={disabled || draft.trim() === ""}
      >
        <Plus className="size-4" />
        Add
      </Button>
    </form>
  );
}

/**
 * Ranks a row against the strongest value in the column so a glance shows the
 * spread, not just the numbers. Bigger is better for every column this is used
 * on, so a full bar always means "leading".
 */
function ComparisonBar({ value, max }: { value: number | null; max: number }) {
  if (value == null || max <= 0) return null;
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-base-200">
      <div
        className="h-full rounded-full bg-primary/60"
        style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
      />
    </div>
  );
}

function ComparisonTable({ result }: { result: BacklinksCompareResult }) {
  const maxDomains = Math.max(
    ...result.rows.map((row) => row.referringDomains ?? 0),
    0,
  );
  const maxBacklinks = Math.max(
    ...result.rows.map((row) => row.backlinks ?? 0),
    0,
  );

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Domain</th>
            <th className="text-right">DR</th>
            <th className="text-right">Referring domains</th>
            <th className="text-right">Backlinks</th>
            <th className="text-right">Spam</th>
            <th className="text-right">Net ref. domains</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <ComparisonTableRow
              key={row.target}
              row={row}
              maxDomains={maxDomains}
              maxBacklinks={maxBacklinks}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonTableRow({
  row,
  maxDomains,
  maxBacklinks,
}: {
  row: BacklinksComparisonRow;
  maxDomains: number;
  maxBacklinks: number;
}) {
  return (
    <tr className={row.isYou ? "bg-base-200/50" : undefined}>
      <td className="max-w-xs truncate" title={row.target}>
        <span className={row.isYou ? "font-semibold" : undefined}>
          {row.target}
        </span>
        {row.isYou ? (
          <span className="ml-1.5 text-xs text-base-content/50">you</span>
        ) : null}
      </td>
      <td className="text-right tabular-nums">{formatNumber(row.rank)}</td>
      <td className="text-right tabular-nums">
        {formatNumber(row.referringDomains)}
        <ComparisonBar value={row.referringDomains} max={maxDomains} />
      </td>
      <td className="text-right tabular-nums">
        {formatNumber(row.backlinks)}
        <ComparisonBar value={row.backlinks} max={maxBacklinks} />
      </td>
      <td className="text-right tabular-nums">
        <span
          className={
            row.spamScore != null && row.spamScore >= 40
              ? "font-medium text-error"
              : "text-base-content/60"
          }
        >
          {formatNumber(row.spamScore)}
        </span>
      </td>
      <td className="text-right tabular-nums">
        <span
          className={
            row.netReferringDomains == null
              ? undefined
              : row.netReferringDomains > 0
                ? "text-success"
                : row.netReferringDomains < 0
                  ? "text-error"
                  : undefined
          }
        >
          {formatSigned(row.netReferringDomains)}
        </span>
      </td>
    </tr>
  );
}

function ComparisonVerdict({ result }: { result: BacklinksCompareResult }) {
  if (result.yourPosition == null || result.totalTargets < 2) return null;

  const yourRow = result.rows.find((row) => row.isYou);
  const leading = result.yourPosition === 1;
  // Position is competition-ranked, so first place can be shared. Saying "you
  // lead" when a rival is level would overstate it.
  const tiedForFirst =
    leading &&
    result.rows.filter(
      (row) => row.referringDomains === yourRow?.referringDomains,
    ).length > 1;

  return (
    <p
      className={`text-sm ${leading ? "text-success" : "text-base-content/70"}`}
    >
      {tiedForFirst ? (
        <>
          You are level at the top on referring domains, across{" "}
          {result.totalTargets} sites compared.
        </>
      ) : leading ? (
        <>
          You lead this group on referring domains, across {result.totalTargets}{" "}
          sites compared.
        </>
      ) : (
        <>
          You rank{" "}
          <span className="font-semibold text-base-content">
            #{result.yourPosition} of {result.totalTargets}
          </span>{" "}
          on referring domains
          {result.gapToLeader != null && result.leader ? (
            <>
              {" "}
              — {formatNumber(result.gapToLeader)} behind {result.leader}
            </>
          ) : null}
          .
        </>
      )}
    </p>
  );
}

export function BacklinksCompareCard({
  competitors,
  result,
  errorMessage,
  isLoading,
  hasCompared,
  canCompare,
  onAdd,
  onRemove,
  onCompare,
}: {
  competitors: string[];
  result: BacklinksCompareResult | undefined;
  errorMessage: string | null;
  isLoading: boolean;
  hasCompared: boolean;
  canCompare: boolean;
  onAdd: (value: string) => boolean;
  onRemove: (value: string) => void;
  onCompare: () => void;
}) {
  const atLimit = competitors.length >= MAX_COMPARE_COMPETITORS;

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <InsightIcon icon={Swords} />
            Compare against competitors
          </h3>
          <p className="text-xs text-base-content/55">
            Put this link profile side by side with up to{" "}
            {MAX_COMPARE_COMPETITORS} rivals. Comparing runs a fixed set of
            lookups that each cover every domain at once, so a fourth competitor
            costs no more than the first.
          </p>
        </div>

        <CompetitorChips competitors={competitors} onRemove={onRemove} />
        <CompetitorInput disabled={atLimit} onAdd={onAdd} />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canCompare || isLoading}
            onClick={onCompare}
          >
            {isLoading ? <Loader size="sm" /> : null}
            {hasCompared ? "Compare again" : "Compare"}
          </Button>
          {competitors.length === 0 ? (
            <span className="text-xs text-base-content/50">
              Add a competitor domain to enable the comparison.
            </span>
          ) : null}
        </div>

        {errorMessage ? (
          <Banner variant="error" className="py-2 text-sm">
            {errorMessage}
          </Banner>
        ) : null}

        {result && result.rows.length > 0 ? (
          <>
            <ComparisonVerdict result={result} />
            <ComparisonTable result={result} />
            <p className="text-xs text-base-content/40">
              Net referring domains counts what each site won minus what it lost
              since {result.since}.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
