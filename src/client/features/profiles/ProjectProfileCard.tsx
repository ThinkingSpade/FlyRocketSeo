import { useEffect, useState } from "react";
import { Briefcase, Check, Wand2, X } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useAiExplainAvailable } from "@/client/features/auth/useEmailVerificationBypassed";
import {
  SERVICE_AREA_KINDS,
  SERVICE_AREA_LABELS,
  isServiceAreaKind,
  type ProjectProfile,
} from "@/shared/keyword-fit/profileTypes";
import { parseExclusions } from "@/shared/keyword-fit/keywordFit";
import {
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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProjectProfile>(profile);

  // The profile arrives after first paint. Seed the form once it lands, but
  // never over an edit in progress -- reopening is what resets the draft.
  useEffect(() => {
    if (!open) setDraft(profile);
  }, [open, profile]);

  const isFilled = profile.offer.trim() !== "";
  if (isLoading) return null;

  if (!open) {
    return (
      <ProfileSummary
        profile={profile}
        isFilled={isFilled}
        onOpen={() => {
          setDraft(profile);
          setOpen(true);
        }}
      />
    );
  }

  const set = <K extends keyof ProjectProfile>(
    key: K,
    value: ProjectProfile[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

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
            <span className="text-sm text-base-content/60">
              {drafter.isError
                ? getStandardErrorMessage(
                    drafter.error,
                    "Couldn't draft from the site.",
                  )
                : "Reads a few pages of their site. You review it before it saves."}
            </span>
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

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Where do they sell?</span>
          <select
            className="app-select w-full max-w-sm"
            value={draft.serviceAreaKind}
            onChange={(event) => {
              const next = event.target.value;
              if (isServiceAreaKind(next)) set("serviceAreaKind", next);
            }}
          >
            {SERVICE_AREA_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {SERVICE_AREA_LABELS[kind].label}
              </option>
            ))}
          </select>
          <span className="text-sm text-base-content/60">
            {SERVICE_AREA_LABELS[draft.serviceAreaKind].hint}
          </span>
        </label>

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

function ProfileSummary({
  profile,
  isFilled,
  onOpen,
}: {
  profile: ProjectProfile;
  isFilled: boolean;
  onOpen: () => void;
}) {
  if (!isFilled) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-base-300 bg-base-100 px-4 py-3">
        <div className="flex items-start gap-2">
          <Briefcase className="mt-0.5 size-4 shrink-0 text-base-content/50" />
          <p className="text-sm text-base-content/80">
            Keyword results don&apos;t know what this client does yet, so a
            machine reseller&apos;s keywords look the same as an
            operator&apos;s.{" "}
            <span className="text-base-content/60">
              Takes a minute, costs nothing.
            </span>
          </p>
        </div>
        <Button type="button" size="sm" onClick={onOpen}>
          Describe this client
        </Button>
      </div>
    );
  }

  const areaHint = SERVICE_AREA_LABELS[profile.serviceAreaKind].label;
  const ruleCount = parseExclusions(profile.exclusions).length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-base-300 bg-base-100 px-4 py-3">
      <div className="flex min-w-0 items-start gap-2">
        <Briefcase className="mt-0.5 size-4 shrink-0 text-base-content/50" />
        <p className="min-w-0 text-sm text-base-content/80">
          <span className="line-clamp-1">{profile.offer}</span>
          <span className="text-base-content/60">
            {areaHint}
            {ruleCount > 0
              ? ` · ${ruleCount === 1 ? "1 fit rule" : `${ruleCount} fit rules`}`
              : " · no fit rules yet"}
          </span>
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
        Edit
      </Button>
    </div>
  );
}
