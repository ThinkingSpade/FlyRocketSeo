import type { FormEvent } from "react";
import { WarningCircle, MagnifyingGlass } from "@phosphor-icons/react";
import { getFieldError, getFormError } from "@/client/lib/forms";
import type { DomainOverviewControlsForm } from "@/client/features/domain/DomainOverviewPage";
import { toSortMode } from "@/client/features/domain/utils";
import type { DomainSortMode } from "@/client/features/domain/types";
import { LABS_LOCATION_OPTIONS } from "@/client/features/keywords/locations";
import { LocationSelect } from "@/client/components/LocationSelect";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";

type Props = {
  controlsForm: DomainOverviewControlsForm;
  isLoading: boolean;
  onSubmit: (event: FormEvent) => void;
  onSortChange: (sort: DomainSortMode) => void;
  onLocationChange: (locationCode: number) => void;
};

export function DomainSearchCard({
  controlsForm,
  isLoading,
  onSubmit,
  onSortChange,
  onLocationChange,
}: Props) {
  return (
    <div className="relative flex flex-col rounded-xl bg-base-100 border border-base-300">
      <div className="flex flex-auto flex-col gap-4 p-6 text-sm">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:items-center"
          onSubmit={onSubmit}
        >
          <controlsForm.Field name="domain">
            {(field) => {
              const domainError = getFieldError(field.state.meta.errors);

              return (
                <div className="relative flex w-full items-center lg:min-w-0 lg:max-w-md lg:flex-1">
                  <MagnifyingGlass className="pointer-events-none absolute left-3 size-4 text-base-content/60" />
                  <Input
                    className="w-full min-w-0 pl-9"
                    placeholder="Enter a domain"
                    value={field.state.value}
                    variant={domainError ? "error" : "default"}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={domainError ? true : undefined}
                    aria-describedby={
                      domainError ? "domain-input-error" : undefined
                    }
                  />
                </div>
              );
            }}
          </controlsForm.Field>

          <controlsForm.Field name="locationCode">
            {(field) => (
              <LocationSelect
                value={field.state.value}
                options={LABS_LOCATION_OPTIONS}
                className="w-full lg:w-44 lg:shrink-0"
                onChange={(code) => {
                  field.handleChange(code);
                  onLocationChange(code);
                }}
              />
            )}
          </controlsForm.Field>

          <controlsForm.Field name="sort">
            {(field) => (
              <select
                className="app-select shrink-0"
                value={field.state.value}
                onChange={(event) => {
                  const next = toSortMode(event.target.value) ?? "traffic";
                  field.handleChange(next);
                  onSortChange(next);
                }}
              >
                <option value="rank">By Rank</option>
                <option value="traffic">By Traffic</option>
                <option value="volume">By Volume</option>
                <option value="score">By Score</option>
                <option value="cpc">By CPC</option>
              </select>
            )}
          </controlsForm.Field>

          <controlsForm.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                variant="primary"
                className="shrink-0 px-6"
                disabled={isLoading || isSubmitting}
              >
                {isLoading || isSubmitting ? "Loading..." : "Search"}
              </Button>
            )}
          </controlsForm.Subscribe>
        </form>

        <controlsForm.Field name="domain">
          {(field) => {
            const domainError = getFieldError(field.state.meta.errors);

            return domainError ? (
              <p id="domain-input-error" className="text-sm text-error">
                {domainError}
              </p>
            ) : null;
          }}
        </controlsForm.Field>

        <controlsForm.Subscribe selector={(state) => state.errorMap.onSubmit}>
          {(submitError) => {
            const errorMessage = getFormError(submitError);

            return errorMessage ? (
              <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error flex items-start gap-2">
                <WarningCircle className="size-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            ) : null;
          }}
        </controlsForm.Subscribe>

        <div className="flex flex-wrap items-center gap-3">
          <controlsForm.Field name="subdomains">
            {(field) => (
              <Checkbox
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked)}
                label="Include subdomains"
              />
            )}
          </controlsForm.Field>
        </div>
      </div>
    </div>
  );
}
