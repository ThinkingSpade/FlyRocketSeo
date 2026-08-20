import { useCallback, useRef, useState } from "react";
import { chunk } from "remeda";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  selectUnresolvedDomains,
  type DomainExpirations,
} from "@/client/features/backlinks/domainExpiryEnrichment";
import { getDomainExpirations } from "@/serverFunctions/domainExpiration";

/** The server function's own cap. */
const DOMAINS_PER_REQUEST = 100;

/**
 * Per-page expiry enrichment for the backlinks tables.
 *
 * Shaped like `useAhrefsDomainRatings` (batching, dedupe, an in-flight set) with
 * one deliberate omission: it exposes NO effect that keeps enriching as the user
 * paginates. The DR hook does that safely because Ahrefs' free endpoint costs
 * nothing; APIVerve bills 5 credits per domain, so following pagination would
 * turn a single click into a charge for every page scrolled past. Callers must
 * call `loadExpirations` from an explicit click, once per page.
 */
export function useDomainExpirations(projectId: string) {
  const [expirations, setExpirations] = useState<DomainExpirations | null>(
    null,
  );
  const expirationsRef = useRef<DomainExpirations | null>(null);
  const pendingRef = useRef(new Set<string>());
  const [activeLoadCount, setActiveLoadCount] = useState(0);

  const loadExpirations = useCallback(
    async (domains: string[]) => {
      const targets = selectUnresolvedDomains(
        domains,
        expirationsRef.current,
        pendingRef.current,
      );
      if (targets.length === 0) return;

      for (const domain of targets) pendingRef.current.add(domain);
      setActiveLoadCount((count) => count + 1);

      const fetched: DomainExpirations = {};
      try {
        for (const batch of chunk(targets, DOMAINS_PER_REQUEST)) {
          Object.assign(
            fetched,
            await getDomainExpirations({ data: { projectId, domains: batch } }),
          );
        }
      } catch (error) {
        toast.error(
          getStandardErrorMessage(error, "Could not load domain expiry."),
        );
      } finally {
        if (Object.keys(fetched).length > 0) {
          const next = { ...expirationsRef.current, ...fetched };
          expirationsRef.current = next;
          setExpirations(next);
        }
        for (const domain of targets) pendingRef.current.delete(domain);
        setActiveLoadCount((count) => Math.max(0, count - 1));
      }
    },
    [projectId],
  );

  return {
    expirations,
    isLoading: activeLoadCount > 0,
    pending: pendingRef.current,
    loadExpirations,
  };
}
