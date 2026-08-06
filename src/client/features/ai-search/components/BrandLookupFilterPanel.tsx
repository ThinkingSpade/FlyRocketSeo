import { RotateCcw } from "lucide-react";
import type { CitationTab } from "@/client/features/ai-search/brandLookupFilterTypes";
import { formatPlatformLabel } from "@/client/features/ai-search/platformLabels";
import type { BrandLookupFiltersState } from "@/client/features/ai-search/useBrandLookupFilters";
import { Button } from "@cloudflare/kumo/components/button";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";

/**
 * Stands in for the filter model's empty-string "no filter" value.
 *
 * Kumo's tabs key on a non-empty string, so "All" travels as this sentinel and
 * is mapped back to "" on the way out — the form state never sees it.
 */
const ALL_PLATFORMS = "all";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyForm = { Field: React.ComponentType<any> };

function FilterTextInput({
  form,
  name,
  label,
  placeholder,
}: {
  form: AnyForm;
  name: string;
  label: string;
  placeholder: string;
}) {
  return (
    <label className="form-control gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </span>
      <form.Field name={name}>
        {(field: {
          state: { value: string };
          handleChange: (v: string) => void;
        }) => (
          <input
            className="input input-bordered input-sm w-full bg-base-100"
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
}: {
  form: AnyForm;
  title: string;
  minName: string;
  maxName: string;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <CompactRangeInput form={form} name={minName} placeholder="Min" />
        <CompactRangeInput form={form} name={maxName} placeholder="Max" />
      </div>
    </div>
  );
}

function CompactRangeInput({
  form,
  name,
  placeholder,
}: {
  form: AnyForm;
  name: string;
  placeholder: string;
}) {
  return (
    <form.Field name={name}>
      {(field: {
        state: { value: string };
        handleChange: (v: string) => void;
      }) => (
        <input
          className="input input-bordered input-xs bg-base-100"
          placeholder={placeholder}
          type="number"
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
        />
      )}
    </form.Field>
  );
}

function PlatformToggle({ form }: { form: AnyForm }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        Platform
      </p>
      <form.Field name="platform">
        {(field: {
          state: { value: string };
          handleChange: (v: string) => void;
        }) => (
          <SegmentedToggle
            showLabels
            items={[
              { value: ALL_PLATFORMS, label: "All" },
              { value: "chat_gpt", label: formatPlatformLabel("chat_gpt") },
              { value: "google", label: formatPlatformLabel("google") },
            ]}
            value={field.state.value === "" ? ALL_PLATFORMS : field.state.value}
            onChange={(value) =>
              field.handleChange(value === ALL_PLATFORMS ? "" : value)
            }
          />
        )}
      </form.Field>
    </div>
  );
}

function TopPagesFilters({
  form,
}: {
  form: BrandLookupFiltersState["pages"]["form"];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterTextInput
          form={form}
          name="include"
          label="Include Terms"
          placeholder="reddit, forbes"
        />
        <FilterTextInput
          form={form}
          name="exclude"
          label="Exclude Terms"
          placeholder="pinterest, /tag"
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <PlatformToggle form={form} />
        <div className="min-w-[220px]">
          <FilterRangeInputs
            form={form}
            title="Source mentions"
            minName="minMentions"
            maxName="maxMentions"
          />
        </div>
      </div>
    </>
  );
}

function QueriesFilters({
  form,
}: {
  form: BrandLookupFiltersState["queries"]["form"];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterTextInput
          form={form}
          name="include"
          label="Include Terms"
          placeholder="pricing, reviews"
        />
        <FilterTextInput
          form={form}
          name="exclude"
          label="Exclude Terms"
          placeholder="login, download"
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <PlatformToggle form={form} />
        <div className="min-w-[220px]">
          <FilterRangeInputs
            form={form}
            title="AI search volume"
            minName="minVolume"
            maxName="maxVolume"
          />
        </div>
      </div>
    </>
  );
}

export function BrandLookupFilterPanel({
  activeTab,
  filters,
}: {
  activeTab: CitationTab;
  filters: BrandLookupFiltersState;
}) {
  const current = filters[activeTab];

  return (
    <div className="shrink-0 border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine results</p>
          {current.activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {current.activeFilterCount} active
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={current.reset}
          disabled={current.activeFilterCount === 0}
        >
          <RotateCcw className="size-3" />
          Clear all
        </Button>
      </div>

      {activeTab === "pages" ? (
        <TopPagesFilters form={filters.pages.form} />
      ) : null}
      {activeTab === "queries" ? (
        <QueriesFilters form={filters.queries.form} />
      ) : null}
    </div>
  );
}
