import type { Autumn } from "autumn-js";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

/**
 * The Autumn SDK is loaded on first use, not imported at module scope.
 *
 * `src/server.ts` roots this module (via subscription billing), so a static
 * import put the whole SDK — roughly 282 KB — into the Worker's eager graph,
 * where it was compiled and evaluated before any request could be answered.
 * That is expensive here in a way it would not be on a long-lived server:
 * measured 2026-07-31, this Worker's isolate does not survive a
 * server-function request, so eager evaluation is paid on EVERY request rather
 * than once at boot.
 *
 * Every call site already sits behind `isBillingEnabled()` and is already
 * async, so awaiting the client changes no behaviour — and a deployment with
 * billing disabled now never evaluates the SDK at all.
 *
 * The promise is cached, so an isolate that does reach billing pays the import
 * once, exactly as the old module-scope singleton did.
 */
let autumnPromise: Promise<Autumn> | undefined;

export function getAutumn(): Promise<Autumn> {
  autumnPromise ??= import("autumn-js").then(
    ({ Autumn: AutumnClient }) =>
      new AutumnClient({
        secretKey: () => getRequiredEnvValue("AUTUMN_SECRET_KEY"),
        // Retries 429/500/502/503/504 (per-operation retryCodes) plus connection
        // errors. Cloudflare 52x statuses are not in the SDK's retry list, so those
        // still surface immediately.
        retryConfig: {
          strategy: "backoff",
          backoff: {
            initialInterval: 250,
            maxInterval: 2000,
            exponent: 1.5,
            maxElapsedTime: 8000,
          },
          retryConnectionErrors: true,
        },
      }),
  );
  return autumnPromise;
}

// track() has no idempotency key, so replaying a deduction Autumn already
// processed (5xx after a successful write, dropped connection) would
// double-charge. Retry only 429s, which are rejected before processing.
export const AUTUMN_TRACK_RETRY_OPTIONS: Parameters<Autumn["track"]>[1] = {
  retryCodes: ["429"],
  retries: {
    strategy: "backoff",
    backoff: {
      initialInterval: 250,
      maxInterval: 2000,
      exponent: 1.5,
      maxElapsedTime: 8000,
    },
    retryConnectionErrors: false,
  },
};
