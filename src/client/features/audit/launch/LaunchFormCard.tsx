import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { MIN_PAGES } from "@/client/features/audit/launch/types";
import { buildProjectStartUrl } from "@/client/features/audit/launch/projectStartUrl";
import type { useLaunchController } from "@/client/features/audit/launch/useLaunchController";
import { HostSuggestions } from "@/client/features/projects/HostSuggestions";
import { useProjectHostOptions } from "@/client/features/projects/useProjectSubdomains";
import { getFieldError, getFormError } from "@/client/lib/forms";
import { PAID_MAX_AUDIT_PAGES } from "@/shared/audit-limits";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";

type Props = {
  launchForm: ReturnType<typeof useLaunchController>["launchForm"];
  commitMaxPagesInput: () => number;
  maxPagesLimit: number;
};

// `LaunchOptions` below is typed as `Props` too, and it has no use for a
// project id -- so the card extends the shared shape rather than widening it.
type LaunchFormCardProps = Props & { projectId: string };

const HOST_SUGGESTIONS_ID = "audit-start-url-hosts";

export function LaunchFormCard({
  commitMaxPagesInput,
  launchForm,
  maxPagesLimit,
  projectId,
}: LaunchFormCardProps) {
  // The crawler is host-scoped -- `isSameOrigin` treats only apex and www as
  // one boundary -- so a subdomain is never reached by auditing the apex and
  // needs its own run. Suggesting the project's hosts here is what turns that
  // into picking from a list instead of recalling a URL.
  const hostOptions = useProjectHostOptions(projectId);

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <h2 className="card-title text-base">Start New Audit</h2>

        <form
          className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            void launchForm.handleSubmit();
          }}
        >
          <launchForm.Field name="url">
            {(field) => {
              const urlError = getFieldError(field.state.meta.errors);

              return (
                <label
                  className={`input input-bordered w-full lg:col-span-9 ${urlError ? "input-error" : ""}`}
                >
                  <input
                    placeholder="https://example.com"
                    list={HOST_SUGGESTIONS_ID}
                    value={field.state.value}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                      if (launchForm.state.errorMap.onSubmit) {
                        launchForm.setErrorMap({ onSubmit: undefined });
                      }
                    }}
                  />
                  <HostSuggestions
                    id={HOST_SUGGESTIONS_ID}
                    hosts={hostOptions}
                    // The field takes a full URL; `buildProjectStartUrl` is the
                    // same normalizer the prefill uses, so a picked suggestion
                    // and the default land on an identical value.
                    toValue={(host) => buildProjectStartUrl(host) ?? host}
                  />
                </label>
              );
            }}
          </launchForm.Field>

          <launchForm.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <button
                type="submit"
                className="btn btn-primary btn-sm w-full lg:col-span-3"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Starting...
                  </>
                ) : (
                  "Start Audit"
                )}
              </button>
            )}
          </launchForm.Subscribe>

          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-12 lg:items-start">
            <LaunchOptions
              launchForm={launchForm}
              commitMaxPagesInput={commitMaxPagesInput}
              maxPagesLimit={maxPagesLimit}
            />
            <LighthouseOptions launchForm={launchForm} />
          </div>
        </form>

        <LaunchErrors launchForm={launchForm} />
      </div>
    </div>
  );
}

function LaunchOptions({
  launchForm,
  commitMaxPagesInput,
  maxPagesLimit,
}: Props) {
  const isFreeLimited = maxPagesLimit < PAID_MAX_AUDIT_PAGES;

  return (
    <div className="rounded-lg border border-base-300 bg-base-200/20 p-3 space-y-2">
      <label className="text-xs font-medium uppercase tracking-wide text-base-content/60">
        Crawl limit
      </label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-base-content/70">Max pages</span>
        <launchForm.Field name="maxPagesInput">
          {(field) => (
            <input
              type="number"
              min={MIN_PAGES}
              max={maxPagesLimit}
              className="input input-bordered input-sm w-28"
              value={field.state.value}
              onChange={(event) => {
                const next = event.target.value;
                if (!/^\d*$/.test(next)) return;
                field.handleChange(next);
                if (launchForm.state.errorMap.onSubmit) {
                  launchForm.setErrorMap({ onSubmit: undefined });
                }
              }}
              onBlur={commitMaxPagesInput}
            />
          )}
        </launchForm.Field>
      </div>
      <p className="text-xs text-base-content/50">
        Enter any value from {MIN_PAGES} to {maxPagesLimit.toLocaleString()}.
        {isFreeLimited ? (
          <>
            {" "}
            <Link
              to={SUBSCRIBE_ROUTE}
              search={{ upgrade: true }}
              className="link link-primary"
            >
              Upgrade
            </Link>{" "}
            to crawl up to {PAID_MAX_AUDIT_PAGES.toLocaleString()} pages.
          </>
        ) : null}
      </p>
    </div>
  );
}

function LighthouseOptions({ launchForm }: Pick<Props, "launchForm">) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/20 p-3 space-y-2">
      <label className="label cursor-pointer justify-start gap-2 p-0">
        <launchForm.Field name="runLighthouse">
          {(field) => (
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={Boolean(field.state.value)}
              onChange={(event) => field.handleChange(event.target.checked)}
            />
          )}
        </launchForm.Field>
        <span
          className="text-sm font-medium text-base-content/80"
          title="Lighthouse measures the performance of your pages and identifies issues."
        >
          Include Lighthouse
        </span>
      </label>

      <launchForm.Subscribe
        selector={(snapshot) => snapshot.values.runLighthouse}
      >
        {(runLighthouse) =>
          runLighthouse ? (
            <div className="space-y-1">
              <p className="text-xs text-base-content/60">
                We choose a sample of 20 pages to audit, removing pages from
                duplicate templates.
              </p>
            </div>
          ) : null
        }
      </launchForm.Subscribe>
    </div>
  );
}

function LaunchErrors({ launchForm }: Pick<Props, "launchForm">) {
  return (
    <div className="space-y-2">
      <launchForm.Field name="url">
        {(field) => {
          const urlError = getFieldError(field.state.meta.errors);

          return urlError ? (
            <p className="text-sm text-error">{urlError}</p>
          ) : null;
        }}
      </launchForm.Field>

      <launchForm.Subscribe selector={(state) => state.errorMap.onSubmit}>
        {(submitError) => {
          const errorMessage = getFormError(submitError);

          return errorMessage ? (
            <div className="alert alert-error py-2">
              <span className="text-sm">{errorMessage}</span>
            </div>
          ) : null;
        }}
      </launchForm.Subscribe>
    </div>
  );
}
