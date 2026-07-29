import { Info, Search } from "lucide-react";
import { getFieldError } from "@/client/lib/forms";
import {
  isResultLimit,
  normalizeKeywordMode,
} from "@/client/features/keywords/keywordSearchParams";
import {
  MAX_KEYWORDS_PER_SUBMIT,
  RESULT_LIMITS,
} from "@/client/features/keywords/keywordResearchTypes";
import { ScopeControl } from "@/client/features/geo/ScopeControl";
import { SuggestionChips } from "@/client/features/insights/SuggestionChips";
import { SeedSuggestionButton } from "@/client/features/profiles/SeedSuggestionButton";
import type { SeedSuggestion } from "@/client/features/insights/types";
import { resolveRunGeo } from "@/client/features/geo/resolveRunGeo";
import { resolveEffectiveScopeArea } from "@/client/features/geo/resolveScopeArea";
import type { TargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import { resolveKeywordProviderNotice } from "./keywordProviderNotice";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
  suggestions: SeedSuggestion[];
  /**
   * This tab's target-area scope. The picker below is the tab's ONLY
   * geography control -- it replaced both the country-only `LocationSelect`
   * that used to sit in this form and the separate header `ScopeControl`
   * that sat above it.
   *
   * Those two were the actual reason a DFW project looked un-targetable:
   * the control users reach for (this one, next to the Search button) could
   * only ever pick a country, while the one that could pick a metro sat in
   * the page header looking like a display-only breadcrumb. Selecting a
   * metro here now sets both halves `resolveRunGeo` reconciles at once.
   */
  scope: TargetAreaScope;
  /** The project's own configured country -- what "Clear" reverts the
   *  country half to, since clearing drops the confirmed area entirely. */
  projectCountryCode: number;
  projectId: string;
};

function getTextareaRows(value: string): number {
  const newlines = (value.match(/\n/g) ?? []).length;
  const lines = newlines + 1;
  return Math.min(MAX_KEYWORDS_PER_SUBMIT, Math.max(1, lines));
}

