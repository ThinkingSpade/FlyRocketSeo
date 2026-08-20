import { Briefcase, CircleNotch } from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo/components/button";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { parseExclusions } from "@/shared/keyword-fit/keywordFit";
import {
  SERVICE_AREA_LABELS,
  wantsGeoModifiers,
  type ProjectProfile,
} from "@/shared/keyword-fit/profileTypes";

/**
 * The collapsed card: three states, none of them the editor.
 *
 * Split out of ProjectProfileCard when the editor grew a service-area field,
 * a review banner and an unattended draft trigger and pushed the file past
 * this repo's 400-line ceiling. This was the natural seam — it renders only
 * from props, holds no state, and reaches no query.
 */
export function ProfileSummary({
  profile,
  isFilled,
  areaLabel,
  isDrafting,
  draftFailed,
  draftError,
  onOpen,
}: {
  profile: ProjectProfile;
  isFilled: boolean;
  /** The detected or confirmed place, when there is one. */
  areaLabel: string | null;
  /** The unattended first-open draft is reading the client's site now. */
  isDrafting: boolean;
  /** The unattended first-open draft ran and failed. */
  draftFailed: boolean;
  /** That failure, so the card can name which one it was. */
  draftError: unknown;
  onOpen: () => void;
}) {
  // Says what is happening rather than asking for work that is already being
  // done. The draft takes long enough (16s measured, plus a cold isolate in
  // production) that leaving "Describe this client" on screen throughout
  // would invite the user to start typing into a form about to be replaced.
  if (isDrafting) {
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-4 py-3"
        role="status"
      >
        <CircleNotch className="size-4 shrink-0 animate-spin text-base-content/50" />
        <p className="text-sm text-base-content/80">
          Reading their site to fill this in.{" "}
          <span className="text-base-content/60">
            You&apos;ll get to check it before anything is saved.
          </span>
        </p>
      </div>
    );
  }

  if (!isFilled) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-base-300 bg-base-100 px-4 py-3">
        <div className="flex items-start gap-2">
          <Briefcase className="mt-0.5 size-4 shrink-0 text-base-content/50" />
          <p className="text-sm text-base-content/80">
            {/* An unattended draft that failed must say so. Falling back to
                the generic prompt would repeat the exact defect this branch
                exists to fix -- a failure that looks identical to never
                having tried -- only worse, because the user never pressed
                anything and has no reason to suspect an attempt was made. */}
            {draftFailed
              ? // The SPECIFIC failure, not a generic one. Each drafting
                // failure now carries its own error code, and they have
                // different remedies -- a site that blocks bots is the user's
                // to work around, a missing key is the operator's, an empty
                // OpenRouter balance is a top-up. Collapsing them back into
                // one sentence here would throw away the distinction the
                // codes exist to carry.
                getStandardErrorMessage(
                  draftError,
                  "We couldn't read their site well enough to fill this in.",
                )
              : "Keyword results don't know what this client does yet, so a machine reseller's keywords look the same as an operator's."}{" "}
            <span className="text-base-content/60">
              {draftFailed ? "" : "Takes a minute, costs nothing."}
            </span>
          </p>
        </div>
        <Button type="button" size="sm" onClick={onOpen}>
          Describe this client
        </Button>
      </div>
    );
  }

  // Names the place rather than the shape whenever the shape uses one, so the
  // collapsed card says "Dallas-Ft. Worth TX" instead of the strictly-true but
  // uninformative "One local area".
  const areaHint =
    wantsGeoModifiers(profile.serviceAreaKind) && areaLabel
      ? areaLabel
      : SERVICE_AREA_LABELS[profile.serviceAreaKind].label;
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
