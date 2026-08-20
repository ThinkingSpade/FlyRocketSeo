import { getDomainExpiration } from "@/serverFunctions/domainExpiration";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { DomainExpirationStatus } from "@/shared/domainExpiration";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";

const STATUS_LABELS: Record<DomainExpirationStatus, string> = {
  expired: "Expired",
  critical: "Expires soon",
  warning: "Renew this quarter",
  healthy: "Healthy",
};

const STATUS_CLASSES: Record<DomainExpirationStatus, string> = {
  expired: "text-error",
  critical: "text-error",
  warning: "text-warning",
  healthy: "text-success",
};

/** Unknown renders as an em dash, never as 0 or "healthy". */
function formatDays(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatYears(value: number | null): string {
  return value == null ? "—" : `${value.toLocaleString()} yrs`;
}

/** Registration health for the project's own domain: when it expires, how long
 *  it has been around. One APIVerve call per registrable domain per week. */
export function DomainExpirationCard({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, domain.trim(), 1),
  );
  const expirationQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    queryKey: ["domain-expiration", projectId, domain],
    queryFn: () => getDomainExpiration({ data: { projectId, domain } }),
  });
  const data = expirationQuery.data ?? null;
  const status = data?.status ?? null;

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-base-content/60">
            Domain registration
          </p>
          {status ? (
            <span className={`text-xs font-medium ${STATUS_CLASSES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          ) : null}
        </div>

        {!run.authorized ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="self-start"
            onClick={() => run.authorize()}
          >
            Check domain health
          </Button>
        ) : expirationQuery.isLoading ? (
          <div className="flex justify-center py-4">
            <Loader size="sm" />
          </div>
        ) : expirationQuery.isError ? (
          // Named copy, not a generic red box: an unset key, a rejected key and
          // a spent APIVerve quota each have their own remedy and their own
          // owner, and getStandardErrorMessage is what keeps them distinct.
          <InlineQueryError
            message={getStandardErrorMessage(
              expirationQuery.error,
              "Domain registration data could not be loaded.",
            )}
            retrying={expirationQuery.isFetching}
            onRetry={() => void expirationQuery.refetch()}
          />
        ) : data ? (
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-base-content/60">Expires</dt>
              <dd className="font-medium">{formatDate(data.expirationDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-base-content/60">Days left</dt>
              <dd className="font-medium">
                {formatDays(data.daysToExpiration)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-base-content/60">Age</dt>
              <dd className="font-medium">
                {formatYears(data.domainAgeYears)}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>
    </div>
  );
}
