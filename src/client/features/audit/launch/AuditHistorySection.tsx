import { Link } from "@tanstack/react-router";
import { DotsThree, Scan, Trash } from "@phosphor-icons/react";
import type { getAuditHistory } from "@/serverFunctions/audit";
import { formatDate, StatusBadge } from "@/client/features/audit/shared";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Button, buttonVariants } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { Table } from "@cloudflare/kumo/components/table";

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
          <Scan className="mx-auto size-12 opacity-30" />
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
          <Scan className="size-12 mx-auto opacity-30" />
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
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Date</Table.Head>
                <Table.Head>URL</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Pages</Table.Head>
                <Table.Head>Lighthouse</Table.Head>
                <Table.Head></Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {/* `hover` was DaisyUI's row modifier and only ever worked inside
                  `.table`; Kumo's rows have no hover of their own, so it has to
                  be a real utility now. */}
              {history.map((audit) => (
                <Table.Row
                  key={audit.id}
                  className="group hover:bg-base-200/50"
                >
                  <Table.Cell className="text-xs text-base-content/70">
                    {formatDate(audit.startedAt)}
                  </Table.Cell>
                  <Table.Cell className="max-w-[220px] truncate">
                    {/* The URL is the way in. The only other one is the
                        `View` button, which is `md:opacity-0` until the row
                        is hovered -- so on desktop a past audit looked like
                        a read-only row until you happened to sweep the
                        pointer across it. A real Link rather than a row
                        `onClick` so cmd+click and "open in new tab" work,
                        and so it is reachable by keyboard. */}
                    <Link
                      to="/p/$projectId/audit"
                      params={{ projectId }}
                      search={{ auditId: audit.id, tab: "pages" }}
                      className="app-link block truncate"
                    >
                      {audit.startUrl}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge status={audit.status} />
                  </Table.Cell>
                  <Table.Cell>
                    {audit.pagesTotal || audit.pagesCrawled}
                  </Table.Cell>
                  <Table.Cell>
                    {audit.ranLighthouse ? (
                      <Badge variant="neutral">Yes</Badge>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell>
                    <HistoryActions
                      projectId={projectId}
                      auditId={audit.id}
                      onDelete={onDelete}
                    />
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
        className={buttonVariants({ variant: "primary", size: "xs" })}
      >
        View
      </Link>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              variant="ghost"
              size="xs"
              shape="square"
              aria-label="Audit actions"
            >
              <DotsThree className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item
            variant="danger"
            icon={Trash}
            onClick={() => onDelete(auditId)}
          >
            Delete audit
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  );
}
