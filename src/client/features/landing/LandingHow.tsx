import type { ReactNode } from "react";
import {
  History,
  KeyRound,
  MousePointerClick,
  Plug,
  RotateCcw,
  Search,
  Sparkles,
  Terminal,
} from "lucide-react";
import { CardGrid, FeatureCard, Section, SectionHeading } from "./parts";

/**
 * The three closing "how it works" bands: what a lookup costs, how the work is
 * organised, and how an agent reaches the same tooling.
 *
 * Every claim in this file is a restatement of the README — the Spending and
 * "MCP and agent skills" sections in particular. Nothing here promises a
 * behaviour the app has not already documented, because the whole argument of
 * the spending band is that the product is precise about money.
 *
 * Band tones run raised → base → raised so each one separates from the last
 * without a rule between them.
 */

/**
 * The spending band.
 *
 * This is the load-bearing section of the page. Rather than argue against
 * subscriptions, it states the absence as fact in the heading and then spends
 * its weight on the one guarantee that follows from it: metered work only ever
 * happens on a click. That claim gets the only strong Signal fill on the band,
 * because it is the sentence a visitor should leave with.
 */
export function LandingSpending() {
  return (
    <Section tone="base" id="spending">
      <SectionHeading
        eyebrow="Spending"
        title="There is no subscription, no plan tiers and no credit balance."
      >
        The only thing a lookup can cost is what DataForSEO charges for it.
      </SectionHeading>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-5 rounded-2xl border border-primary/30 bg-primary/10 p-6 md:flex-row md:items-start md:gap-8 md:p-10">
          <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary-content">
            <MousePointerClick className="size-3.5" aria-hidden="true" />
            Opt in, every time
          </span>
          <div className="flex flex-col gap-3">
            <p className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              Nothing metered ever runs on its own.
            </p>
            <p className="max-w-2xl text-base leading-relaxed text-base-content/70 text-pretty">
              Every paid lookup happens because someone clicked a control that
              said it would spend, and the app shows the cost before it runs.
            </p>
          </div>
        </div>

        <CardGrid columns={3}>
          <FeatureCard
            icon={<KeyRound className="size-4" aria-hidden="true" />}
            title="Billed by DataForSEO, not by us"
          >
            Paid lookups go straight to DataForSEO on the team&rsquo;s own key,
            at DataForSEO&rsquo;s rates.
          </FeatureCard>
          <FeatureCard
            icon={<History className="size-4" aria-hidden="true" />}
            title="Reopening never re-spends"
          >
            Re-opening a past analysis restores the stored result from R2 and
            never re-spends.
          </FeatureCard>
          <FeatureCard
            icon={<Search className="size-4" aria-hidden="true" />}
            title="Search Console costs nothing"
          >
            Google Search Console data is free.
          </FeatureCard>
        </CardGrid>
      </div>
    </Section>
  );
}

/** The three beats of setting up and returning to a project. Numbered rather
 *  than iconified: the order is the point. */
const PROJECT_STEPS: ReadonlyArray<{ title: string; body: ReactNode }> = [
  {
    title: "Point a project at a domain",
    body: "Each project maps to one domain, so there is never a question of which site a figure belongs to.",
  },
  {
    title: "Run the tabs you need",
    body: "Research, your own site's data and the client report are all recorded per project as you run them.",
  },
  {
    title: "Come back to it",
    body: "A tab you have run before reopens showing that result instead of a blank form.",
  },
];

/**
 * The projects band.
 *
 * The recorded-per-project detail is the quality-of-life win worth spelling
 * out, so the steps end on it and the note underneath explains what it means
 * for money: the second visit reads storage rather than buying the answer
 * again.
 */
export function LandingProjects() {
  return (
    <Section tone="raised" id="projects">
      <SectionHeading eyebrow="Projects" title="One project, one domain.">
        Analyses are recorded per project, so the work you have already done is
        waiting where you left it rather than behind another run.
      </SectionHeading>

      <div className="flex flex-col gap-4">
        <CardGrid columns={3}>
          {PROJECT_STEPS.map((step, index) => (
            <FeatureCard
              key={step.title}
              icon={
                <span className="text-sm font-semibold tabular-nums">
                  {index + 1}
                </span>
              }
              title={step.title}
            >
              {step.body}
            </FeatureCard>
          ))}
        </CardGrid>

        <div className="flex items-start gap-4 rounded-2xl border border-base-300 bg-base-200 p-5 md:p-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <RotateCcw className="size-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold">A second look is free</h3>
            <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
              That restored result comes out of storage, not out of another
              lookup. Reopening a tab you have already run costs nothing, so
              revisiting your own work is never a spending decision.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

/** One copy-and-paste line — an endpoint or a command — with the sentence that
 *  explains what it is for.
 *
 *  `min-w-0` is load-bearing, not defensive: a grid item's default
 *  `min-width: auto` sizes to its widest unbreakable content, so without it the
 *  endpoint URL widens the whole track and the page scrolls sideways at 375px.
 *  With it the well can shrink and its own `overflow-x-auto` takes the scroll. */
function CodeCard({
  icon,
  label,
  value,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-base-300 bg-base-100 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{label}</h3>
      </div>
      <div className="overflow-x-auto rounded-lg border border-base-300 bg-base-200 px-3 py-2.5">
        <code className="font-mono text-xs whitespace-pre text-base-content/80">
          {value}
        </code>
      </div>
      <p className="text-sm leading-relaxed text-base-content/65">{children}</p>
    </div>
  );
}

/**
 * The MCP band.
 *
 * Deliberately the smallest of the three. The honest claim is narrow — there
 * is an endpoint, it is authorized like any other sign-in, and there are skills
 * you can install — so the section shows the two strings you would actually
 * paste and stops there.
 */
export function LandingAgents() {
  return (
    <Section tone="base" id="agents">
      <SectionHeading
        eyebrow="MCP and agent skills"
        title="Callable from an AI client."
      >
        The app exposes an MCP server so AI clients can call its tools.
      </SectionHeading>

      <div className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <CodeCard
            icon={<Plug className="size-3.5" aria-hidden="true" />}
            label="MCP endpoint"
            value="https://flyrocketseo.huy1999nguyen.workers.dev/mcp"
          >
            The first connection sends you through login and authorization.
          </CodeCard>
          <CodeCard
            icon={<Sparkles className="size-3.5" aria-hidden="true" />}
            label="Agent skills"
            value="npx skills add ThinkingSpade/FlyRocketSeo"
          >
            Agent skills for SEO workflows ship with the app in{" "}
            <code className="font-mono text-xs">.agents/skills/</code>.
          </CodeCard>
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-base-300 bg-base-100 p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Terminal className="size-4" aria-hidden="true" />
          </span>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            The in-app{" "}
            <span className="font-medium text-base-content">AI &amp; MCP</span>{" "}
            page has copy-paste commands for Claude Code, Claude Desktop, Cursor
            and Codex.
          </p>
        </div>
      </div>
    </Section>
  );
}
