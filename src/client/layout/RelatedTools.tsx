import { Link, useLocation } from "@tanstack/react-router";
import { getProjectNavGroups } from "@/client/navigation/items";

export function RelatedTools({ projectId }: { projectId: string | null }) {
  const location = useLocation();
  if (!projectId) return null;
  const group = getProjectNavGroups(projectId).find((candidate) =>
    candidate.items.some(
      (item) => location.pathname === item.to.replace("$projectId", projectId),
    ),
  );
  if (!group || group.label === "Overview" || group.items.length < 2)
    return null;
  return (
    <nav
      aria-label="Related tools"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-base-300 px-4 py-2 md:px-6"
    >
      {group.items.map(({ icon: Icon, label, ...linkProps }) => (
        <Link
          key={linkProps.to}
          {...linkProps}
          activeOptions={{ exact: true, includeSearch: false }}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-base-content/65 hover:bg-base-200"
          activeProps={{
            className: "bg-base-200 font-semibold text-base-content",
            "aria-current": "page",
          }}
        >
          <Icon className="size-3.5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
