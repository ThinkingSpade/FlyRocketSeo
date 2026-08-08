import { FileText, Printer } from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";

/**
 * The on-screen controls above the report. Carries `report-no-print` so it
 * disappears from the printed deliverable — only the report itself prints.
 */
export function ReportToolbar({
  preparedBy,
  agency,
  onPreparedByChange,
  onAgencyChange,
}: {
  preparedBy: string;
  agency: string;
  onPreparedByChange: (value: string) => void;
  onAgencyChange: (value: string) => void;
}) {
  return (
    <div className="report-no-print mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FileText className="size-6" />
          Client Report
        </h1>
        <p className="text-sm text-base-content/60">
          A client-ready summary of everything this project&apos;s data says.
          Print it (or Save as PDF) and send it.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="form-control">
          <span className="text-xs text-base-content/60">Prepared by</span>
          <Input
            passwordManagerIgnore
            size="sm"
            className="w-40"
            value={preparedBy}
            placeholder="Your name"
            onChange={(event) => onPreparedByChange(event.target.value)}
          />
        </label>
        <label className="form-control">
          <span className="text-xs text-base-content/60">Agency</span>
          <Input
            passwordManagerIgnore
            size="sm"
            className="w-40"
            value={agency}
            placeholder="Company name"
            onChange={(event) => onAgencyChange(event.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => window.print()}
        >
          <Printer className="size-4" /> Print / Save PDF
        </Button>
      </div>
    </div>
  );
}
