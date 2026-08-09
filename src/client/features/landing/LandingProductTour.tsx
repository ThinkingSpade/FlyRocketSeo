import type { ComponentType } from "react";
import {
  Activity,
  Bookmark,
  ClipboardCheck,
  FileSearch,
  FileText,
  Globe,
  Grid3x3,
  Lightbulb,
  Link2,
  ListOrdered,
  MapPin,
  MessageSquare,
  Network,
  NotebookPen,
  PencilRuler,
  Search,
  Sparkles,
  Split,
  TrendingUp,
  Users,
  Waypoints,
} from "lucide-react";
import { GoogleGlyphMuted } from "@/client/features/gsc/GoogleGlyph";
import { CardGrid, FeatureCard, Section, SectionHeading } from "./parts";

/**
 * The product tour: the two halves of the app, in the order the sidebar
 * presents them — Research (point it at anything) then My Site (point it at
 * yours).
 *
 * Two rules hold this together:
 *
 * 1. Every card title is the sidebar label, verbatim, with the sidebar's own
 *    icon. Someone who reads this page and then signs in should find the thing
 *    they read about under the name they read it under. That is worth more than
 *    any nicer-sounding marketing name.
 * 2. Twenty-two equal boxes is a wall, not a tour, so each half is broken into
 *    labelled clusters. Research falls into four honest triads; the site half
 *    leads with the two capabilities the README itself singles out (the ranked
 *    action plan and the print-ready report) at double width, then two rows of
 *    four. Nothing is dropped to make the grid tidy.
 */

type Capability = {
  /** The sidebar label, verbatim. */
  title: string;
  /** The sidebar's icon for this route, where one exists. */
  icon: ComponentType<{ className?: string }>;
  /** One line, plain, no adjectives — what you would tell a colleague. */
  blurb: string;
};

type CapabilityGroup = {
  label: string;
  columns: 2 | 3 | 4;
  items: Capability[];
};

const RESEARCH_GROUPS: CapabilityGroup[] = [
  {
    label: "Keywords and SERPs",
    columns: 3,
    items: [
      {
        title: "Keyword Research",
        icon: Search,
        blurb: "Ideas, search demand, and how hard each one looks to rank for.",
      },
      {
        title: "Keyword Trends",
        icon: Activity,
        blurb:
          "Interest over time, so you spot seasonality before committing to a topic.",
      },
      {
        title: "SERP Overview",
        icon: ListOrdered,
        blurb:
          "Who ranks in the live results for a keyword, and what else is on the page.",
      },
    ],
  },
  {
    label: "Content and pages",
    columns: 3,
    items: [
      {
        title: "Content Optimizer",
        icon: NotebookPen,
        blurb:
          "A brief built from the pages that already rank: length, subtopics, questions.",
      },
      {
        title: "Page Explorer",
        icon: FileSearch,
        blurb: "Point at any URL and see its keywords, traffic, and backlinks.",
      },
      {
        title: "Topic Clusters",
        icon: Network,
        blurb:
          "Turn one topic into a hub-and-spoke plan of articles worth writing.",
      },
    ],
  },
  {
    label: "Domains and links",
    columns: 3,
    items: [
      {
        title: "Domain Overview",
        icon: Globe,
        blurb:
          "A whole domain at a glance: traffic, keywords, and backlink profile.",
      },
      {
        title: "Competitors",
        icon: Users,
        blurb:
          "Who else ranks for your keywords, and what they have that you don't.",
      },
      {
        title: "Backlinks",
        icon: Link2,
        blurb:
          "Who links to a site, which pages attract them, and what changed.",
      },
    ],
  },
  {
    label: "AI answers and local",
    columns: 3,
    items: [
      {
        title: "AI Visibility",
        icon: Sparkles,
        blurb: "How AI search cites a brand or domain, and what it links to.",
      },
      {
        title: "Prompt Explorer",
        icon: MessageSquare,
        blurb:
          "Ask one prompt across several models and compare the answers side by side.",
      },
      {
        title: "Local SEO",
        icon: MapPin,
        blurb:
          "Look up a Google Business Profile: ratings, categories, reviews, claimed status.",
      },
    ],
  },
];

