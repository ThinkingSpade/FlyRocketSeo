import { z } from "zod";
import { deriveDomainExpiration } from "@/shared/domainExpiration";

/**
 * The client report's one sentence about domain registration.
 *
 * Pure and clock-injected so it can be tested: the whole point of storing only
 * ABSOLUTE dates on the audit row is that this sentence changes as time passes,
 * and a report opened three months after the audit must say what is true then.
 *
 * Returns `null` — meaning "print nothing" — when the lookup was never run or
 * the stored value cannot be trusted. A client deliverable should stay silent
 * rather than guess about something the reader may act on.
 */
const storedFactsSchema = z.object({
  domain: z.string(),
  expirationDate: z.string().nullable().catch(null),
  createdDate: z.string().nullable().catch(null),
  lastUpdatedDate: z.string().nullable().catch(null),
});

export function buildDomainRegistrationLine(
  storedFactsJson: string | null,
  nowMs: number,
): string | null {
  if (!storedFactsJson) return null;

  let facts;
  try {
    const parsed = storedFactsSchema.safeParse(JSON.parse(storedFactsJson));
    if (!parsed.success) return null;
    facts = parsed.data;
  } catch {
    return null;
  }

  const expiry = deriveDomainExpiration(facts, nowMs);
  const days = expiry.daysToExpiration;
  const years = expiry.domainAgeYears;
  if (days == null && years == null) return null;

  const age =
    years == null
      ? null
      : `${years % 1 === 0 ? years.toFixed(0) : years.toFixed(1)} years old`;

  if (days == null) {
    return age ? `The domain is ${age}.` : null;
  }

  // Three registers, because a report is read by a client: expired and
  // near-expiry need to prompt an action, everything else is context.
  if (expiry.status === "expired") {
    return age
      ? `The domain registration has EXPIRED. It is ${age} and needs renewing immediately to avoid losing it.`
      : `The domain registration has EXPIRED and needs renewing immediately to avoid losing it.`;
  }

  if (expiry.status === "critical") {
    return age
      ? `The domain is ${age} and expires in ${days.toLocaleString()} days — renew it now.`
      : `The domain expires in ${days.toLocaleString()} days — renew it now.`;
  }

  return age
    ? `The domain is ${age}, with ${days.toLocaleString()} days left on its registration.`
    : `The domain has ${days.toLocaleString()} days left on its registration.`;
}
