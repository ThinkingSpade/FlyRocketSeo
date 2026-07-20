import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";

// Billing (Autumn) is enforced only in hosted mode AND only when a secret key
// is actually configured. A blank/whitespace key = billing disabled (this
// private self-host runs fully unmetered); a NONBLANK-but-invalid key stays
// enabled and surfaces the real Autumn error, so bad creds never silently
// grant free access.
export async function isBillingEnabled(): Promise<boolean> {
  if (!(await isHostedServerAuthMode())) return false;
  const secretKey = await getOptionalEnvValue("AUTUMN_SECRET_KEY");
  return Boolean(secretKey?.trim());
}
