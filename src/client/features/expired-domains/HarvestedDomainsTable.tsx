import { Table } from "@cloudflare/kumo/components/table";
import { DomainVetLinks } from "@/client/features/expired-domains/DomainVetLinks";
import { formatHarvestAvailabilityAge } from "@/shared/harvestAvailability";

type HarvestedDomainRow = {
  domain: string;
  matchedTerm: string;
  droppedOn: string;
  domainRating: number | null;
  isAvailable: boolean | null;
  availabilityCheckedAt: string | null;
};

function ratingLabel(rating: number | null): string {
  // null is NOT YET GRADED, not "no authority" -- a real 0 shows as 0.
  return rating === null ? "—" : String(rating);
}

function availabilityLabel(
  value: boolean | null,
  checkedAtIso: string | null,
): string {
  if (value === null) return checkedAtIso === null ? "Not checked" : "Unknown";
  return value ? "Available" : "Taken";
}

/**
 * The harvested shortlist itself. Kumo's Table rather than a bare `table`
 * class: that class came from a CSS library this app no longer ships, so its
 * cells had no padding and adjacent columns ran into each other.
 */
export function HarvestedDomainsTable({
  rows,
  nowMs,
}: {
  rows: HarvestedDomainRow[];
  nowMs: number;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Domain</Table.Head>
            <Table.Head className="text-right">DR</Table.Head>
            <Table.Head>Availability</Table.Head>
            <Table.Head>Matched</Table.Head>
            <Table.Head>Dropped</Table.Head>
            <Table.Head>Research</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => {
            const checkedAge = formatHarvestAvailabilityAge(
              row.availabilityCheckedAt,
              nowMs,
            );
            return (
              <Table.Row key={row.domain}>
                <Table.Cell className="font-medium">{row.domain}</Table.Cell>
                <Table.Cell
                  className="text-right tabular-nums"
                  title={
                    row.domainRating === null ? "Not graded yet" : undefined
                  }
                >
                  {ratingLabel(row.domainRating)}
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col">
                    <span>
                      {availabilityLabel(
                        row.isAvailable,
                        row.availabilityCheckedAt,
                      )}
                    </span>
                    {checkedAge ? (
                      <time
                        dateTime={row.availabilityCheckedAt ?? undefined}
                        title={row.availabilityCheckedAt ?? undefined}
                        className="text-xs text-base-content/60"
                      >
                        Checked {checkedAge}
                      </time>
                    ) : null}
                  </div>
                </Table.Cell>
                <Table.Cell className="text-base-content/70">
                  {row.matchedTerm}
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap text-base-content/70">
                  {row.droppedOn}
                </Table.Cell>
                <Table.Cell>
                  <DomainVetLinks domain={row.domain} />
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table>
    </div>
  );
}
