import { RotateCcw } from "lucide-react";
import type { KeywordResearchControllerState } from "./types";

/**
 * The mobile results view's own filter panel.
 *
 * Split out of KeywordResearchMobileResults.tsx for the same reason
 * KeywordResearchDesktopSerpPanel.tsx was split out of its own sibling: to
 * keep that file under the line-count cap. Named to mirror the existing
 * keywordResearchDesktopFilters.tsx, which plays exactly this role for the
 * desktop table.
 */
export function MobileFilters({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  const { activeFilterCount, filtersForm } = controller;

  return (
    <div className="shrink-0 border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold">Refine table results</p>
          {activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {activeFilterCount}
            </span>
          ) : null}
        </div>
        <button
          className="btn btn-xs btn-ghost gap-1"
          onClick={controller.resetFilters}
          disabled={activeFilterCount === 0}
        >
          <RotateCcw className="size-3" />
          Clear
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <filtersForm.Field name="include">
          {(field) => (
            <input
              className="input input-bordered input-sm bg-base-100"
              placeholder="Include terms (audit, checker)"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </filtersForm.Field>
        <filtersForm.Field name="exclude">
          {(field) => (
            <input
              className="input input-bordered input-sm bg-base-100"
              placeholder="Exclude terms (jobs, course)"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </filtersForm.Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MOBILE_RANGE_FILTERS.map((filter) => (
          <MobileRangeInput
            key={filter.name}
            form={filtersForm}
            name={filter.name}
            placeholder={filter.placeholder}
            step={filter.step}
          />
        ))}
      </div>
    </div>
  );
}

type MobileRangeFilterName =
  | "minVol"
  | "maxVol"
  | "minCpc"
  | "maxCpc"
  | "minKd"
  | "maxKd";

// The six numeric range filters, as data rather than six near-identical JSX
// blocks -- they differ only in name, placeholder and step.
const MOBILE_RANGE_FILTERS: ReadonlyArray<{
  name: MobileRangeFilterName;
  placeholder: string;
  step?: string;
}> = [
  { name: "minVol", placeholder: "Min volume" },
  { name: "maxVol", placeholder: "Max volume" },
  { name: "minCpc", placeholder: "Min CPC", step: "0.01" },
  { name: "maxCpc", placeholder: "Max CPC", step: "0.01" },
  { name: "minKd", placeholder: "Min difficulty" },
  { name: "maxKd", placeholder: "Max difficulty" },
];

function MobileRangeInput({
  form,
  name,
  placeholder,
  step,
}: {
  form: KeywordResearchControllerState["filtersForm"];
  name: MobileRangeFilterName;
  placeholder: string;
  step?: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <input
          className="input input-bordered input-sm bg-base-100"
          placeholder={placeholder}
          type="number"
          step={step}
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
        />
      )}
    </form.Field>
  );
}
