import {
  Download,
  Network,
  Plus,
  UsersThree,
  Target,
} from "@phosphor-icons/react";
import { InsightIcon } from "@/client/components/InsightTile";
import { describeSpamScore } from "@/client/lib/spamScore";
import { exportLinkGap } from "./exportLinkGap";
import type {
  CompetingDomainsResult,
  LinkIntersectResult,
  ReferringNetworksResult,
} from "@/types/schemas/backlinks-compare";
import { Button } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Table } from "@cloudflare/kumo/components/table";

/**
 * The three competitive drill-downs that sit under the comparison table: who
 * links to your rivals but not to you, who shares your link profile, and
 * whether your links cluster onto a handful of networks.
 *
 * Each one is a separate metered call behind its own button.
 */

/** Half a profile inside three subnets is the shape a link network leaves. */
const NETWORK_CONCENTRATION_WARNING = 0.5;
/** Below this many subnets the top-three share is trivially high, not risky. */
const MIN_NETWORKS_TO_JUDGE = 4;
const NETWORK_PREVIEW_LIMIT = 10;

function formatNumber(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

function SpamScoreValue({ value }: { value: number | null }) {
  const spam = describeSpamScore(value);
  return (
    <span
      className={`${spam.reviewRecommended ? "font-medium " : ""}${spam.className}`}
    >
      {spam.formatted}
    </span>
  );
}

function CardShell({
  title,
  description,
  icon,
  action,
  errorMessage,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Target;
  action?: React.ReactNode;
  errorMessage?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <InsightIcon icon={icon} />
              {title}
            </h3>
            <p className="text-xs text-base-content/55">{description}</p>
          </div>
          {action}
        </div>
        {errorMessage ? (
          <Banner variant="error" className="py-2 text-sm">
            {errorMessage}
          </Banner>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function LinkIntersectCard({
  result,
  errorMessage,
  isLoading,
  target,
  onPageChange,
}: {
  result: LinkIntersectResult | undefined;
  errorMessage: string | null;
  isLoading: boolean;
  target: string;
  onPageChange: (page: number) => void;
}) {
  const rows = result?.rows ?? [];
  const competitorCount = result?.competitors.length ?? 0;

  return (
    <CardShell
      title="Link gap"
      description="Sites that link to your competitors but not to you — the shortest list of realistic link prospects there is."
      icon={Target}
      errorMessage={errorMessage}
      action={
        rows.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => exportLinkGap(rows, target)}
          >
            <Download className="size-3.5" />
            CSV
          </Button>
        ) : null
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader size="base" />
        </div>
      ) : null}

      {!isLoading && result && rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-base-content/60">
          No gap found — every domain linking to these competitors already links
          to you.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Referring domain</Table.Head>
                  <Table.Head className="text-right">Links to</Table.Head>
                  <Table.Head className="text-right">
                    Domain authority
                  </Table.Head>
                  <Table.Head className="text-right">Backlinks</Table.Head>
                  <Table.Head className="text-right">Spam</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => (
                  <Table.Row key={row.domain}>
                    <Table.Cell
                      className="max-w-xs truncate"
                      title={row.domain}
                    >
                      {row.domain}
                    </Table.Cell>
                    <Table.Cell
                      className="text-right tabular-nums"
                      title={row.linkedTo.join(", ")}
                    >
                      <span
                        className={
                          row.competitorsLinked > 1
                            ? "font-semibold"
                            : "text-base-content/60"
                        }
                      >
                        {row.competitorsLinked} of {competitorCount}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(row.rank)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums text-base-content/60">
                      {formatNumber(row.backlinks)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      <SpamScoreValue value={row.spamScore} />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-base-content/50">
              A domain linking to more than one competitor has already shown it
              will link to sites like yours.
            </p>
            <div className="flex items-center gap-2">
              {/* Each page is a fresh lookup, so say so next to the control
                  that triggers one rather than letting it read as free. */}
              <span className="text-xs text-base-content/40">
                Page {result?.page ?? 1} · each page is a new lookup
              </span>
              <div className="inline-flex items-stretch">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className=""
                  disabled={(result?.page ?? 1) <= 1 || isLoading}
                  onClick={() => onPageChange((result?.page ?? 1) - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className=""
                  disabled={!result?.hasMore || isLoading}
                  onClick={() => onPageChange((result?.page ?? 1) + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </CardShell>
  );
}

export function CompetingDomainsCard({
  result,
  errorMessage,
  isLoading,
  hasRun,
  competitors,
  onRun,
  onAdd,
}: {
  result: CompetingDomainsResult | undefined;
  errorMessage: string | null;
  isLoading: boolean;
  hasRun: boolean;
  competitors: string[];
  onRun: () => void;
  onAdd: (domain: string) => boolean;
}) {
  const rows = result?.rows ?? [];

  return (
    <CardShell
      title="Who competes for your links"
      description="Sites sharing the most referring domains with you. These are the rivals worth comparing against, whether or not they rank for the same keywords."
      icon={UsersThree}
      errorMessage={errorMessage}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isLoading}
          onClick={onRun}
        >
          {isLoading ? <Loader size="sm" /> : null}
          {hasRun ? "Refresh" : "Find them"}
        </Button>
      }
    >
      {!hasRun ? (
        <p className="text-xs text-base-content/50">
          One lookup. Results can be added straight into the comparison above.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y divide-base-200">
          {rows.map((row) => (
            <li
              key={row.domain}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.domain}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-base-content/55">
                {formatNumber(row.intersections)} shared · Domain authority{" "}
                {formatNumber(row.rank)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={competitors.includes(row.domain)}
                onClick={() => onAdd(row.domain)}
              >
                <Plus className="size-3" />
                {competitors.includes(row.domain) ? "Added" : "Compare"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {hasRun && !isLoading && result && rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-base-content/60">
          No overlapping link profiles found for this domain.
        </p>
      ) : null}
    </CardShell>
  );
}

export function ReferringNetworksCard({
  result,
  errorMessage,
  isLoading,
  hasRun,
  onRun,
}: {
  result: ReferringNetworksResult | undefined;
  errorMessage: string | null;
  isLoading: boolean;
  hasRun: boolean;
  onRun: () => void;
}) {
  const rows = result?.rows.slice(0, NETWORK_PREVIEW_LIMIT) ?? [];
  // Only a complete listing supports a claim about the profile. On a truncated
  // page the top three necessarily dominate their own sample, so calling that
  // a link network would flag every large, perfectly healthy profile.
  const canJudge =
    result != null &&
    result.isComplete &&
    result.rows.length >= MIN_NETWORKS_TO_JUDGE;
  const concentrated =
    canJudge && result.topThreeShare >= NETWORK_CONCENTRATION_WARNING;

  return (
    <CardShell
      title="Referring networks"
      description="Your referring links grouped by the subnet they are hosted on. Links spread across many networks look earned; links piled into a few look bought."
      icon={Network}
      errorMessage={errorMessage}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isLoading}
          onClick={onRun}
        >
          {isLoading ? <Loader size="sm" /> : null}
          {hasRun ? "Refresh" : "Check networks"}
        </Button>
      }
    >
      {!hasRun ? (
        <p className="text-xs text-base-content/50">
          One lookup. Surfaces link-network risk no per-domain view can show.
        </p>
      ) : null}

      {result && rows.length > 0 ? (
        <>
          <p
            className={`text-sm ${concentrated ? "text-warning" : "text-base-content/70"}`}
          >
            {canJudge ? (
              <>
                {Math.round(result.topThreeShare * 100)}% of referring domains
                sit in the three largest subnets
                {concentrated
                  ? " — that concentration is the footprint a link network leaves."
                  : ", which is a healthy spread."}
              </>
            ) : (
              <>
                Showing the largest networks behind this profile. There are more
                than fit in one lookup, so the split below describes these
                networks rather than the profile as a whole.
              </>
            )}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Subnet</Table.Head>
                  <Table.Head className="text-right">
                    Referring domains
                  </Table.Head>
                  <Table.Head className="text-right">Backlinks</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => (
                  <Table.Row key={row.networkAddress}>
                    <Table.Cell className="tabular-nums">
                      {row.networkAddress}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(row.referringDomains)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums text-base-content/60">
                      {formatNumber(row.backlinks)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </>
      ) : null}

      {hasRun && !isLoading && result && result.rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-base-content/60">
          No network data returned for this domain.
        </p>
      ) : null}
    </CardShell>
  );
}
