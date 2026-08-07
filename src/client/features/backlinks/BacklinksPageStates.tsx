import { ShieldAlert } from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";

export function BacklinksLoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="relative flex flex-col rounded-xl bg-base-100 border border-base-300"
          >
            <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-8 w-28" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="relative flex flex-col rounded-xl bg-base-100 border border-base-300"
          >
            <div className="flex flex-auto flex-col gap-3 p-6 text-sm">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-64 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="relative flex flex-col rounded-xl bg-base-100 border border-base-300">
        <div className="flex flex-auto flex-col gap-3 p-6 text-sm">
          <div className="skeleton h-8 w-60" />
          <div className="skeleton h-80 w-full" />
        </div>
      </div>
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
    <section className="rounded-2xl border border-error/30 bg-error/5 p-6 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-error/10 p-2.5 text-error shrink-0">
          <ShieldAlert className="size-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Could not load backlinks</h2>
          <p className="text-sm text-base-content/70">
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
