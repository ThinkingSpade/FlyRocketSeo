import {
  Activity,
  Bookmark,
  Bot,
  ClipboardCheck,
  FileSearch,
  FileText,
  Globe,
  Grid3x3,
  LayoutDashboard,
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
import { linkOptions } from "@tanstack/react-router";
import { GoogleGlyphMuted } from "@/client/features/gsc/GoogleGlyph";

const projectNavItems = [
  {
    to: "/p/$projectId" as const,
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    to: "/p/$projectId/keywords" as const,
    label: "Keyword Research",
    icon: Search,
  },
  {
    to: "/p/$projectId/trends" as const,
    label: "Keyword Trends",
    icon: Activity,
  },
  {
    to: "/p/$projectId/serp" as const,
    label: "SERP Overview",
    icon: ListOrdered,
  },
  {
    to: "/p/$projectId/content" as const,
    label: "Content Optimizer",
    icon: NotebookPen,
  },
  {
    to: "/p/$projectId/page" as const,
    label: "Page Explorer",
    icon: FileSearch,
  },
  {
    to: "/p/$projectId/clusters" as const,
    label: "Topic Clusters",
    icon: Network,
  },
  {
    to: "/p/$projectId/saved" as const,
    label: "Saved Keywords",
    icon: Bookmark,
  },
  {
    to: "/p/$projectId/rank-tracking" as const,
    label: "Rank Tracking",
    icon: TrendingUp,
  },
  {
    to: "/p/$projectId/opportunities" as const,
    label: "SEO Opportunities",
    icon: Lightbulb,
  },
  {
    to: "/p/$projectId/search-performance" as const,
    label: "GSC Insights",
    icon: GoogleGlyphMuted,
  },
  {
    to: "/p/$projectId/links" as const,
    label: "Link Opportunities",
    icon: Waypoints,
  },
  {
    to: "/p/$projectId/cannibalization" as const,
    label: "Cannibalization",
    icon: Split,
  },
  {
    to: "/p/$projectId/local-grid" as const,
    label: "Local Rank Grid",
    icon: Grid3x3,
  },
  {
    to: "/p/$projectId/domain" as const,
    label: "Domain Overview",
    icon: Globe,
  },
  {
    to: "/p/$projectId/backlinks" as const,
    label: "Backlinks",
    icon: Link2,
  },
  {
    to: "/p/$projectId/competitors" as const,
    label: "Competitors",
    icon: Users,
  },
  {
    to: "/p/$projectId/audit" as const,
    label: "Site Audit",
    icon: ClipboardCheck,
  },
  {
    to: "/p/$projectId/on-page" as const,
    label: "On-Page Fixes",
    icon: PencilRuler,
  },
  {
    to: "/p/$projectId/report" as const,
    label: "Client Report",
    icon: FileText,
  },
  {
    to: "/p/$projectId/brand-lookup" as const,
    label: "Brand Lookup",
    icon: Sparkles,
  },
  {
    to: "/p/$projectId/prompt-explorer" as const,
    label: "Prompt Explorer",
    icon: MessageSquare,
  },
  {
    to: "/p/$projectId/local" as const,
    label: "Local SEO",
    icon: MapPin,
  },
] as const;

const aiNavItem = linkOptions({
  to: "/ai" as const,
  label: "AI & MCP",
  icon: Bot,
});

// Always-visible sidebar group (not project-scoped, unlike the groups below).
export const connectNavGroup = {
  label: "Connect",
  items: [aiNavItem],
};

function getProjectNavItems(projectId: string) {
  return linkOptions(
    projectNavItems.map((item) => ({
      ...item,
      params: { projectId },
      search: {},
    })),
  );
}

// Grouped by scope: "My Site" is the project's own domain (tracked data),
// "Research" is point-at-anything lookup tools.
export function getProjectNavGroups(projectId: string) {
  const all = getProjectNavItems(projectId);
  const byPath = (path: (typeof projectNavItems)[number]["to"]) =>
    all.find((i) => i.to === path)!;

  return [
    {
      label: "Research",
      items: [
        byPath("/p/$projectId"),
        byPath("/p/$projectId/keywords"),
        byPath("/p/$projectId/trends"),
        byPath("/p/$projectId/serp"),
        byPath("/p/$projectId/content"),
        byPath("/p/$projectId/page"),
        byPath("/p/$projectId/clusters"),
        byPath("/p/$projectId/domain"),
        byPath("/p/$projectId/competitors"),
        byPath("/p/$projectId/backlinks"),
        byPath("/p/$projectId/brand-lookup"),
        byPath("/p/$projectId/prompt-explorer"),
        byPath("/p/$projectId/local"),
      ],
    },
    {
      label: "My Site",
      items: [
        byPath("/p/$projectId/opportunities"),
        byPath("/p/$projectId/search-performance"),
        byPath("/p/$projectId/links"),
        byPath("/p/$projectId/cannibalization"),
        byPath("/p/$projectId/local-grid"),
        byPath("/p/$projectId/rank-tracking"),
        byPath("/p/$projectId/saved"),
        byPath("/p/$projectId/audit"),
        byPath("/p/$projectId/on-page"),
        byPath("/p/$projectId/report"),
      ],
    },
  ];
}

export const dataforseoHelpLinkOptions = linkOptions({
  to: "/help/dataforseo-api-key",
});
