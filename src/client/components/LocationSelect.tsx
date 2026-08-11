import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";

type LocationOption = (typeof LOCATION_OPTIONS)[number];

type Props = {
  value: number;
  onChange: (locationCode: number) => void;
  /** Defaults to the full country list. Pass a subset (e.g. Labs-only). */
  options?: readonly LocationOption[];
  /** Width utilities for the wrapper/trigger. Defaults to full width. */
  className?: string;
};

function matches(option: LocationOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    option.label.toLowerCase().includes(needle) ||
    option.shortLabel.toLowerCase().includes(needle)
  );
}

/**
 * Searchable country picker. Allows users to filter the country list instead of
 * scrolling it. The scrollable list is preserved below the search input.
 */
export function LocationSelect({
  value,
  onChange,
  options = LOCATION_OPTIONS,
  className = "w-full",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.code === value) ?? null;

  const filtered = useMemo(
    () => options.filter((option) => matches(option, query)),
    [options, query],
  );

  // Reset transient state and focus the search input each time the menu opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }, [open]);

  // Close on outside click so it behaves like the surrounding native selects.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // Keep the highlighted option in view as the user arrows through results.
  useEffect(() => {
    if (!open) return;
    const activeItem = listRef.current?.children[activeIndex];
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const select = (option: LocationOption) => {
    onChange(option.code);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Enter": {
        event.preventDefault();
        const option = filtered[activeIndex];
        if (option) select(option);
        break;
      }
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        className="app-select flex w-full items-center justify-between gap-2 text-left font-normal"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate">{selected?.label ?? "Select country"}</span>
      </button>

      {open ? (
        // `absolute`, not `fixed` — a fixed element's containing block is the
        // viewport, so `w-full` resolved against the VIEWPORT and only looked
        // trigger-width because `max-w-56` clamped it to 224px. `rounded-xl`
        // rather than `rounded-box` so the radius survives a build without
        // DaisyUI's component layer. Kept in step with GeoLocationSelect.tsx,
        // which extends this component's shell and had both bugs copied in.
        <div className="absolute inset-x-0 z-30 mt-2 rounded-xl border border-base-300 bg-base-100 p-2 shadow-lg">
          <label className="flex items-center gap-2 rounded-lg border border-base-300 px-3 py-2 focus-within:border-primary">
            <Search className="size-4 shrink-0 text-base-content/50" />
            {/* The input is the real combobox: focus never leaves it, arrow
                keys only move `activeIndex`. Without these, a screen reader
                announced "edit" and then said nothing as the user arrowed,
                so there was no way to know what Enter would pick. */}
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="location-select-listbox"
              aria-activedescendant={
                filtered[activeIndex]
                  ? `location-option-${filtered[activeIndex].code}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-label="Search countries"
              className="grow min-w-0 bg-transparent text-sm outline-none placeholder:text-base-content/40"
              placeholder="Search countries"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
            />
          </label>

          {/* `overflow-x-hidden`: setting only `overflow-y` makes the computed
              `overflow-x` become `auto`, letting the active-row scroll slice
              labels off at their left edge. No `menu` class — rows below carry
              their own padding and hover state, so this renders the same with
              or without DaisyUI's component layer. */}
          <ul
            ref={listRef}
            role="listbox"
            id="location-select-listbox"
            aria-label="Countries"
            className="mt-2 flex max-h-64 w-full flex-col overflow-y-auto overflow-x-hidden p-0"
          >
            {filtered.length === 0 ? (
              <li className="w-full break-all px-3 py-2 text-sm text-base-content/50">
                No countries match “{query.trim()}”
              </li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.code === value;
                return (
                  <li
                    key={option.code}
                    id={`location-option-${option.code}`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <button
                      type="button"
                      // Options own their label; the inner button is a click
                      // target only. Leaving it in the tab order made every
                      // country a separate Tab stop, and left the accessible
                      // name coming from a control that is not the option.
                      tabIndex={-1}
                      aria-hidden="true"
                      // Real contrast, not a tint: arrow keys leave focus in
                      // the search input, so this is the only cue for what
                      // Enter selects, and `bg-base-200` on `bg-base-100` is
                      // ~1.07:1. Kept in step with GeoLocationSelect.tsx.
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors ${
                        index === activeIndex
                          ? "bg-primary/15 ring-1 ring-inset ring-primary/50 font-medium"
                          : "hover:bg-base-200"
                      }`}
                      onClick={() => select(option)}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                      {isSelected ? (
                        <Check className="size-4 shrink-0 text-primary" />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
