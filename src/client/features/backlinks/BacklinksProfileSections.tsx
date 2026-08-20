import { Pulse, Wrench } from "@phosphor-icons/react";
import { InsightIcon } from "@/client/components/InsightTile";
import type { BacklinksOverviewResult } from "@/types/schemas/backlinks-results";
import { computeLinkVelocity } from "./linkVelocity";
import {
  countLinksAtStake,
  findReclaimTargets,
  type ReclaimTarget,
} from "./brokenPageReclaim";
import type { BacklinksTopPagesData } from "./backlinksPageTypes";
import { Table } from "@cloudflare/kumo/components/table";
import { formatBreakdownNumber as formatNumber } from "./backlinksProfileFormat";

/**
 * Two reads on the link profile the underlying calls already paid for: whether
 * the profile is growing, and which dead pages are still holding links. The
 * six composition breakdowns live in BacklinksBreakdownCards.
 */

const RECLAIM_LIMIT = 8;

export function LinkVelocityCard({
  trends,
}: {
  trends: BacklinksOverviewResult["newLostTrends"];
}) {
  const velocity = computeLinkVelocity(trends);
  if (!velocity) return null;

  const tone =
    velocity.direction === "growing"
      ? "text-success"
      : velocity.direction === "shrinking"
        ? "text-error"
        : "text-base-content/70";
  const headline =
    velocity.direction === "growing"
      ? "Gaining links"
      : velocity.direction === "shrinking"
        ? "Losing links"
        : "Holding steady";
  const sign = velocity.netPerMonth > 0 ? "+" : "";

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <InsightIcon icon={Pulse} />
          Link velocity
        </h3>
        <p className={`text-lg font-semibold ${tone}`}>
          {headline} ·{" "}
          <span className="tabular-nums">
            {sign}
            {formatNumber(velocity.netPerMonth, 1)}
          </span>{" "}
          <span className="text-sm font-normal text-base-content/60">
            referring domains / month
          </span>
        </p>
        <p className="text-xs text-base-content/60">
          Net of{" "}
          <span className="tabular-nums">
            {formatNumber(velocity.gainedPerMonth, 1)}
          </span>{" "}
          won against{" "}
          <span className="tabular-nums">
            {formatNumber(velocity.lostPerMonth, 1)}
          </span>{" "}
          lost each month, averaged over {velocity.months}{" "}
          {velocity.months === 1 ? "month" : "months"}.
          {velocity.latestNet != null ? (
            <>
              {" "}
              Last month was{" "}
              <span className="tabular-nums">
                {velocity.latestNet > 0 ? "+" : ""}
                {formatNumber(velocity.latestNet)}
              </span>
              .
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export function BrokenLinkReclaimCard({
  topPages,
}: {
  topPages: BacklinksTopPagesData | undefined;
}) {
  // Read off the Top Pages rows already fetched; nothing here spends.
  const targets: ReclaimTarget[] = findReclaimTargets(
    topPages?.rows ?? [],
    RECLAIM_LIMIT,
  );
  if (targets.length === 0) return null;
  const atStake = countLinksAtStake(targets);

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <InsightIcon icon={Wrench} />
          Broken pages worth reclaiming
        </h3>
        <p className="text-xs text-base-content/60">
          These pages still receive links but are broken.{" "}
          <span className="font-medium text-base-content/80">
            {formatNumber(atStake)}
          </span>{" "}
          {atStake === 1 ? "link is" : "links are"} recoverable by redirecting
          them — the links are already earned, so no outreach is needed.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Page</Table.Head>
                <Table.Head className="text-right">Broken links</Table.Head>
                <Table.Head className="text-right">Total links</Table.Head>
                <Table.Head className="text-right">Ref. domains</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {targets.map((target) => (
                <Table.Row key={target.page}>
                  <Table.Cell className="max-w-md truncate" title={target.page}>
                    {target.page}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums font-medium">
                    {formatNumber(target.brokenBacklinks)}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums text-base-content/60">
                    {target.totalBacklinks != null
                      ? formatNumber(target.totalBacklinks)
                      : "—"}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums text-base-content/60">
                    {target.referringDomains != null
                      ? formatNumber(target.referringDomains)
                      : "—"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </div>
    </div>
  );
}