export function KeywordResearchSearchBar({
  controller,
  suggestions,
  scope,
  projectCountryCode,
  projectId,
}: Props) {
  const { controlsForm, handleSearchSubmit, isLoading } = controller;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:gap-2"
          onSubmit={handleSearchSubmit}
        >
          <controlsForm.Field name="keyword">
            {(field) => {
              const keywordError = getFieldError(field.state.meta.errors);
              const rows = getTextareaRows(field.state.value);

              return (
                <div className="flex w-full flex-col gap-1.5 lg:flex-1 lg:min-w-0 lg:max-w-md">
                  <label
                    className={`flex w-full items-start gap-2 rounded-lg border bg-base-100 px-4 py-3 transition-colors focus-within:border-primary ${
                      keywordError ? "border-error" : "border-base-300"
                    }`}
                  >
                    <Search className="mt-0.5 size-4 shrink-0 text-base-content/60" />
                    <textarea
                      className="grow min-w-0 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-base-content/40"
                      rows={rows}
                      placeholder="Enter keywords, one per line"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onKeyDown={(event) => {
                        // Cmd/Ctrl+Enter submits without leaving a stray newline.
                        // Bare Enter stays as the textarea default (insert newline)
                        // so multi-keyword input remains discoverable.
                        if (
                          event.key === "Enter" &&
                          (event.metaKey || event.ctrlKey)
                        ) {
                          event.preventDefault();
                          void controlsForm.handleSubmit();
                        }
                      }}
                    />
                  </label>
                  <SuggestionChips
                    suggestions={suggestions}
                    value={field.state.value}
                    onSelect={(next) => field.handleChange(next)}
                    disabled={isLoading}
                  />
                  <SeedSuggestionButton
                    projectId={projectId}
                    area={scope.area}
                    disabled={isLoading}
                    // One per line -- the same shape this textarea already
                    // accepts for a multi-keyword submit.
                    onSuggest={(keywords) =>
                      field.handleChange(keywords.join("\n"))
                    }
                  />
                </div>
              );
            }}
          </controlsForm.Field>

          <div className="grid grid-cols-2 gap-2 lg:contents">
            <controlsForm.Field name="locationCode">
              {(field) => (
                <ScopeControl
                  // Never `scope.area` raw: that can name a metro this run
                  // would not actually use (see resolveEffectiveScopeArea).
                  area={resolveEffectiveScopeArea(
                    scope.area,
                    field.state.value,
                  )}
                  onChange={(area) => {
                    // One pick, both halves: the country the request goes to
                    // and the area within it. A metro/city carries its own
                    // parent country, so picking "Dallas-Ft. Worth, TX" moves
                    // the country to the US too rather than stranding the
                    // metro under whatever country was selected before.
                    field.handleChange(area.parentCountryCode);
                    scope.onChange(area);
                  }}
                  hasConfirmedArea={scope.hasConfirmedArea}
                  onClear={() => {
                    field.handleChange(projectCountryCode);
                    scope.onClear();
                  }}
                  className="w-full lg:w-56 lg:shrink-0"
                />
              )}
            </controlsForm.Field>

            <controlsForm.Field name="resultLimit">
              {(field) => (
                <select
                  className="select select-bordered w-full lg:w-auto lg:shrink-0"
                  value={field.state.value}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    field.handleChange(isResultLimit(next) ? next : 150);
                  }}
                >
                  {RESULT_LIMITS.map((limit) => (
                    <option key={limit} value={limit}>
                      {limit} results
                    </option>
                  ))}
                </select>
              )}
            </controlsForm.Field>

            <controlsForm.Field name="mode">
              {(field) => (
                <select
                  className="select select-bordered w-full lg:w-auto lg:shrink-0"
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(normalizeKeywordMode(event.target.value))
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="related">Related keywords</option>
                  <option value="suggestions">Suggestions</option>
                  <option value="ideas">Ideas</option>
                </select>
              )}
            </controlsForm.Field>

            <button
              type="submit"
              className="btn btn-primary w-full px-6 lg:w-auto lg:shrink-0"
            >
              Search
            </button>
          </div>
        </form>
        <controlsForm.Field name="keyword">
          {(field) => {
            const keywordError = getFieldError(field.state.meta.errors);

            return keywordError ? (
              <p className="text-sm text-error">{keywordError}</p>
            ) : null;
          }}
        </controlsForm.Field>
        <controlsForm.Field name="locationCode">
          {(locationField) => {
            // What THIS run will actually use if submitted right now --
            // reconciled the same way every other metered tab's own
            // "Location" field is (resolveRunGeo.ts's own header): a
            // confirmed metro/city only applies when its parent country
            // matches THIS control's value, so a DFW area under a session
            // sitting on e.g. Canada is correctly ignored here too.
            const volumeGeo = resolveRunGeo(
              "keyword-volume",
              scope.area,
              locationField.state.value,
            );
            const notice = resolveKeywordProviderNotice(volumeGeo);

            if (notice.kind === "labs") {
              return (
                <controlsForm.Field name="clickstream">
                  {(field) => (
                    <div className="flex items-center gap-2">
                      <label className="label cursor-pointer justify-start gap-2 p-0">
                        <input
                          type="checkbox"
                          className="toggle toggle-sm toggle-primary"
                          checked={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.checked)
                          }
                        />
                        <span className="text-sm font-medium text-base-content/80">
                          Clickstream-refined volumes
                        </span>
                      </label>
                      <div
                        className="tooltip tooltip-right"
                        data-tip="Google reports one combined search volume for similar keywords (e.g. 'seo tool' and 'seo tools'). Turn this on to estimate each keyword's own volume. Costs 2x the credits."
                      >
                        <Info className="size-3.5 text-base-content/50" />
                      </div>
                    </div>
                  )}
                </controlsForm.Field>
              );
            }

            // Google Ads only ever returns volume, CPC, and trends -- never
            // difficulty or intent (this file's own domain fact). Naming the
            // confirmed area specifically when THAT is why (rather than the
            // whole country lacking Labs coverage) is Gap 2's actual fix:
            // otherwise a metro-scoped US project reads exactly like a
            // Google-Ads-only country such as Iceland, with no hint that
            // picking a different area would restore difficulty and intent.
            return (
              <div
                className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-base-content/80"
                role="status"
              >
                <Info className="mt-0.5 size-4 shrink-0 text-info" />
                <span>
                  {notice.kind === "google-ads-local"
                    ? `This search is scoped to ${notice.areaLabel}, which Google Ads covers instead of DataForSEO Labs — search volume, CPC, and trends are available, but difficulty and intent are not.`
                    : "Keyword data for this country comes from Google Ads — search volume, CPC, and trends are available, but difficulty and intent are not."}
                </span>
              </div>
            );
          }}
        </controlsForm.Field>
      </div>
    </div>
  );
}
