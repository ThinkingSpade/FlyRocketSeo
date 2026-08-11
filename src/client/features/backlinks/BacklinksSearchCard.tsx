import { useEffect, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  createFormValidationErrors,
  getFieldError,
  getFormError,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import {
  inferBacklinksSearchScopeFromTarget,
  resolveBacklinksSearchScope,
} from "./backlinksSearchScope";
import { Button } from "@cloudflare/kumo/components/button";
import { InputGroup } from "@cloudflare/kumo/components/input-group";
import { Toolbar } from "@cloudflare/kumo/components/toolbar";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Input } from "@cloudflare/kumo/components/input";

type SearchDraft = Pick<BacklinksSearchState, "target" | "scope">;

function getBacklinksValidationErrors(
  value: SearchDraft,
  shouldValidateUntouchedField: boolean,
  canOpenSearch?: (value: SearchDraft) => boolean,
  tabLimit?: number,
) {
  if (!value.target.trim()) {
    if (!shouldValidateUntouchedField) {
      return null;
    }

    return createFormValidationErrors({
      fields: {
        target: "Enter a domain or URL to analyze.",
      },
    });
  }

  const normalizedValue = {
    ...value,
    target: value.target.trim(),
  };

  if (canOpenSearch && !canOpenSearch(normalizedValue)) {
    return createFormValidationErrors({
      fields: {
        target: `Close a tab to open more searches (max ${tabLimit ?? 8}).`,
      },
    });
  }

  return null;
}

export function BacklinksSearchCard({
  canOpenSearch,
  compact = false,
  errorMessage,
  initialValues,
  onSubmit,
  prefillTarget,
  tabLimit,
}: {
  canOpenSearch?: (values: SearchDraft) => boolean;
  compact?: boolean;
  errorMessage: string | null;
  initialValues: SearchDraft;
  onSubmit: (values: SearchDraft) => void;
  /** A handoff, last-run, or project-domain value the page resolved to seed
   *  the target field with; "" means it found nothing to offer. */
  prefillTarget: string;
  tabLimit?: number;
}) {
  const [userSelectedScope, setUserSelectedScope] = useState(false);
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onChange: ({ formApi, value }) =>
        getBacklinksValidationErrors(
          value,
          shouldValidateFieldOnChange(formApi, "target"),
          canOpenSearch,
          tabLimit,
        ),
      onSubmit: ({ value }) =>
        getBacklinksValidationErrors(value, true, canOpenSearch, tabLimit),
    },
    onSubmit: ({ value }) => {
      const target = value.target.trim();
      const scope = resolveBacklinksSearchScope({
        target,
        selectedScope: value.scope,
        userSelectedScope,
      });

      onSubmit({
        ...value,
        target,
        scope,
      });
    },
  });

  useEffect(() => {
    form.reset(initialValues);
    setUserSelectedScope(false);
  }, [form, initialValues]);

  const currentTarget = useStore(form.store, (state) => state.values.target);
  const targetIsDirty = useStore(
    form.store,
    (state) => state.fieldMeta.target?.isDirty ?? false,
  );
  // Every prefill source resolves after first paint, so `initialValues`
  // (URL-only, via `form`'s `defaultValues`) can never see it. Seed the field
  // once a value lands, but never fight the user: bail as soon as they've
  // typed (targetIsDirty), and even before that, bail if the field is
  // non-empty (a `target` URL param already won). `dontUpdateMeta` keeps this
  // programmatic fill from masquerading as the user's own edit. Typing here
  // never navigates mid-keystroke -- only submit does -- so `isDirty` stays a
  // stable "user touched it" signal for the life of this form, unlike a
  // control whose own onChange commits straight to the URL and would have its
  // meta wiped by the reset effect above on the very next render.
  useEffect(() => {
    if (targetIsDirty) return;
    if (currentTarget.trim() !== "") return;
    if (prefillTarget === "") return;
    form.setFieldValue("target", prefillTarget, { dontUpdateMeta: true });
  }, [targetIsDirty, currentTarget, prefillTarget, form]);

  const targetField = (
    <form.Field name="target">
      {(field) => {
        const targetError = getFieldError(field.state.meta.errors);
        const handleTargetChange = (nextTarget: string) => {
          field.handleChange(nextTarget);
          if (!userSelectedScope) {
            form.setFieldValue(
              "scope",
              inferBacklinksSearchScopeFromTarget(nextTarget),
            );
          }
        };

        return compact ? (
          <Toolbar.InputGroup
            aria-label="Backlink search target"
            className="w-full min-w-0 lg:flex-1"
          >
            <InputGroup.Addon>
              <MagnifyingGlass className="text-base-content/60" />
            </InputGroup.Addon>
            <InputGroup.Input
              aria-label="Domain or URL"
              aria-invalid={targetError ? true : undefined}
              placeholder="Enter a domain or URL"
              value={field.state.value}
              onChange={(event) => handleTargetChange(event.target.value)}
            />
          </Toolbar.InputGroup>
        ) : (
          <div className="relative flex flex-1 items-center">
            <MagnifyingGlass className="pointer-events-none absolute left-3 size-4 text-base-content/60" />
            <Input
              aria-label="Domain or URL"
              placeholder="Enter a domain or URL"
              value={field.state.value}
              variant={targetError ? "error" : "default"}
              className="w-full pl-9"
              onChange={(event) => handleTargetChange(event.target.value)}
            />
          </div>
        );
      }}
    </form.Field>
  );
  const scopeField = (
    <form.Field name="scope">
      {(field) => (
        <SegmentedToggle
          showLabels
          items={[
            { value: "domain", label: "Site-wide" },
            { value: "page", label: "Exact page" },
          ]}
          value={field.state.value === "page" ? "page" : "domain"}
          onChange={(scope) => {
            setUserSelectedScope(true);
            field.handleChange(scope);
          }}
        />
      )}
    </form.Field>
  );
  const submitButton = (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) =>
        compact ? (
          <Toolbar.Button
            type="submit"
            className="shrink-0"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Loading..." : "Search"}
          </Toolbar.Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            className="shrink-0 px-6"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Loading..." : "Search"}
          </Button>
        )
      }
    </form.Subscribe>
  );

  return (
    <div
      className={
        compact
          ? undefined
          : "relative flex flex-col rounded-xl border border-base-300 bg-base-100"
      }
    >
      <div
        className={
          compact
            ? "space-y-3 text-sm"
            : "flex flex-auto flex-col gap-4 p-6 text-sm"
        }
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          {compact ? (
            <Toolbar
              size="sm"
              className="w-full flex-col items-stretch gap-3 p-4 lg:flex-row lg:items-center"
            >
              {targetField}
              {scopeField}
              {submitButton}
            </Toolbar>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row">
                {targetField}
                {submitButton}
              </div>

              <div className="flex items-center gap-1">{scopeField}</div>
            </div>
          )}

          <form.Field name="target">
            {(field) => {
              const targetError = getFieldError(field.state.meta.errors);

              return targetError ? (
                <p className="text-sm text-error">{targetError}</p>
              ) : null;
            }}
          </form.Field>

          <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
            {(submitError) => {
              const formError = getFormError(submitError);

              return formError ? (
                <p className="text-sm text-error">{formError}</p>
              ) : null;
            }}
          </form.Subscribe>
        </form>

        {errorMessage ? (
          <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