const SITE_GROUPS: CapabilityGroup[] = [
  {
    // Two cards at double width: the README glosses exactly these two, and they
    // are the ends of the job — where you start and what you hand over.
    label: "The plan, and the report",
    columns: 2,
    items: [
      {
        title: "SEO Opportunities",
        icon: Lightbulb,
        blurb: "What to fix next, ranked by the traffic at stake.",
      },
      {
        title: "Client Report",
        icon: FileText,
        blurb:
          "Everything the project's data says, on one page you can print and send.",
      },
    ],
  },
  {
    label: "Where you stand",
    columns: 4,
    items: [
      {
        title: "GSC Insights",
        icon: GoogleGlyphMuted,
        blurb:
          "Clicks, impressions, CTR, and position, straight from Google Search Console.",
      },
      {
        title: "Rank Tracking",
        icon: TrendingUp,
        blurb:
          "Check your keyword positions on a schedule and watch them move.",
      },
      {
        title: "Local Rank Grid",
        icon: Grid3x3,
        blurb:
          "Where you actually show up on the map, across a grid of nearby points.",
      },
      {
        title: "Saved Keywords",
        icon: Bookmark,
        blurb:
          "Keep the keywords worth acting on, tag them, and come back to them.",
      },
    ],
  },
  {
    label: "What to change",
    columns: 4,
    items: [
      {
        title: "Site Audit",
        icon: ClipboardCheck,
        blurb: "Crawl the site and list the technical problems it finds.",
      },
      {
        title: "On-Page Fixes",
        icon: PencilRuler,
        blurb:
          "Title, meta, heading, and alt-text rewrites you approve one by one.",
      },
      {
        title: "Cannibalization",
        icon: Split,
        blurb: "Where several of your own pages rank for the same query.",
      },
      {
        title: "Link Opportunities",
        icon: Waypoints,
        blurb:
          "Internal links to add: your pages Google already ties to a keyword.",
      },
    ],
  },
];

/**
 * One labelled cluster of cards.
 *
 * The label is a `<p>`, not a heading: `FeatureCard` already owns the `<h3>`
 * inside each card, so a heading here would sit at the same level as the things
 * it introduces. It borrows the sidebar's own group-label styling — small,
 * uppercase, heavily muted — which is the same cue doing the same job in both
 * places, a notch less faint here because it carries a full-width band.
 */
function CapabilityCluster({ group }: { group: CapabilityGroup }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-base-content/45">
        {group.label}
      </p>
      <CardGrid columns={group.columns}>
        {group.items.map(({ title, icon: Icon, blurb }) => (
          <FeatureCard
            key={title}
            icon={<Icon className="size-5" />}
            title={title}
          >
            {blurb}
          </FeatureCard>
        ))}
      </CardGrid>
    </div>
  );
}

/** The half of the app that points at anything — a competitor's domain, a
 *  prospect's page, a keyword you have never touched. */
export function LandingResearch() {
  return (
    <Section id="research">
      <SectionHeading
        eyebrow="Research"
        title="Research anything, not just your own site"
      >
        Point these at any keyword, URL or domain — a competitor&rsquo;s, a
        prospect&rsquo;s, or your own. Every run is recorded against the
        project, so a tab you have opened before comes back showing that result
        rather than a blank form.
      </SectionHeading>

      {RESEARCH_GROUPS.map((group) => (
        <CapabilityCluster key={group.label} group={group} />
      ))}
    </Section>
  );
}

/** The half that only ever looks at the project's own domain — the sidebar's
 *  "My Site" group, in the same order. */
export function LandingYourSite() {
  return (
    <Section id="your-site" tone="raised">
      <SectionHeading
        eyebrow="Your own site"
        // A string prop, not JSX children, so the curly apostrophe has to be
        // the character itself — an entity would render literally here.
        title="Your site, from what’s wrong to what you send the client"
      >
        A project is one domain. This half is everything the app has on that
        domain — Search Console, positions, crawls, fixes — and it ends in
        something you can print.
      </SectionHeading>

      {SITE_GROUPS.map((group) => (
        <CapabilityCluster key={group.label} group={group} />
      ))}
    </Section>
  );
}
