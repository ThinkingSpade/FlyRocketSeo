import { useMemo, type ComponentType, type ReactNode } from "react";
import { Link, type LinkOptions } from "@tanstack/react-router";
import { getProjectNavGroups } from "@/client/navigation/items";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

// ---------------------------------------------------------------------------
// Project nav link reuse
// ---------------------------------------------------------------------------

type ProjectNavItem = ReturnType<
  typeof getProjectNavGroups
>[number]["items"][number];
type ProjectNavTo = ProjectNavItem["to"];

/** Icon + label stripped off; the rest spreads straight into <Link>. */
type ProjectNavLink = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  linkProps: LinkOptions;
};

/**
 * Reuse the sidebar's typed link options so dashboard links (card headers,
 * empty-state CTAs, quick actions) can never drift from the real routes or
 * their search defaults.
 */
export function useProjectNavLinks(projectId: string) {
  return useMemo(() => {
    const items = getProjectNavGroups(projectId).flatMap(
      (group) => group.items,
    );
    const get = (to: ProjectNavTo): ProjectNavLink => {
      const item = items.find((navItem) => navItem.to === to);
      if (!item) throw new Error(`Unknown project nav link: ${to}`);
      const { icon, label, ...linkProps } = item;
      return { icon, label, linkProps };
    };
    return { get };
  }, [projectId]);
}

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

export function DashboardCard({
  icon: Icon,
  title,
  headerLink,
  headerLinkLabel = "View all",
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  headerLink?: LinkOptions;
  headerLinkLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Icon className="size-4 text-base-content/60" />
            {title}
          </h2>
          {headerLink ? (
            <Link
              {...headerLink}
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              {headerLinkLabel} →
            </Link>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stat tiles
// ---------------------------------------------------------------------------

type Delta = { text: string; positive: boolean } | null;

/** A stat tile matching the audit StatCard, with an optional colored delta. */
export function DeltaStatTile({
  label,
  value,
  delta,
  deltaTitle,
}: {
  label: string;
  value: string;
  delta?: Delta;
  deltaTitle?: string;
}) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body p-4">
        <p className="text-xs uppercase tracking-wide text-base-content/60">
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-semibold">{value}</p>
          {delta ? (
            <span
              className={`text-xs font-medium ${delta.positive ? "text-success" : "text-error"}`}
              title={deltaTitle}
            >
              {delta.text}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-card states (isolated: one card's failure never blanks the dashboard)
// ---------------------------------------------------------------------------

export function CardError({ error }: { error: unknown }) {
  return (
    <div className="alert alert-error text-sm">
      {getStandardErrorMessage(error)}
    </div>
  );
}

export function CardEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-base-content/60">
      {children}
    </div>
  );
}

/** Skeleton grid used while a card's own query is pending. */
export function CardTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2 p-4">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-7 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting + delta helpers
// ---------------------------------------------------------------------------

const numberFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return numberFormat.format(Math.round(value));
}

export function formatCtr(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatPosition(value: number): string {
  return value.toFixed(1);
}

/** Relative % change; null when there's no baseline to compare against. */
export function percentDelta(current: number, previous: number): Delta {
  if (previous <= 0) return null;
  const change = (current - previous) / previous;
  const pct = (change * 100).toFixed(1);
  return { text: `${change >= 0 ? "+" : ""}${pct}%`, positive: change >= 0 };
}

/** Position falls as rankings improve, so the delta is inverted. */
export function positionDelta(current: number, previous: number): Delta {
  if (previous <= 0 || current <= 0) return null;
  const change = previous - current;
  return {
    text: `${change >= 0 ? "+" : ""}${change.toFixed(1)}`,
    positive: change >= 0,
  };
}

/** A percentage-point delta (e.g. visibility). Hidden when flat or unknown. */
export function pointsDelta(delta: number | null): Delta {
  if (delta === null || Math.abs(delta) < 0.05) return null;
  return {
    text: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`,
    positive: delta >= 0,
  };
}

/** A whole-count delta (e.g. ranking keywords). Hidden when flat. */
export function countDelta(delta: number): Delta {
  if (delta === 0) return null;
  return { text: `${delta >= 0 ? "+" : ""}${delta}`, positive: delta >= 0 };
}
