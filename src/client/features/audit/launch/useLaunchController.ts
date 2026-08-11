import { useEffect } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteAudit,
  getAuditHistory,
  startAudit,
} from "@/serverFunctions/audit";
import {
  DEFAULT_LAUNCH_FORM_VALUES,
  getMaxPagesLimit,
  MIN_PAGES,
  type LaunchFormValues,
} from "@/client/features/audit/launch/types";
import {
  createFormValidationErrors,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import { resolvePrefill } from "@/client/features/insights/resolvePrefill";
import {
  useHandoff,
  writeHandoff,
} from "@/client/features/insights/handoffStore";
import { buildProjectStartUrl } from "@/client/features/audit/launch/projectStartUrl";
import { auditCacheKeysForProject } from "@/client/features/audit/auditQueryKeys";

function getLaunchValidationErrors(
  value: LaunchFormValues,
  shouldValidateUntouchedField: boolean,
) {
  if (value.url.trim()) {
    return null;
  }

  if (!shouldValidateUntouchedField) {
    return null;
  }

  return createFormValidationErrors({
    fields: {
      url: "Please enter a URL.",
    },
  });
}

export function useLaunchController({
  projectId,
  isFreePlan,
  onAuditStarted,
}: {
  projectId: string;
  isFreePlan: boolean;
  onAuditStarted: (auditId: string) => void;
}) {
  const maxPagesLimit = getMaxPagesLimit(isFreePlan);
  const historyQuery = useQuery({
    queryKey: ["audit-history", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });
  const { startMutation, deleteMutation } = useLaunchMutations({
    projectId,
    historyRefetch: historyQuery.refetch,
  });

  const projectDomain = useProjectDomain(projectId);
  const handoff = useHandoff(projectId);
  // historyQuery above already reads this project's audit history for free;
  // its newest row (AuditRepository.getAuditsByProject orders by
  // `desc(audits.startedAt)`) is this tab's "last run" signal. Site audits
  // are never written to `analysis_runs`, so there's no matching
  // `useLastRunInput` call to make the way other tabs do -- this is that
  // tier of the precedence chain, just sourced from the query this
  // controller already had.
  const lastRunUrl = historyQuery.data?.[0]?.startUrl ?? null;
  // The URL param wins (this form has no query param of its own to seed
  // from -- confirmed via `auditSearchSchema`, which only carries `auditId`
  // and `tab`), then a URL carried from another tab, then the URL last
  // crawled, then the project's own domain. Resolved only for the field's
  // initial value -- after that the user owns the input. There's no
  // URL-shaped suggestion source, so this kind always passes an empty
  // suggestions list.
  const urlPrefill = resolvePrefill({
    kind: "url",
    searchParam: null,
    handoff,
    lastRun: lastRunUrl,
    suggestions: [],
    projectDefault: buildProjectStartUrl(projectDomain),
  });

  const launchForm = useForm({
    defaultValues: DEFAULT_LAUNCH_FORM_VALUES,
    validators: {
      onChange: ({ formApi, value }) =>
        getLaunchValidationErrors(
          value,
          shouldValidateFieldOnChange(formApi, "url"),
        ),
      onSubmit: ({ value }) => getLaunchValidationErrors(value, true),
    },
    onSubmit: async ({ formApi, value }) => {
      const effectiveMaxPages = commitMaxPagesInput(launchForm, maxPagesLimit);
      formApi.setErrorMap({ onSubmit: undefined });

      if (effectiveMaxPages > 500) {
        const confirmed = window.confirm(
          `You are about to crawl ${effectiveMaxPages.toLocaleString()} pages. This is okay, but it may take a while. Continue?`,
        );
        if (!confirmed) {
          return;
        }
      }

      try {
        const result = await startMutation.mutateAsync({
          projectId,
          startUrl: value.url,
          maxPages: effectiveMaxPages,
          lighthouseStrategy: value.runLighthouse ? "auto" : "none",
        });
        toast.success("Audit started!");
        onAuditStarted(result.auditId);
        // Site Audit is the ninth wave-1 tab required to write a handoff on a
        // successful run (design doc, "Cross-tab handoff") -- opening
        // Backlinks right after an audit should inherit the domain just
        // crawled instead of making the user retype it. No `locationCode`:
        // this form has none, matching the Backlinks precedent.
        writeHandoff(projectId, {
          kind: "url",
          value: value.url,
          source: "Site Audit",
          at: Date.now(),
        });
      } catch (error) {
        formApi.setErrorMap({
          onSubmit: createFormValidationErrors({
            form: getStandardErrorMessage(error, "Failed to start audit"),
          }),
        });
      }
    },
  });

  const currentUrl = useStore(launchForm.store, (state) => state.values.url);
  const urlIsDirty = useStore(
    launchForm.store,
    (state) => state.fieldMeta.url?.isDirty ?? false,
  );

  // Every prefill source above resolves after first paint (the project
  // domain and any handoff both arrive from async/late sources), so the
  // form's `defaultValues` above can never see them. Seed the field once a
  // value lands, but never fight the user: bail as soon as they've typed
  // (urlIsDirty), and even before that, bail if the field is already
  // non-empty. `dontUpdateMeta` keeps this programmatic fill from
  // masquerading as the user's own edit -- only a real keystroke should flip
  // `isDirty`. Nothing in this file ever calls `launchForm.reset(...)`
  // (there is no route-state to resync from, unlike Domain Overview's
  // location field), so `isDirty` can't be wiped out from under this effect.
  useEffect(() => {
    if (urlIsDirty) return;
    if (currentUrl.trim() !== "") return;
    if (urlPrefill.value === "") return;
    launchForm.setFieldValue("url", urlPrefill.value, {
      dontUpdateMeta: true,
    });
  }, [urlIsDirty, currentUrl, urlPrefill.value, launchForm]);

  return {
    launchForm,
    historyQuery,
    maxPagesLimit,
    commitMaxPagesInput: () => commitMaxPagesInput(launchForm, maxPagesLimit),
    deleteAudit: (auditId: string) => deleteMutation.mutate(auditId),
  };
}

function useLaunchMutations({
  projectId,
  historyRefetch,
}: {
  projectId: string;
  historyRefetch: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const startMutation = useMutation({
    mutationFn: (data: {
      projectId: string;
      startUrl: string;
      maxPages: number;
      lighthouseStrategy: "auto" | "none";
    }) => startAudit({ data }),
    // A newly started audit is new history everywhere too: without this the
    // dashboard's Site Audit card and Getting Started keep reporting the
    // previous crawl (or none at all) while this one runs.
    onSuccess: () => {
      for (const queryKey of auditCacheKeysForProject(projectId)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (auditId: string) =>
      deleteAudit({ data: { projectId, auditId } }),
    onSuccess: () => {
      void historyRefetch();
      // The same server function is cached under three different names for
      // history and three more for results; refetching this tab's own name
      // left the deleted audit on the dashboard card, Getting Started,
      // Opportunities, On-Page Fixes and the client report -- five surfaces
      // still reporting a crawl the user had just removed.
      for (const queryKey of auditCacheKeysForProject(projectId)) {
        void queryClient.invalidateQueries({ queryKey });
      }
      toast.success("Audit deleted");
    },
  });

  return { startMutation, deleteMutation };
}

function commitMaxPagesInput(
  launchForm: {
    state: { values: { maxPagesInput: string } };
    setFieldValue: (field: "maxPagesInput", value: string) => void;
  },
  maxPagesLimit: number,
) {
  const maxPagesInput = launchForm.state.values.maxPagesInput;
  const value = maxPagesInput ? Number.parseInt(maxPagesInput, 10) : MIN_PAGES;
  const safeValue = Number.isFinite(value)
    ? Math.max(MIN_PAGES, Math.min(maxPagesLimit, Math.round(value)))
    : MIN_PAGES;
  launchForm.setFieldValue("maxPagesInput", String(safeValue));
  return safeValue;
}
