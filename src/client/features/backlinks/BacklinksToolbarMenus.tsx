import { useState } from "react";
import {
  CalendarX,
  CaretDown,
  Download,
  Gauge,
  DotsThree,
  Table,
} from "@phosphor-icons/react";
import type { CsvValue } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import { exportBacklinksTabCsv } from "./export";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Button } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";

export function BacklinksExportMenu({
  activeTab,
  exportTarget,
  headers,
  rows,
}: {
  activeTab: BacklinksSearchState["tab"];
  exportTarget: string;
  headers: string[];
  rows: CsvValue[][];
}) {
  const [isExportingSheets, setIsExportingSheets] = useState(false);
  const canExport = rows.length > 0 && !isExportingSheets;

  const handleExportToSheets = async () => {
    if (!canExport) return;
    setIsExportingSheets(true);
    try {
      await exportTableToSheets({
        headers,
        rows,
        feature: `backlinks_${activeTab}`,
      });
    } finally {
      setIsExportingSheets(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={rows.length === 0}
            aria-label="Export backlinks table"
          >
            <Download className="size-4" />
            Export
            <CaretDown className="size-3 opacity-60" />
          </Button>
        }
      />
      <DropdownMenu.Content align="end" className="w-56">
        <DropdownMenu.Item
          // A conditional icon has to be an element, and Kumo only injects its
          // own `mr-2` for components — so the gap is supplied here instead.
          icon={
            <span className="mr-2 inline-flex">
              {isExportingSheets ? (
                <Loader size="sm" />
              ) : (
                <Table className="size-4" />
              )}
            </span>
          }
          disabled={!canExport}
          onClick={() => void handleExportToSheets()}
        >
          Export to Sheets
        </DropdownMenu.Item>
        <DropdownMenu.Item
          icon={Download}
          onClick={() =>
            exportBacklinksTabCsv({
              tab: activeTab,
              target: exportTarget,
              headers,
              rows,
            })
          }
        >
          Export CSV
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

export function BacklinksActionsMenu({
  isLoadingRatings,
  loadRatings,
  ratableDomains,
  isLoadingExpiry,
  loadExpirations,
  billableExpiryDomains,
}: {
  isLoadingRatings: boolean;
  loadRatings: (domains: string[]) => void | Promise<void>;
  ratableDomains: string[];
  isLoadingExpiry: boolean;
  loadExpirations: (domains: string[]) => void | Promise<void>;
  /** How many domains on THIS page would actually be billed. */
  billableExpiryDomains: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="Backlinks table actions"
            title="Backlinks table actions"
          >
            <DotsThree className="size-4" />
          </Button>
        }
      />
      <DropdownMenu.Content align="end" className="w-52">
        <DropdownMenu.Item
          icon={
            <span className="mr-2 inline-flex">
              {isLoadingRatings ? (
                <Loader size="sm" />
              ) : (
                <Gauge className="size-4" />
              )}
            </span>
          }
          disabled={isLoadingRatings}
          onClick={() => void loadRatings(ratableDomains)}
        >
          Ahrefs DR
        </DropdownMenu.Item>
        {/* Unlike Ahrefs DR above -- free and keyless, so it may keep enriching
            as you page -- this bills 5 APIVerve credits per domain. It is
            therefore per page: the count is what THIS click costs, and it
            drops to zero (disabling the item) once the page is covered. */}
        <DropdownMenu.Item
          icon={
            <span className="mr-2 inline-flex">
              {isLoadingExpiry ? (
                <Loader size="sm" />
              ) : (
                <CalendarX className="size-4" />
              )}
            </span>
          }
          disabled={isLoadingExpiry || billableExpiryDomains === 0}
          onClick={() => void loadExpirations(ratableDomains)}
        >
          {billableExpiryDomains === 0
            ? "Domain expiry (this page done)"
            : `Domain expiry (${billableExpiryDomains} × 5 credits)`}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
