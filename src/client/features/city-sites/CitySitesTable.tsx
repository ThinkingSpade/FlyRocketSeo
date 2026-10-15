import { ArrowSquareOut, MapPin, PencilSimple } from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo/components/button";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { Table } from "@cloudflare/kumo/components/table";
import type { CitySiteRow } from "@/server/features/city-sites/repositories/CitySiteRepository";
import type { HostPerformance } from "@/shared/city-subdomains/hostPerformance";
import { CITY_SITE_STATUS_META, formatCityLabel } from "./citySiteStatus";

const integerFormatter = new Intl.NumberFormat();

/**
 * "Search Console reported nothing for this host", which is NOT zero.
 *
 * A city can be missing from the report because it genuinely had no
 * impressions, or because the pull was truncated before reaching it — GSC
 * returns rows by clicks descending. Printing "0" would assert the first when
 * only the page-level notice can tell them apart.
 */
function NoDataMark() {
  return (
    <span className="text-base-content/30" title="No data in this period">
      –
    </span>
  );
}

function NoData({ value }: { value: number | undefined }) {
  if (value == null) return <NoDataMark />;
  return <>{integerFormatter.format(value)}</>;
}

/**
 * The registry itself, with each city's Search Console performance beside it.
 *
 * Deliberately shows the LOCATION CODE alongside the city name. It looks like
 * an internal detail, but it is the value every per-city question is actually
 * asked with, and an operator checking why one city's data looks wrong needs
 * to be able to see it without opening the database.
 *
 * The performance columns distinguish three states that a naive table would
 * collapse into "0": Search Console is not connected (no column content at
 * all), it is connected but reported nothing for this host, and it reported a
 * real zero. Only the last is a number.
 */
export function CitySitesTable({
  rows,
  performanceByHost,
  performanceConnected,
  selectedIds,
  onToggle,
  onToggleAll,
  onFix,
}: {
  rows: CitySiteRow[];
  performanceByHost: ReadonlyMap<string, HostPerformance>;
  performanceConnected: boolean;
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onFix: (row: CitySiteRow) => void;
}) {
  const allSelected =
    rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  return (
    <div className="overflow-x-auto">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head className="w-8">
              <Checkbox
                aria-label="Select all rows on this page"
                checked={allSelected}
                onCheckedChange={onToggleAll}
              />
            </Table.Head>
            <Table.Head>Hostname</Table.Head>
            <Table.Head>City</Table.Head>
            <Table.Head className="w-28">Location code</Table.Head>
            {performanceConnected ? (
              <>
                <Table.Head className="w-20 text-right">Clicks</Table.Head>
                <Table.Head className="w-24 text-right">Impressions</Table.Head>
                <Table.Head className="w-20 text-right">Position</Table.Head>
              </>
            ) : null}
            <Table.Head className="w-32">Status</Table.Head>
            <Table.Head className="w-16" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => {
            const meta = CITY_SITE_STATUS_META[row.matchStatus];
            const city = formatCityLabel(row.cityName, row.stateCode);
            const performance = performanceByHost.get(row.host);
            return (
              <Table.Row key={row.id} className="hover:bg-base-200/60">
                <Table.Cell>
                  <Checkbox
                    aria-label={`Select ${row.host}`}
                    checked={selectedIds.has(row.id)}
                    onCheckedChange={() => onToggle(row.id)}
                  />
                </Table.Cell>
                <Table.Cell>
                  <a
                    href={`https://${row.host}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary"
                  >
                    {row.host}
                    <ArrowSquareOut className="size-3 shrink-0 text-base-content/30" />
                  </a>
                </Table.Cell>
                <Table.Cell className="text-sm">
                  {city ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0 text-base-content/35" />
                      {city}
                      {row.matchSource === "manual" ? (
                        <span
                          className="text-xs text-base-content/40"
                          title="Set by hand, so automatic matching will not overwrite it"
                        >
                          (manual)
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-base-content/35">—</span>
                  )}
                </Table.Cell>
                <Table.Cell className="tabular-nums text-xs text-base-content/60">
                  {row.locationCode ?? "—"}
                </Table.Cell>
                {performanceConnected ? (
                  <>
                    <Table.Cell className="text-right tabular-nums text-sm">
                      <NoData value={performance?.clicks} />
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums text-sm text-base-content/70">
                      <NoData value={performance?.impressions} />
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums text-sm text-base-content/70">
                      {performance?.position == null ? (
                        <NoDataMark />
                      ) : (
                        performance.position.toFixed(1)
                      )}
                    </Table.Cell>
                  </>
                ) : null}
                <Table.Cell>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}
                    title={meta.description}
                  >
                    {meta.label}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onFix(row)}
                    aria-label={`Set location for ${row.host}`}
                  >
                    <PencilSimple className="size-3.5" />
                  </Button>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table>
    </div>
  );
}
