import { useEffect, useState } from "react";
import { Globe } from "@phosphor-icons/react";

/**
 * The project's own site icon, for lists where several projects sit together
 * and the domain is the thing you actually recognise.
 *
 * Sourced from Google's favicon service rather than `https://<domain>/favicon.ico`
 * directly: plenty of sites declare their icon only via a `<link rel="icon">`
 * in the document head, or serve it from a CDN path, so fetching the root
 * would miss them and render a broken image for a site that plainly has one.
 * The service also normalises size and format, which a raw .ico does not.
 *
 * Nothing here is load-bearing. A project with no domain, a site with no icon,
 * and a blocked request all land on the same neutral globe, so the control
 * looks deliberate in every case rather than showing a broken-image glyph.
 */

/** Requested at 2x the 16px render box so the icon stays sharp on retina. */
const FAVICON_SIZE = 32;

export function faviconUrl(domain: string): string | null {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!host || !host.includes(".")) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${FAVICON_SIZE}`;
}

export function ProjectFavicon({
  domain,
  className = "",
}: {
  domain: string | null;
  /** Sizing comes from the caller so the same component fits a trigger row and
   *  a denser menu row without a size prop enum. */
  className?: string;
}) {
  const src = domain ? faviconUrl(domain) : null;
  const [failed, setFailed] = useState(false);

  // Switching projects reuses this component with a new domain, so a previous
  // failure must not suppress an icon the new site does have.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const box = `flex shrink-0 items-center justify-center overflow-hidden rounded-[4px] ${className}`;

  if (!src || failed) {
    return (
      <span className={`${box} bg-base-200`} aria-hidden="true">
        <Globe className="size-3 text-base-content/40" />
      </span>
    );
  }

  return (
    <span className={`${box} bg-base-200`}>
      <img
        src={src}
        alt=""
        width={16}
        height={16}
        // Decorative: every call site renders the project name beside it, so
        // announcing the icon would just repeat the label.
        aria-hidden="true"
        loading="lazy"
        className="size-4"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
