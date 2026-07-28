import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { startSelfHostedGbpLink } from "@/serverFunctions/gbp";

/**
 * Kicks off the Google Business Profile write OAuth grant. Mirrors
 * startGscLink.ts exactly (single-flight latch so a double click or two entry
 * points can't start two flows and stomp each other's state cookie) but
 * against the SEPARATE self-hosted GBP flow -- there is no hosted-mode
 * genericOAuth path for this scope the way GSC has one, since business.manage
 * is deliberately kept off the shared hosted OAuth client (see
 * src/shared/gbp.ts).
 */
let linkInFlight = false;

export async function startGbpLink(callbackURL: string): Promise<void> {
  if (linkInFlight) return;
  linkInFlight = true;
  try {
    const res = await startSelfHostedGbpLink({ data: { callbackURL } });
    window.location.href = res.url;
    // navigating away -- keep the latch closed
  } catch (error) {
    toast.error(getStandardErrorMessage(error));
    linkInFlight = false;
  }
}
