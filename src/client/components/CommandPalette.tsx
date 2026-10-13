import {
  useId,
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
  Robot,
  Folder,
  FolderSimpleUser,
  Keyboard,
  Monitor,
  Moon,
  MagnifyingGlass,
  Gear,
  Sun,
  X,
} from "@phosphor-icons/react";
import { openKeyboardShortcuts } from "@/client/components/KeyboardShortcutsHelp";
import { getProjectNavGroups } from "@/client/navigation/items";
import { getProjects } from "@/serverFunctions/projects";
import {
  getLastProjectId,
  setLastProjectId,
} from "@/client/lib/active-project";
import { useThemePreference } from "@/client/lib/theme";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { canUseWorkspaceShortcuts } from "@/client/navigation/workspaceShortcuts";
import { Dialog } from "@base-ui/react/dialog";
import { CommandPaletteFooter } from "./CommandPaletteFooter";
import { Kbd } from "@/client/components/Kbd";

// Module-level open channel: the global keydown listener lives inside the
// palette, but other surfaces (the sidebar trigger) need to open it without a
// shared store. They dispatch this window event; the mounted palette listens.
const OPEN_EVENT = "flyrocketseo:open-command-palette";

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
  if (
    !canUseWorkspaceShortcuts(isHostedClientAuthMode(), Boolean(session?.user))
  )
    return null;
  return <CommandPaletteImpl />;
}

function CommandPaletteImpl() {
  const navigate = useNavigate();
  const { setThemePreference } = useThemePreference();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const listId = useId();
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
          icon: Gear,
          run: () => void navigate({ to: "/settings" }),
        },
        {
          id: "link:ai",
          label: "AI & MCP",
          icon: Robot,
          run: () => void navigate({ to: "/ai" }),
        },
        {
          id: "link:projects",
          label: "Manage projects",
          icon: FolderSimpleUser,
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

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="app-dialog-backdrop" />
        <Dialog.Popup
          aria-label="Command menu"
          initialFocus={inputRef}
          finalFocus={() =>
            previouslyFocusedRef.current?.isConnected
              ? previouslyFocusedRef.current
              : document.getElementById("main-content")
          }
          className="app-dialog-panel app-command-menu max-w-lg"
        >
          <div className="flex items-center gap-2.5 border-b border-base-300 px-3">
            <MagnifyingGlass className="h-4 w-4 shrink-0 text-base-content/40" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onInputKeyDown}
              role="combobox"
              aria-label="Search commands"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                flatCommands[activeIndex]
                  ? `${listId}-${activeIndex}`
                  : undefined
              }
              placeholder="Search sections, projects, settings…"
              className="w-full bg-transparent py-3 text-sm text-base-content placeholder:text-base-content/40 focus:outline-none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Kbd className="shrink-0">{isMac ? "⌘K" : "Ctrl K"}</Kbd>
            <Dialog.Close
              aria-label="Close command menu"
              className="app-touch-target rounded p-1.5 text-base-content/60 hover:bg-base-200"
            >
              <X aria-hidden="true" className="size-4" />
            </Dialog.Close>
          </div>

          <ul
            id={listId}
            role="listbox"
            aria-label="Commands"
            className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto p-2 text-sm"
          >
            {flatCommands.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-base-content/50">
                No results
              </li>
            ) : (
              filteredSections.map((section) => (
                <li key={section.heading} role="presentation">
                  <ul
                    role="group"
                    aria-label={section.heading}
                    className="gap-0.5 px-0"
                  >
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
                        <li key={command.id} role="presentation">
                          <button
                            type="button"
                            id={`${listId}-${index}`}
                            tabIndex={-1}
                            role="option"
                            aria-selected={isActive}
                            ref={isActive ? activeRowRef : undefined}
                            onClick={() => activate(command)}
                            onMouseMove={() => setActiveIndex(index)}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
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

          <CommandPaletteFooter />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
