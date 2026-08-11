import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CaretRight } from "@phosphor-icons/react";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import type { CompetitorRow } from "@/types/schemas/competitors";

/**
 * The collapsed group `groupCompetitorRows` splits out -- platforms and
 * aggregators the classifier recognised, moved out of the main table but
 * never dropped (decision 3: "moved OUT of the main table into a clearly
 * labelled, collapsed group... that the user can expand. They keep their
 * metrics; they are re-classified, not deleted"). Same precedent as
 * `CompetitorsDiscoveryNotice`'s "N domains hidden" disclosure: a non-empty
 * demoted group is always visible as a count, never silent -- this renders
 * nothing only when there is nothing to disclose (`rows.length === 0`).
 *
 * Reuses the SAME column set the main table was built with (passed in,
 * never rebuilt here) so pin/exclude/compare still work on a demoted row --
 * pinning is how an operator overrides the classifier's call (decision 4).
 */
export function CompetitorsNonCompetitorsSection({
  rows,
  columns,
}: {
  rows: CompetitorRow[];
  columns: ColumnDef<CompetitorRow>[];
}) {
  const [expanded, setExpanded] = useState(false);
  const table = useAppTable({ data: rows, columns });

  if (rows.length === 0) return null;

  return (
    <div className="border-t border-base-300">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-sm text-base-content/60 hover:bg-base-200/50"
      >
        <CaretRight
          aria-hidden="true"
          className={`size-3.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        Not competitors ({rows.length})
      </button>
      {expanded ? <AppDataTable table={table} /> : null}
    </div>
  );
}
