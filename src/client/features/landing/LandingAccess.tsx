import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@cloudflare/kumo/components/button";
import { ArrowRight, Lock } from "lucide-react";
import { Section, SectionHeading } from "./parts";

/**
 * The closing band and the footer.
 *
 * The honest ending for a tool most visitors cannot sign into. Saying so
 * plainly is better than a call to action that fails: someone who is not on the
 * allow-list learns it here rather than at the sign-in form, and someone who is
 * gets the one link they came for.
 */

/**
 * The access band.
 *
 * Stated without apology, in the README's own words — including "fails closed",
 * which is the part that matters. The call to action is addressed to people who
 * already have access; there is deliberately nothing here that invites a
 * request, because no route exists to receive one.
 */
export function LandingAccess() {
  return (
    <Section tone="raised" id="access">
      <div className="flex flex-col items-center gap-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-200 px-3 py-1.5 text-xs font-medium tracking-wide text-base-content/70">
          <Lock className="size-3.5" aria-hidden="true" />
          Allow-list enforced
        </span>

        <SectionHeading
          align="center"
          eyebrow="Access"
          title="Invite-only, and it fails closed."
        >
          A private, self-hosted SEO research and reporting tool for one team.
          Access is restricted to an email allow-list plus invited teammates;
          the allow-list fails closed, so an address that is not on it and holds
          no invite cannot sign in.
        </SectionHeading>

        <div className="flex flex-col items-center gap-3">
          <Link
            to="/sign-in"
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            Sign in
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <p className="text-sm text-base-content/55">
            For teammates who already have access.
          </p>
        </div>
      </div>
    </Section>
  );
}

/**
 * The footer.
 *
 * Mark, name, copyright, sign-in. No social icons for accounts that do not
 * exist and no legal pages that are not routes — an empty link is worse than a
 * short footer.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-base-300 bg-base-100 px-5 py-10 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:gap-6 sm:text-left">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-mark.png"
            alt=""
            width={24}
            height={24}
            className="size-6 rounded"
          />
          <span className="text-sm font-semibold text-base-content">
            FlyRocketSEO
          </span>
        </div>

        <p className="text-sm text-base-content/50">
          &copy; {new Date().getFullYear()} FlyRocketSEO
        </p>

        <Link
          to="/sign-in"
          className="app-link-subtle text-sm font-medium text-base-content/70 transition-colors duration-(--motion-duration-base) ease-out-soft hover:text-base-content"
        >
          Sign in
        </Link>
      </div>
    </footer>
  );
}
