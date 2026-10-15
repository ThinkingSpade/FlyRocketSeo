import { Trash } from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo/components/button";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { Switch } from "@cloudflare/kumo/components/switch";
import { Table } from "@cloudflare/kumo/components/table";
import type { ProjectSubdomain } from "@/client/features/projects/useProjectSubdomains";
import { SUBDOMAIN_SOURCE_LABELS } from "@/shared/project-subdomains";

function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

function cityLabel(city: NonNullable<ProjectSubdomain["city"]>): string {
  if (city.status !== "matched" || !city.name)
    return "City site, city unresolved";
  return `City site: ${city.name}${city.stateCode ? `, ${city.stateCode}` : ""}`;
}

export function ProjectSubdomainsTable({
  subdomains,
  selected,
  allVisibleSelected,
  disabled,
  onToggleOne,
  onToggleAll,
  onSetActive,
  onRemove,
}: {
  subdomains: ProjectSubdomain[];
  selected: ReadonlySet<string>;
  allVisibleSelected: boolean;
  disabled: boolean;
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
  onSetActive: (id: string, isActive: boolean) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-base-300">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head className="w-10">
              <Checkbox
                aria-label="Select all shown subdomains"
                checked={allVisibleSelected}
                onCheckedChange={onToggleAll}
              />
            </Table.Head>
            <Table.Head>Subdomain</Table.Head>
            <Table.Head className="text-right">Traffic</Table.Head>
            <Table.Head className="text-right">Keywords</Table.Head>
            <Table.Head className="text-right">Clicks</Table.Head>
            <Table.Head className="w-24 text-center">Included</Table.Head>
            <Table.Head className="w-10" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {subdomains.map((subdomain) => (
            <Table.Row
              key={subdomain.id}
              className={subdomain.isActive ? "" : "opacity-50"}
            >
              <Table.Cell>
                <Checkbox
                  aria-label={`Select ${subdomain.host}`}
                  checked={selected.has(subdomain.id)}
                  onCheckedChange={() => onToggleOne(subdomain.id)}
                />
              </Table.Cell>
              <Table.Cell>
                <div className="font-medium">{subdomain.host}</div>
                <div className="text-xs text-base-content/50">
                  {SUBDOMAIN_SOURCE_LABELS[subdomain.source]}
                  {subdomain.city ? ` · ${cityLabel(subdomain.city)}` : null}
                </div>
              </Table.Cell>
              <Table.Cell className="text-right tabular-nums">
                {formatMetric(subdomain.organicTraffic)}
              </Table.Cell>
              <Table.Cell className="text-right tabular-nums">
                {formatMetric(subdomain.organicKeywords)}
              </Table.Cell>
              <Table.Cell className="text-right tabular-nums">
                {formatMetric(subdomain.clicks)}
              </Table.Cell>
              <Table.Cell className="text-center">
                <Switch
                  aria-label={`Include ${subdomain.host}`}
                  checked={subdomain.isActive}
                  disabled={disabled}
                  onCheckedChange={() =>
                    onSetActive(subdomain.id, !subdomain.isActive)
                  }
                />
              </Table.Cell>
              <Table.Cell>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-label={`Remove ${subdomain.host}`}
                  disabled={disabled}
                  onClick={() => onRemove(subdomain.id)}
                >
                  <Trash className="size-3.5" />
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}
