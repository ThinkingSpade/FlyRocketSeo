import { useEffect, useRef, useState } from "react";
import { AlertCircle, Briefcase, Check, Wand2, X } from "lucide-react";
import { useAiExplainAvailable } from "@/client/features/auth/useEmailVerificationBypassed";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import { resolveDraftStatus, type DraftStatus } from "./draftStatus";
import { applyPrefill, hasNeverBeenDrafted } from "./profilePrefill";
import { useProfilePrefill } from "./useProfilePrefill";
import { type ProjectProfile } from "@/shared/keyword-fit/profileTypes";
import { ProfileSummary } from "./ProfileSummary";
import { ServiceAreaField } from "./ServiceAreaField";
import { summariseServiceArea } from "./serviceAreaSummary";
import { useTargetArea } from "@/client/features/geo/useTargetArea";
import { parseExclusions } from "@/shared/keyword-fit/keywordFit";
import {
  useAutoDraftProjectProfile,
  useDraftProjectProfile,
  useProjectProfile,
  useSaveProjectProfile,
} from "./useProjectProfile";
import { Button } from "@cloudflare/kumo/components/button";

/**
 * The editor for what a project's business actually is.
 *
 * Deliberately inline on the tab that consumes it rather than buried in
 * Settings: the profile only becomes legible when you can see it changing the
 * results next to it, and a user who has just been shown "vending machines
 * for sale" needs the fix within reach of the thing that annoyed them.
 *
 * Collapsed by default once filled in, so it stops competing with the search
 * form for attention on every visit.
 */

type Props = { projectId: string };

const EXCLUSION_PLACEHOLDER = `We don't sell machines
We don't repair customer-owned machines`;

