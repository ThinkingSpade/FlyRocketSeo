import { Link } from "@tanstack/react-router";
import { getCompetitorsList } from "@/serverFunctions/competitors";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { Button, buttonVariants } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Table } from "@cloudflare/kumo/components/table";

function formatCount(value: number | null): string {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

/** Semrush-style "main organic competitors" inline on the overview — the
 *  domains fighting for the same keywords, with a jump to the full tab. */
export function DomainCompetitorsCard({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, domain.trim(), 1),
  );
  const competitorsQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    queryKey: ["domain-competitors-inline", projectId, domain],
    queryFn: () => getCompetitorsList({ data: { projectId, target: domain } }),
  });
  const rows = (competitorsQuery.data?.rows ?? []).slice(0, 5);

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-base-content/60">
            Top organic competitors
          </p>
          <Link
            to="/p/$projectId/competitors"
            params={{ projectId }}
            className={buttonVariants({ variant: "ghost", size: "xs" })}
          >
            Full analysis
          </Link>
        </div>
        {!run.authorized ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="self-start"
            onClick={() => run.authorize()}
          >
            Load competitors
          </Button>
        ) : competitorsQuery.isLoading ? (
          <div className="flex justify-center py-4">
            <Loader size="sm" />
          </div>
        ) : competitorsQuery.isError ? (
          <InlineQueryError
            message="Competitors could not be loaded."
            retrying={competitorsQuery.isFetching}
            onRetry={() => void competitorsQuery.refetch()}
          />
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Domain</Table.Head>
                  <Table.Head className="text-right">
                    Shared keywords
                  </Table.Head>
                  <Table.Head className="text-right">Their keywords</Table.Head>
                  <Table.Head className="text-right">Their traffic</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => (
                  <Table.Row key={row.domain}>
                    <Table.Cell className="max-w-xs">
                      <span className="line-clamp-1 font-medium">
                        {row.domain}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatCount(row.intersections)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatCount(row.organicKeywords)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatCount(row.organicTraffic)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        ) : (
          <p className="py-4 text-sm text-base-content/50">
            No organic competitors found.
          </p>
        )}
      </div>
    </div>
  );
}
