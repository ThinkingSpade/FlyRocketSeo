import { useState } from "react";
import { z } from "zod";
import { saveAuditDomainExpiration } from "@/serverFunctions/auditDomainExpiry";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  deriveDomainExpiration,
  type DomainExpirationFacts,
  type DomainExpirationStatus,
} from "@/shared/domainExpiration";
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

const storedFactsSchema = z.object({
  domain: z.string(),
  expirationDate: z.string().nullable().catch(null),
  createdDate: z.string().nullable().catch(null),
  lastUpdatedDate: z.string().nullable().catch(null),
});

/**
 * Parses the facts pinned to the audit row.
 *
 * Returns null on anything unexpected rather than throwing: a row written by an
 * older build must degrade to "not looked up yet", never break the results page.
 */
function parseStoredFacts(raw: string | null): DomainExpirationFacts | null {
  if (!raw) return null;
  try {
    const parsed = storedFactsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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

/**
 * Domain registration for the audited site, pinned to the audit so it reaches
 * the client report.
 *
 * Costs 5 APIVerve credits and is therefore an explicit click, never part of
 * the crawl -- the audit's consent covers crawling, not a third-party lookup.
 *
 * A stored result renders immediately with NO request: the day counts are
 * recomputed from the stored absolute dates against the current clock, so
 * re-opening a months-old audit shows what is true today without paying again.
 */
export function AuditDomainExpiryCard({
  projectId,
  auditId,
  storedFactsJson,
}: {
  projectId: string;
  auditId: string;
  storedFactsJson: string | null;
}) {
  const [storedFacts] = useState(() => parseStoredFacts(storedFactsJson));
  const run = useAuthorizedRun(createMeteredRunKey(projectId, auditId, 1));
  const expiryQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    queryKey: ["audit-domain-expiry", projectId, auditId],
    queryFn: () => saveAuditDomainExpiration({ data: { projectId, auditId } }),
  });

  const fresh = expiryQuery.data ?? null;
  const derived =
    fresh ??
    (storedFacts ? deriveDomainExpiration(storedFacts, Date.now()) : null);
  const status = derived?.status ?? null;

  return (
    <div
      data-testid="audit-domain-expiry"
      className="relative flex flex-col rounded-xl border border-base-300 bg-base-100"
    >
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

        {derived ? (
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-base-content/60">Expires</dt>
              <dd className="font-medium">
                {formatDate(derived.expirationDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-base-content/60">Days left</dt>
              <dd className="font-medium">
                {derived.daysToExpiration == null
                  ? "—"
                  : derived.daysToExpiration.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-base-content/60">Age</dt>
              <dd className="font-medium">
                {derived.domainAgeYears == null
                  ? "—"
                  : `${derived.domainAgeYears.toLocaleString()} yrs`}
              </dd>
            </div>
          </dl>
        ) : run.authorized && expiryQuery.isLoading ? (
          <div className="flex justify-center py-4">
            <Loader size="sm" />
          </div>
        ) : run.authorized && expiryQuery.isError ? (
          <InlineQueryError
            message={getStandardErrorMessage(
              expiryQuery.error,
              "Domain registration could not be looked up.",
            )}
            retrying={expiryQuery.isFetching}
            onRetry={() => void expiryQuery.refetch()}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-base-content/60">
              Adds the domain&apos;s expiry and age to this audit and to the
              client report. Costs 5 APIVerve credits, then free for 7 days.
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="self-start"
              onClick={() => run.authorize()}
            >
              Check domain registration
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