export function ProjectProfileCard({ projectId }: Props) {
  const { profile, isLoading } = useProjectProfile(projectId);
  const save = useSaveProjectProfile(projectId);
  // Same runtime flag (and same OPENROUTER_API_KEY) that gates the insights
  // "Explain this" button. Without a key the draft affordance is absent
  // rather than present-and-broken; every other field here still works, which
  // is the whole reason the manual form is the foundation.
  const aiAvailable = useAiExplainAvailable();
  const drafter = useDraftProjectProfile(projectId);
  const prefill = useProfilePrefill(projectId);
  // Same cached query ServiceAreaField reads; the collapsed summary needs the
  // place name too, and it renders when that field does not exist.
  const areaLabel = summariseServiceArea(useTargetArea(projectId).data).label;
  const domain = useProjectDomain(projectId);
  const autoDraft = useAutoDraftProjectProfile(projectId);
  const autoDraftRequested = useRef(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProjectProfile>(profile);

  // What the form should start from: the stored profile with the free
  // pre-fill laid over whichever fields nobody has answered yet.
  const seed = applyPrefill(profile, prefill);

  // The profile arrives after first paint, and so does the target area the
  // pre-fill reads. Re-seed the form as each lands, but never over an edit in
  // progress -- reopening is what resets the draft.
  useEffect(() => {
    if (!open) setDraft(applyPrefill(profile, prefill));
  }, [open, profile, prefill]);

  // Draft from the client's own site on first open, once per project ever.
  //
  // The ref only stops this component from firing twice within one mount; the
  // real exactly-once guarantee is the server's claim, which is what makes it
  // safe for the card to be mounted on several tabs at the same time. Every
  // condition here is an optimisation to avoid a pointless round trip, not a
  // correctness check -- `hasNeverBeenDrafted` says so itself.
  useEffect(() => {
    if (autoDraftRequested.current) return;
    if (isLoading || !aiAvailable || !domain) return;
    if (!hasNeverBeenDrafted(profile)) return;
    autoDraftRequested.current = true;
    autoDraft.mutate(undefined, {
      // Opens the editor on what it wrote, rather than leaving a filled-in
      // profile collapsed behind a summary line. The row is unconfirmed until
      // the user presses Save, so this is the review, not a notification.
      onSuccess: (result) => {
        if (result.status !== "drafted") return;
        // Seed from the mutation's OWN return value, and do it before
        // opening. Opening first was a data-loss bug: `setOpen(true)` makes
        // the re-seed effect above bail (it is gated on `!open`), while the
        // query invalidation that would deliver the drafted row has not
        // resolved yet -- so the editor rendered the still-empty draft
        // alongside a "Drafted from their site" banner, and pressing Save
        // wrote those blanks over the profile that had just been generated.
        setDraft((current) => ({ ...current, ...result.profile }));
        setOpen(true);
      },
    });
  }, [isLoading, aiAvailable, domain, profile, autoDraft]);

  const isFilled = profile.offer.trim() !== "";
  if (isLoading) return null;

  if (!open) {
    return (
      <ProfileSummary
        // The seed, not the stored row: `seed.offer` is always the stored
        // offer (the pre-fill never touches it, so `isFilled` is unaffected),
        // but the service area it shows must match what opening the editor
        // will show, or the collapsed card claims "Nationwide" for a project
        // the editor is about to call local.
        profile={seed}
        isFilled={isFilled}
        areaLabel={areaLabel}
        isDrafting={autoDraft.isPending}
        draftFailed={autoDraft.isError}
        onOpen={() => {
          setDraft(seed);
          setOpen(true);
        }}
      />
    );
  }

  const set = <K extends keyof ProjectProfile>(
    key: K,
    value: ProjectProfile[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  // An AI draft nobody has accepted yet. `confirmedAt` is the whole contract
  // `project_profiles` was built on: null means proposal, and this is the one
  // place that is allowed to show a proposal as if it were the profile.
  const isUnreviewedDraft =
    profile.source === "ai" &&
    profile.confirmedAt === null &&
    profile.offer.trim() !== "";

  const draftStatus = resolveDraftStatus({
    isPending: drafter.isPending,
    isError: drafter.isError,
    error: drafter.error,
  });

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-4 p-6 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Briefcase className="size-4 text-base-content/50" />
              About this client
            </h2>
            <p className="text-sm text-base-content/60">
              Used to tell keywords your customer searches from ones a different
              business&apos;s customer searches. Nothing here is sent to a paid
              API.
            </p>
          </div>
          <Button
            type="button"
            aria-label="Close"
            variant="ghost"
            size="xs"
            shape="square"
            className="text-base-content/40"
            onClick={() => setOpen(false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {isUnreviewedDraft ? (
          <p
            className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm"
            role="status"
          >
            <span className="font-medium">
              Drafted from {domain ?? "their site"}.
            </span>{" "}
            <span className="text-base-content/70">
              Nothing uses this until you save it — correct anything that&apos;s
              wrong first. The &ldquo;what they do NOT do&rdquo; lines are the
              ones worth checking closely.
            </span>
          </p>
        ) : null}

        {aiAvailable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={drafter.isPending}
              onClick={() => {
                drafter.mutate(undefined, {
                  // Replaces the form, not the saved row -- the user still
                  // reviews and presses Save, which is what confirms it.
                  onSuccess: (drafted) =>
                    setDraft((current) => ({ ...current, ...drafted })),
                });
              }}
            >
              <Wand2 className="size-3.5 text-base-content/60" />
              {drafter.isPending
                ? "Reading the site…"
                : "Draft this from their site"}
            </Button>
            <DraftStatusLine status={draftStatus} />
          </div>
        ) : null}

        <ProfileField
          label="What do they sell?"
          hint="Plain language. Used to recognise keywords that are clearly theirs."
          placeholder="We place and service vending machines, micro markets, and office coffee for businesses"
          value={draft.offer}
          onChange={(value) => set("offer", value)}
        />

        <ProfileField
          label="Who buys it?"
          hint="The person typing the searches worth winning."
          placeholder="Office and facility managers at sites with 50+ employees"
          value={draft.customer}
          onChange={(value) => set("customer", value)}
        />

        <ProfileField
          label="What do they NOT do?"
          hint="One per line. This is the field that does the most work — it's what demotes “vending machines for sale” for an operator who only places them."
          placeholder={EXCLUSION_PLACEHOLDER}
          value={draft.exclusions}
          onChange={(value) => set("exclusions", value)}
          rows={3}
          footer={<ExclusionFeedback exclusions={draft.exclusions} />}
        />

        <ProfileField
          label="Brand names"
          hint="One per line. Treated as branded search."
          placeholder="Delio TX"
          value={draft.brandTerms}
          onChange={(value) => set("brandTerms", value)}
          rows={2}
        />

        <ServiceAreaField
          projectId={projectId}
          value={draft.serviceAreaKind}
          onChange={(kind) => set("serviceAreaKind", kind)}
        />

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={save.isPending}
            onClick={() => {
              save.mutate(draft, { onSuccess: () => setOpen(false) });
            }}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          {save.isError ? (
            <span className="text-sm text-error">
              Couldn&apos;t save. Try again.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The line beside the draft button.
 *
 * An error gets the error colour and an icon; nothing else does. Before this,
 * the failure message shared the hint's muted grey and its exact position, so
 * a failed draft looked identical to one that had not been started -- which
 * is how a correctly wired button gets reported as doing nothing at all.
 */
function DraftStatusLine({ status }: { status: DraftStatus }) {
  if (status.tone === "error") {
    return (
      <span
        className="flex items-center gap-1.5 text-sm text-error"
        role="alert"
      >
        <AlertCircle className="size-3.5 shrink-0" />
        {status.message}
      </span>
    );
  }

  return <span className="text-sm text-base-content/60">{status.message}</span>;
}

/**
 * Tells the user which exclusion lines actually parsed.
 *
 * Without this, a line the classifier cannot read ("we are closed on
 * Sundays") silently does nothing, and the user reasonably concludes the
 * whole feature is broken rather than that one line named no commercial role.
 */
function ExclusionFeedback({ exclusions }: { exclusions: string }) {
  const written = exclusions.split("\n").filter((line) => line.trim() !== "");
  if (written.length === 0) return null;

  const parsed = parseExclusions(exclusions).length;
  if (parsed === written.length) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-base-content/60">
        <Check className="size-3.5" />
        {parsed === 1 ? "1 rule active" : `${parsed} rules active`}
      </span>
    );
  }

  return (
    <span className="text-sm text-base-content/60">
      {parsed} of {written.length} lines understood. A line needs to name
      something you don&apos;t do — selling, hiring, repairs, DIY — for it to
      filter anything.
    </span>
  );
}

function ProfileField({
  label,
  hint,
  placeholder,
  value,
  onChange,
  rows = 2,
  footer,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  footer?: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        className="textarea textarea-bordered w-full text-sm leading-6"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="text-sm text-base-content/60">{hint}</span>
      {footer}
    </label>
  );
}
