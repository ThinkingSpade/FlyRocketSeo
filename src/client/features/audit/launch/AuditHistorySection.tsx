import { Link } from "@tanstack/react-router";
import { MoreHorizontal, ScanSearch, Trash2 } from "lucide-react";
import type { getAuditHistory } from "@/serverFunctions/audit";
import { formatDate, StatusBadge } from "@/client/features/audit/shared";
import { Badge } from "@cloudflare/kumo/components/badge";

export function AuditHistorySection({
  projectId,
  history,
  isLoading,
  loadFailed = false,
  onDelete,
}: {
  projectId: string;
  history: Awaited<ReturnType<typeof getAuditHistory>>;
  isLoading: boolean;
  /** The history request failed. Distinct from having no audits: one means
   *  the list could not be read, the other that none have been run. */
  loadFailed?: boolean;
  onDelete: (auditId: string) => void;
}) {
  // Before the empty state, always. A failed read also has zero rows, and
  // "No audits yet" tells someone with a year of history that they have never
  // run one -- then invites them to spend on a fresh audit to fix it.
  if (loadFailed && history.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="space-y-2 text-center text-base-content/50">
          <ScanSearch className="mx-auto size-12 opacity-30" />
          <p className="text-sm font-medium">
            Previous audits could not be loaded
          </p>
          <p className="text-sm">
            Any audits you have run are still there — only this list failed.
          </p>
        </div>
      </div>
    );
  }

  if (history.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center text-base-content/40 space-y-3">
          <ScanSearch className="size-12 mx-auto opacity-30" />
          <p className="text-lg font-medium">No audits yet</p>
        </div>
      </div>
    );
  }

  if (history.length === 0) return null;

  return (
    <div className="relative flex flex-col rounded-xl bg-base-100 border border-base-300">
      <div className="flex flex-auto flex-col gap-3 p-6 text-sm">
        <h2 className="text-base font-semibold">Previous Audits</h2>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>URL</th>
                <th>Status</th>
                <th>Pages</th>
                <th>Lighthouse</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((audit) => (
                <tr key={audit.id} className="hover group">
                  <td className="text-xs text-base-content/70">
                    {formatDate(audit.startedAt)}
                  </td>
                  <td className="max-w-[220px] truncate">{audit.startUrl}</td>
                  <td>
                    <StatusBadge status={audit.status} />
                  </td>
                  <td>{audit.pagesTotal || audit.pagesCrawled}</td>
                  <td>
                    {audit.ranLighthouse ? (
                      <Badge variant="neutral">Yes</Badge>
                    ) : null}
                  </td>
                  <td>
                    <HistoryActions
                      projectId={projectId}
                      auditId={audit.id}
                      onDelete={onDelete}
                    />
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

function HistoryActions({
  projectId,
  auditId,
  onDelete,
}: {
  projectId: string;
  auditId: string;
  onDelete: (auditId: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
      <Link
        to="/p/$projectId/audit"
        params={{ projectId }}
        search={{ auditId, tab: "pages" }}
        className="btn btn-primary btn-xs"
      >
        View
      </Link>
      <div className="dropdown dropdown-end">
        <div
          tabIndex={0}
          role="button"
          className="btn btn-ghost btn-xs btn-square"
          aria-label="Audit actions"
        >
          <MoreHorizontal className="size-3.5" />
        </div>
        <ul
          tabIndex={0}
          className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-40"
        >
          <li>
            <button
              className="text-error"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(auditId);
              }}
            >
              <Trash2 className="size-3.5" />
              Delete audit
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
