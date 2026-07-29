import { Link, type LinkOptions } from "@tanstack/react-router";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { getGscAccessNotice } from "@/client/features/gsc/gscAccessCopy";
import { startGscLink } from "@/client/features/gsc/startGscLink";
import type { GscAccessFailureReason } from "@/shared/gsc";

/**
 * Why a Search Console surface has no data, plus the action that fixes it.
 * A dead or denied grant is NOT the same as "never connected": showing the
 * first-run prompt for it strands the user next to an Integrations card that
 * still reads "Connected".
 */
export function GscAccessNotice({
  reason,
  connectLink,
}: {
  reason: GscAccessFailureReason;
  /** Where "connect" sends the user — the project's Search Performance page. */
  connectLink: LinkOptions;
}) {
  const notice = getGscAccessNotice(reason);

  return (
    <>
      <p className={notice.tone === "warning" ? "text-warning" : undefined}>
        {notice.title}
      </p>
      {notice.detail ? (
        <p className="mt-1 text-xs text-base-content/60">{notice.detail}</p>
      ) : null}
      {notice.action.kind === "connect" ? (
        <Link {...connectLink} className="btn btn-primary btn-sm mt-3">
          {notice.action.label}
        </Link>
      ) : notice.action.kind === "enable_api" ? (
        <a
          href={notice.action.href}
          target="_blank"
          rel="noreferrer"
          className="btn btn-sm mt-3"
        >
          {notice.action.label}
        </a>
      ) : (
        <button
          type="button"
          className="btn btn-sm mt-3 gap-2"
          onClick={() => void startGscLink(window.location.href)}
        >
          <GoogleGlyph className="size-4" />
          {notice.action.label}
        </button>
      )}
    </>
  );
}
