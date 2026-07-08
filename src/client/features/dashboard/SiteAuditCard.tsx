import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { getAuditHistory } from "@/serverFunctions/audit";
import { formatStartedAt, StatusBadge } from "@/client/features/audit/shared";
import {
  CardEmpty,
  CardError,
  DashboardCard,
  useProjectNavLinks,
} from "./dashboardShared";

function AuditSkeleton() {
  return (
    <div className="space-y-2" aria-busy>
      <div className="skeleton h-6 w-40" />
      <div className="skeleton h-4 w-56" />
    </div>
  );
}

export function SiteAuditCard({ projectId }: { projectId: string }) {
  const nav = useProjectNavLinks(projectId);
  const auditLink = nav.get("/p/$projectId/audit").linkProps;

  // getAuditHistory is first-party/cheap — the summary row is enough, so we
  // never fetch per-page results here.
  const historyQuery = useQuery({
    queryKey: ["auditHistory", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });
  // History is returned newest-first.
  const latest = historyQuery.data?.[0] ?? null;

  return (
    <DashboardCard
      icon={ClipboardCheck}
      title="Site audit"
      headerLink={auditLink}
    >
      {historyQuery.isError ? (
        <CardError error={historyQuery.error} />
      ) : historyQuery.isPending ? (
        <AuditSkeleton />
      ) : latest === null ? (
        <CardEmpty>
          <p>No audits yet.</p>
          <Link {...auditLink} className="btn btn-primary btn-sm mt-3">
            Run your first site audit
          </Link>
        </CardEmpty>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <StatusBadge status={latest.status} />
            <span>
              <span className="text-base-content/60">Pages </span>
              <span className="font-medium tabular-nums">
                {latest.pagesCrawled}
                {latest.pagesTotal ? ` / ${latest.pagesTotal}` : ""}
              </span>
            </span>
            <span>
              <span className="text-base-content/60">Ran </span>
              {formatStartedAt(latest.startedAt)}
            </span>
          </div>
          <p className="truncate text-xs text-base-content/60">
            {latest.startUrl}
          </p>
        </div>
      )}
    </DashboardCard>
  );
}
