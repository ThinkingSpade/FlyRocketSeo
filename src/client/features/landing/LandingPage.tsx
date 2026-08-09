import { LandingNav, LandingHero } from "./LandingHero";
import { LandingResearch, LandingYourSite } from "./LandingProductTour";
import { LandingSpending, LandingProjects, LandingAgents } from "./LandingHow";
import { LandingAccess, LandingFooter } from "./LandingAccess";

/**
 * The public front door, shown at "/" to a visitor without a session.
 *
 * The order is an argument rather than a list of features: what this is, then
 * the two halves of what it does, then the thing that actually distinguishes it
 * — that nothing here meters you — then how the work is organised, then the
 * agent surface, and finally the honest note that the door is locked.
 *
 * Every claim on this page traces to README.md. There is no social proof
 * because there is none to show: an invite-only tool for one team has no logos,
 * no user count and no testimonials, and inventing them would be a lie in the
 * one place a stranger is most likely to believe it.
 *
 * The bands alternate base/raised the whole way down, which is why the tones
 * are set here in composition order rather than chosen inside each section —
 * a section cannot know what precedes it, and two of the same tone in a row
 * lose the boundary between them. `Section` owns the reveal, so scrolling
 * brings each band's children in one after another with no wiring here.
 */
export function LandingPage() {
  // `h-dvh overflow-y-auto`, not `min-h-dvh`: app.css locks the document with
  // `html, body { height: 100%; overflow: hidden }` because this is a
  // fixed-height dashboard whose inner pane scrolls. A long page inside that
  // does not scroll — it is simply clipped at the fold, and everything below it
  // is unreachable. So the landing page brings its own scroll container, the
  // same way AppPageShell does for the app's pages. The sticky nav sticks to
  // this element rather than the viewport, which is the behaviour we want
  // anyway.
  return (
    <div className="h-dvh overflow-y-auto bg-base-100 text-base-content">
      <LandingNav />
      <main>
        {/* raised */}
        <LandingHero />
        {/* base */}
        <LandingResearch />
        {/* raised */}
        <LandingYourSite />
        {/* base */}
        <LandingSpending />
        {/* raised */}
        <LandingProjects />
        {/* base */}
        <LandingAgents />
        {/* raised */}
        <LandingAccess />
      </main>
      <LandingFooter />
    </div>
  );
}
