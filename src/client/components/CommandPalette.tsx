import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CornerDownLeft,
  Folder,
  FolderCog,
  Keyboard,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { openKeyboardShortcuts } from "@/client/components/KeyboardShortcutsHelp";
import { getProjectNavGroups } from "@/client/navigation/items";
import { getProjects } from "@/serverFunctions/projects";
import {
  getLastProjectId,
  setLastProjectId,
} from "@/client/lib/active-project";
import { useThemePreference } from "@/client/lib/theme";
import { useSession } from "@/lib/auth-client";

// Module-level open channel: the global keydown listener lives inside the
// palette, but other surfaces (the sidebar trigger) need to open it without a
// shared store. They dispatch this window event; the mounted palette listens.
const OPEN_EVENT = "openseo:open-command-palette";

/** Open the command palette from anywhere (e.g. the sidebar trigger button). */
export function openCommandPalette() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type IconComponent = ComponentType<{ className?: string }>;

type Command = {
  id: string;
  label: string;
  sublabel?: string;
  icon: IconComponent;
  run: () => void;
};

type CommandSection = {
  heading: string;
  commands: Command[];
};

/** Case-insensitive substring match, falling back to a subsequence match so
 * "krs" matches "Keyword Research". */
function matchesQuery(query: string, ...haystacks: (string | undefined)[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystacks.some((raw) => {
    if (!raw) return false;
    const text = raw.toLowerCase();
    if (text.includes(q)) return true;
    let i = 0;
    for (let j = 0; j < text.length && i < q.length; j += 1) {
      if (text[j] === q[i]) i += 1;
    }
    return i === q.length;
  });
}

/** Whether the current platform uses the Cmd key (guarded for SSR). */
function detectIsMac(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad|ipod/i.test(navigator.userAgent)
  );
}

export function CommandPalette() {
  const { data: session } = useSession();
  // Don't mount the listener or overlay on signed-out pages.
  if (!session?.user) return null;
  return <CommandPaletteImpl />;
}

