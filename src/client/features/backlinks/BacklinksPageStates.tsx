import { ShieldWarning } from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo/components/button";

const CARD = "rounded-xl border border-base-300 bg-base-100 p-4";

/**
 * Mirrors the geometry the page actually resolves to: one summary card, the
 * trend charts, then the explorer. The old skeleton promised eight stat cards
 * and two wide charts, so the layout visibly rearranged itself on load.
 */
export function BacklinksLoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-3">
        <div className="skeleton h-4 w-24" />
        <div className={CARD}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-7 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className={CARD}>
              <div className="space-y-3">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-40 w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="skeleton h-4 w-32" />
        <div className={CARD}>
          <div className="space-y-3">
            <div className="skeleton h-8 w-72" />
            <div className="skeleton h-64 w-full" />
          </div>
        </div>
      </section>
    </div>
  );
}

export function BacklinksErrorState({
  errorMessage,
  onRetry,
}: {
  errorMessage: string | null;
  onRetry: () => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-error/30 bg-error/5 p-4">
      <div className="flex items-start gap-2">
        {/* Bare glyph: the icon carries the tone, so a coloured tile behind it
            is decoration competing with the message. */}
        <ShieldWarning className="mt-0.5 size-5 shrink-0 text-error/80" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Could not load backlinks</h2>
          <p className="text-xs text-base-content/55">
            {errorMessage ?? "Please try again in a moment."}
          </p>
        </div>
      </div>
      <Button size="sm" onClick={onRetry}>
        Retry
      </Button>
    </section>
  );
}
