import { Link } from "@tanstack/react-router";
import type { LinkOptions } from "@tanstack/react-router";
import type { ComponentType } from "react";

const navItemBaseClass =
  "relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-base-content/70";

export const navItemClass = `${navItemBaseClass} transition-colors hover:bg-base-300/50 hover:text-base-content`;

const navItemActiveProps = {
  className: "bg-base-300/50 font-medium text-base-content",
};

export function SidebarNavLink({
  icon: Icon,
  label,
  onNavigate,
  linkProps,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onNavigate?: () => void;
  linkProps: LinkOptions;
}) {
  return (
    <Link
      {...linkProps}
      onClick={onNavigate}
      // The Overview item points at the project layout route itself, so a
      // prefix match would light it up on every sub-route; match it exactly so
      // it's only active on the dashboard. Other items keep the prefix match.
      activeOptions={{
        exact: linkProps.to === "/p/$projectId",
        includeSearch: false,
      }}
      className={navItemClass}
      activeProps={navItemActiveProps}
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          {isActive ? (
            <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-primary" />
          ) : null}
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </>
      )}
    </Link>
  );
}
