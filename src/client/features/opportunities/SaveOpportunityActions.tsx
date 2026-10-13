import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  savePageOpportunity,
  saveInternalLinkOpportunity,
} from "@/serverFunctions/opportunities";
import type { PageInvestigationInput } from "@/types/schemas/page-investigation";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
export function SavePageOpportunity({
  input,
}: {
  input: PageInvestigationInput;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => savePageOpportunity({ data: input }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["opportunity-work", input.projectId],
      }),
  });
  return (
    <div className="space-y-2">
      <Button
        variant="primary"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving evidence…" : "Save page action"}
      </Button>
      {save.isError ? (
        <p role="alert" className="text-sm text-error">
          {getStandardErrorMessage(save.error)}
        </p>
      ) : null}
      {save.data ? (
        <p role="status" className="text-sm">
          Page action saved with its evidence.{" "}
          <Link
            className="app-link"
            to="/p/$projectId/opportunities"
            params={{ projectId: input.projectId }}
          >
            Open saved work
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function SaveInternalLinkOpportunity({
  input,
}: {
  input: PageInvestigationInput;
}) {
  const queryClient = useQueryClient();
  const [destination, setDestination] = useState("");
  const [phrase, setPhrase] = useState("");
  const save = useMutation({
    mutationFn: () =>
      saveInternalLinkOpportunity({
        data: {
          ...input,
          sourceUrl: input.url,
          targetUrl: destination,
          phrase,
        },
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["opportunity-work", input.projectId],
      }),
  });
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">
        Prepare a contextual internal link
      </summary>
      <p className="mt-2 text-xs text-base-content/60">
        Check actual source text, an existing-link check and matching query
        evidence before saving a candidate. This fetches the project's own
        source page and records evidence; implementation remains a reviewed
        manual action.
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          Candidate destination URL
          <Input
            type="url"
            required
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          Candidate anchor
          <Input
            required
            maxLength={200}
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending
            ? "Checking source evidence…"
            : "Check text and save link action"}
        </Button>
      </form>
      {save.isError ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {getStandardErrorMessage(save.error)}
        </p>
      ) : save.data ? (
        <p role="status" className="mt-2 text-sm">
          {save.data.availability === "ready"
            ? "Link candidate saved with captured source evidence."
            : `${save.data.availability === "no_longer_observed" ? "No unlinked candidate observed" : "Insufficient link evidence"}: ${save.data.reasons.join(" ")}`}
        </p>
      ) : null}
    </details>
  );
}