function CommandPaletteImpl() {
  const navigate = useNavigate();
  const { setThemePreference } = useThemePreference();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const projects = useMemo(
    () => projectsQuery.data ?? [],
    [projectsQuery.data],
  );

  // Derive the active project the same way AppShell does: prefer the route
  // param, else the remembered project (if still valid), else the most recent.
  const routeProjectId = useParams({
    strict: false,
    select: (params) => params.projectId ?? null,
  });
  const [rememberedProjectId] = useState<string | null>(() =>
    getLastProjectId(),
  );
  const fallbackProjectId =
    projects.find((project) => project.id === rememberedProjectId)?.id ??
    projects[0]?.id ??
    null;
  const activeProjectId =
    routeProjectId ?? fallbackProjectId ?? rememberedProjectId;

  const isMac = useMemo(detectIsMac, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const requestOpen = useCallback(() => {
    const active = document.activeElement;
    previouslyFocusedRef.current =
      active instanceof HTMLElement ? active : null;
    setOpen(true);
  }, []);

  // Global keyboard: Cmd/Ctrl+K toggles from anywhere (including inputs — the
  // modifier means it never hijacks plain typing); Escape closes when open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) {
          close();
        } else {
          requestOpen();
        }
        return;
      }
      if (open && event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const onOpenEvent = () => {
      if (!open) requestOpen();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, [open, close, requestOpen]);

  // On open: reset the query and focus the input. On close: restore focus to
  // whatever was focused before the palette opened.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    } else {
      previouslyFocusedRef.current?.focus?.();
    }
  }, [open]);

  const sections = useMemo<CommandSection[]>(() => {
    const result: CommandSection[] = [];

    if (activeProjectId) {
      const navItems = getProjectNavGroups(activeProjectId).flatMap(
        (group) => group.items,
      );
      result.push({
        heading: "Go to",
        commands: navItems.map((item) => {
          const { icon, label, ...linkProps } = item;
          return {
            id: `nav:${item.to}`,
            label,
            icon,
            run: () => void navigate(linkProps),
          };
        }),
      });
    }

    const otherProjects = projects.filter(
      (project) => project.id !== activeProjectId,
    );
    if (otherProjects.length > 0) {
      result.push({
        heading: "Switch project",
        commands: otherProjects.map((project) => ({
          id: `project:${project.id}`,
          label: project.name,
          sublabel: project.domain ?? undefined,
          icon: Folder,
          run: () => {
            setLastProjectId(project.id);
            void navigate({
              to: "/p/$projectId/keywords",
              params: { projectId: project.id },
            });
          },
        })),
      });
    }

    result.push({
      heading: "Preferences",
      commands: [
        {
          id: "theme:light",
          label: "Theme: Light",
          icon: Sun,
          run: () => setThemePreference("light"),
        },
        {
          id: "theme:dark",
          label: "Theme: Dark",
          icon: Moon,
          run: () => setThemePreference("dark"),
        },
        {
          id: "theme:system",
          label: "Theme: System",
          icon: Monitor,
          run: () => setThemePreference("system"),
        },
        {
          id: "link:settings",
          label: "Settings",
          icon: Settings,
          run: () => void navigate({ to: "/settings" }),
        },
        {
          id: "link:ai",
          label: "AI & MCP",
          icon: Bot,
          run: () => void navigate({ to: "/ai" }),
        },
        {
          id: "link:projects",
          label: "Manage projects",
          icon: FolderCog,
          run: () => void navigate({ to: "/projects" }),
        },
        {
          id: "help:shortcuts",
          label: "Keyboard shortcuts",
          icon: Keyboard,
          run: () => openKeyboardShortcuts(),
        },
      ],
    });

    return result;
  }, [activeProjectId, projects, navigate, setThemePreference]);

  const { filteredSections, flatCommands } = useMemo(() => {
    const filtered: CommandSection[] = [];
    const flat: Command[] = [];
    for (const section of sections) {
      const commands = section.commands.filter((command) =>
        matchesQuery(query, command.label, command.sublabel),
      );
      if (commands.length > 0) {
        filtered.push({ heading: section.heading, commands });
        flat.push(...commands);
      }
    }
    return { filteredSections: filtered, flatCommands: flat };
  }, [sections, query]);

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    flatCommands.forEach((command, index) => map.set(command.id, index));
    return map;
  }, [flatCommands]);

  // Keep the highlighted row scrolled into view as it moves.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, query]);

  const activate = useCallback((command: Command) => {
    command.run();
    setOpen(false);
  }, []);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatCommands.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % flatCommands.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (index) => (index - 1 + flatCommands.length) % flatCommands.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = flatCommands[activeIndex];
      if (command) activate(command);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-center bg-black/50 pt-[12vh]"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-base-300 px-3">
          <Search className="h-4 w-4 shrink-0 text-base-content/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            aria-label="Command menu"
            placeholder="Search sections, projects, settings…"
            className="w-full bg-transparent py-3 text-sm text-base-content placeholder:text-base-content/40 focus:outline-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <kbd className="kbd kbd-sm shrink-0 text-base-content/60">
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </div>

        <ul
          role="listbox"
          aria-label="Commands"
          className="menu min-h-0 flex-1 flex-nowrap gap-0 overflow-y-auto p-2"
        >
          {flatCommands.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-base-content/50">
              No results
            </li>
          ) : (
            filteredSections.map((section) => (
              <li key={section.heading} className="menu-none">
                <ul className="gap-0.5 px-0">
                  <li
                    role="presentation"
                    className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-base-content/40"
                  >
                    {section.heading}
                  </li>
                  {section.commands.map((command) => {
                    const index = indexById.get(command.id) ?? -1;
                    const isActive = index === activeIndex;
                    const Icon = command.icon;
                    return (
                      <li key={command.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          ref={isActive ? activeRowRef : undefined}
                          onClick={() => activate(command)}
                          onMouseMove={() => setActiveIndex(index)}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                            isActive
                              ? "bg-base-300/50 text-base-content"
                              : "text-base-content/70"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex min-w-0 flex-1 flex-col text-left">
                            <span className="truncate">{command.label}</span>
                            {command.sublabel ? (
                              <span className="truncate text-xs text-base-content/50">
                                {command.sublabel}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center gap-3 border-t border-base-300 px-3 py-2 text-xs text-base-content/50">
          <span className="flex items-center gap-1">
            <kbd className="kbd kbd-xs">↑</kbd>
            <kbd className="kbd kbd-xs">↓</kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd kbd-xs">
              <CornerDownLeft className="h-3 w-3" />
            </kbd>
            to select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd kbd-xs">Esc</kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}
