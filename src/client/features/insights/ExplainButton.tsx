import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { explainFindings } from "@/serverFunctions/insights";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { Verdict } from "./types";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";

/**
 * Turns the verdict above it into prose, on demand.
 *
 * A mutation rather than a query, because this must never run on render. The
 * deterministic card stays the primary artifact -- this only ever adds a
 * paragraph beneath it, and a failure costs nothing already on screen.
 */
export function ExplainButton({
  projectId,
  tab,
  verdict,
}: {
  projectId: string;
  tab: string;
  verdict: Verdict;
}) {
  const explain = useMutation({
    mutationFn: () =>
      explainFindings({
        data: {
          projectId,
          tab,
          read: verdict.read,
          // Mirrors MAX_EXPLAIN_ACTIONS / the server schema's cap -- kept as a
          // literal here rather than importing a server module into the
          // client bundle for one constant.
          actions: verdict.actions.slice(0, 5).map((action) => ({
            label: action.label,
            evidence: action.evidence,
          })),
        },
      }),
  });

  // An honest "we can't tell" has nothing worth rephrasing -- paying to
  // reword it would be absurd.
  if (verdict.tone === "unknown") return null;

  return (
    <div className="flex flex-col gap-2">
      {explain.data ? (
        <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
          <p className="whitespace-pre-line text-sm leading-relaxed text-base-content/80">
            {explain.data.prose}
          </p>
          <p className="mt-2 text-xs text-base-content/45">
            Written by AI from the finding above.
          </p>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="w-fit"
          disabled={explain.isPending}
          onClick={() => explain.mutate()}
        >
          {explain.isPending ? (
            <Loader size="sm" />
          ) : (
            <Sparkles className="size-3.5 text-base-content/45" />
          )}
          Explain this in plain English
        </Button>
      )}

      {explain.error ? (
        <p className="text-xs text-error">
          {getStandardErrorMessage(explain.error, "Could not explain this")}
        </p>
      ) : null}
    </div>
  );
}
