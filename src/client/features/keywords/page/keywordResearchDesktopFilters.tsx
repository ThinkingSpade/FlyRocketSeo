import { Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import type { KeywordResearchControllerState } from "./types";

function FilterTextInput({
  form,
  name,
  label,
  placeholder,
}: {
  form: KeywordResearchControllerState["filtersForm"];
  name: "include" | "exclude";
  label: string;
  placeholder: string;
}) {
  return (
    <label className="form-control gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </span>
      <form.Field name={name}>
        {(field) => (
          <input
            className="input input-bordered input-sm bg-base-100"
            placeholder={placeholder}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
    </label>
  );
}

function FilterRangeInputs({
  form,
  title,
  minName,
  maxName,
  step,
}: {
  form: KeywordResearchControllerState["filtersForm"];
  title: string;
  minName: "minVol" | "minCpc" | "minKd";
  maxName: "maxVol" | "maxCpc" | "maxKd";
  step?: string;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <CompactRangeInput
          form={form}
          name={minName}
          placeholder="Min"
          step={step}
        />
        <CompactRangeInput
          form={form}
          name={maxName}
          placeholder="Max"
          step={step}
        />
      </div>
    </div>
  );
}

function CompactRangeInput({
  form,
  name,
  placeholder,
  step,
}: {
  form: KeywordResearchControllerState["filtersForm"];
  name: "minVol" | "maxVol" | "minCpc" | "maxCpc" | "minKd" | "maxKd";
  placeholder: string;
  step?: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <input
          className="input input-bordered input-xs bg-base-100"
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

export function EmptyFilterResults({
  activeFilterCount,
  resetFilters,
}: {
  activeFilterCount: number;
  resetFilters: () => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4 text-base-content/50 gap-3">
      <p className="text-sm font-medium">
        No keywords match your current filters.
      </p>
      {activeFilterCount > 0 ? (
        <button className="btn btn-ghost btn-sm" onClick={resetFilters}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function FilterQuestionsToggle({
  form,
}: {
  form: KeywordResearchControllerState["filtersForm"];
}) {
  return (
    <form.Field name="questionsOnly">
      {(field) => (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-3 py-2">
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-sm"
            checked={field.state.value === "1"}
            onChange={(event) =>
              field.handleChange(event.target.checked ? "1" : "")
            }
          />
          <span className="text-sm">
            Questions only
            <span className="ml-1 text-xs text-base-content/50">
              (how, what, why…)
            </span>
          </span>
        </label>
      )}
    </form.Field>
  );
}

export function SerpPanelActions({
  projectId,
  keyword,
}: {
  projectId: string;
  keyword: string;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Link
        to="/p/$projectId/serp"
        params={{ projectId }}
        search={{ q: keyword }}
        className="btn btn-ghost btn-xs"
      >
        Full SERP
      </Link>
      <Link
        to="/p/$projectId/content"
        params={{ projectId }}
        search={{ q: keyword }}
        className="btn btn-ghost btn-xs"
      >
        Build brief
      </Link>
      <Link
        to="/p/$projectId/trends"
        params={{ projectId }}
        search={{ q: keyword }}
        className="btn btn-ghost btn-xs"
      >
        Trends
      </Link>
    </div>
  );
}

// Lives beside `DesktopFilterFields` (not in KeywordResearchDesktopResults)
// because that file sits right at oxlint's per-file line cap.
export function DesktopFilters({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  const { activeFilterCount, filtersForm } = controller;

  return (
    <div className="shrink-0 border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine table results</p>
          {activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {activeFilterCount} active
            </span>
          ) : null}
        </div>
        <button
          className="btn btn-xs btn-ghost gap-1"
          onClick={controller.resetFilters}
          disabled={activeFilterCount === 0}
        >
          <RotateCcw className="size-3" />
          Clear all
        </button>
      </div>

      <DesktopFilterFields form={filtersForm} />
    </div>
  );
}

function DesktopFilterFields({
  form,
}: {
  form: KeywordResearchControllerState["filtersForm"];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterTextInput
          form={form}
          name="include"
          label="Include Terms"
          placeholder="audit, checker, template"
        />
        <FilterTextInput
          form={form}
          name="exclude"
          label="Exclude Terms"
          placeholder="jobs, salary, course"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <FilterRangeInputs
          form={form}
          title="Search Volume"
          minName="minVol"
          maxName="maxVol"
        />
        <FilterRangeInputs
          form={form}
          title="CPC (USD)"
          minName="minCpc"
          maxName="maxCpc"
          step="0.01"
        />
        <FilterRangeInputs
          form={form}
          title="Difficulty"
          minName="minKd"
          maxName="maxKd"
        />
      </div>

      <FilterQuestionsToggle form={form} />
    </>
  );
}
