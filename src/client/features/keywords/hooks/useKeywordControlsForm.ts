import { useEffect, useRef } from "react";
import { useForm } from "@tanstack/react-form";
import {
  createFormValidationErrors,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import {
  MAX_KEYWORDS_PER_SUBMIT,
  type KeywordMode,
  type ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";

type KeywordTabValidationInput = {
  keyword: string;
  locationCode: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

type UseKeywordControlsFormInput = {
  externalInputKey: string;
  keywordInput: string;
  locationCode: number;
  resultLimit: ResultLimit;
  keywordMode: KeywordMode;
  clickstream: boolean;
  getOpenKeywordTabs?: () => readonly KeywordTabValidationInput[];
  keywordTabsLimit?: number;
};

export type KeywordControlsValues = {
  keyword: string;
  locationCode: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

function getKeywordSearchValidationErrors(
  value: KeywordControlsValues,
  shouldValidateUntouchedField: boolean,
  validateEmptyKeyword: boolean,
) {
  const keywords = parseKeywordInput(value.keyword);

  if (keywords.length === 0) {
    if (!validateEmptyKeyword) return null;
    return createFormValidationErrors({
      fields: {
        keyword: "Please enter at least one keyword.",
      },
    });
  }

  if (!shouldValidateUntouchedField) return null;

  if (keywords.length > MAX_KEYWORDS_PER_SUBMIT) {
    return createFormValidationErrors({
      fields: {
        keyword: `Please enter no more than ${MAX_KEYWORDS_PER_SUBMIT} keywords (one per line).`,
      },
    });
  }

  return null;
}

function getKeywordTabCapacityError(
  value: KeywordControlsValues,
  openKeywordTabs: readonly KeywordTabValidationInput[] | undefined,
  keywordTabsLimit: number | undefined,
) {
  if (!openKeywordTabs || keywordTabsLimit == null) return null;

  const keywords = parseKeywordInput(value.keyword);
  if (keywords.length === 0) return null;

  let simulatedOpenTabs = [...openKeywordTabs];
  let skippedCount = 0;

  for (const keyword of keywords) {
    const input = {
      keyword,
      locationCode: value.locationCode,
      resultLimit: value.resultLimit,
      mode: value.mode,
      clickstream: value.clickstream,
    };
    const alreadyOpen = simulatedOpenTabs.some((tab) =>
      keywordTabMatches(tab, input),
    );
    if (alreadyOpen) continue;

    if (simulatedOpenTabs.length >= keywordTabsLimit) {
      skippedCount += 1;
      continue;
    }

    simulatedOpenTabs = [...simulatedOpenTabs, input];
  }

  if (skippedCount === 0) return null;

  return createFormValidationErrors({
    fields: {
      keyword: `${skippedCount} keyword${skippedCount === 1 ? "" : "s"} skipped - close a tab to open more (max ${keywordTabsLimit}).`,
    },
  });
}

function keywordTabMatches(
  tab: KeywordTabValidationInput,
  input: KeywordTabValidationInput,
) {
  return (
    tab.keyword === input.keyword &&
    tab.locationCode === input.locationCode &&
    tab.resultLimit === input.resultLimit &&
    tab.mode === input.mode &&
    tab.clickstream === input.clickstream
  );
}

export function useKeywordControlsForm(
  input: UseKeywordControlsFormInput,
  onSubmit: (value: KeywordControlsValues) => void,
) {
  const synchronizedInput = useRef({
    key: input.externalInputKey,
    locationCode: input.locationCode,
  });
  const form = useForm({
    defaultValues: {
      keyword: input.keywordInput,
      locationCode: input.locationCode,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
    },
    validators: {
      onChange: ({ formApi, value }) =>
        getKeywordSearchValidationErrors(
          value,
          shouldValidateFieldOnChange(formApi, "keyword"),
          false,
        ),
      onSubmit: ({ value }) =>
        getKeywordSearchValidationErrors(value, true, true) ??
        getKeywordTabCapacityError(
          value,
          input.getOpenKeywordTabs?.(),
          input.keywordTabsLimit,
        ),
    },
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  useEffect(() => {
    const previous = synchronizedInput.current;
    synchronizedInput.current = {
      key: input.externalInputKey,
      locationCode: input.locationCode,
    };
    if (previous.key !== input.externalInputKey) {
      // A selected search tab or URL deliberately replaces all controls.
      form.reset({
        keyword: input.keywordInput,
        locationCode: input.locationCode,
        resultLimit: input.resultLimit,
        mode: input.keywordMode,
        clickstream: input.clickstream,
      });
    } else if (
      previous.locationCode !== input.locationCode &&
      !form.getFieldMeta("locationCode")?.isDirty
    ) {
      // A late project default only fills the untouched country control.
      // Resetting the form here would discard a draft and its dirty metadata.
      form.setFieldValue("locationCode", input.locationCode, {
        dontUpdateMeta: true,
      });
    }
  }, [
    form,
    input.externalInputKey,
    input.keywordInput,
    input.keywordMode,
    input.locationCode,
    input.resultLimit,
    input.clickstream,
  ]);

  return form;
}
