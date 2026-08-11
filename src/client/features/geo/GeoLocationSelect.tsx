import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, MagnifyingGlass } from "@phosphor-icons/react";
import { searchGeoLocations } from "@/serverFunctions/geo";
import type { TargetArea } from "@/shared/geo/types";
import {
  areaKey,
  describeNoGeoMatches,
  filterCountryAreas,
  filterMetroAreas,
  filterStateAreas,
  flattenGeoGroups,
  groupGeoAreas,
  isSameArea,
  selectCityAreas,
  selectMetroAreasFromSearch,
  type GeoGroup,
} from "./geoLocationOptions";

type Props = {
  value: TargetArea | null;
  onChange: (area: TargetArea) => void;
  /** Width utilities for the wrapper/trigger. Defaults to full width. */
  className?: string;
};

const CITY_SEARCH_DEBOUNCE_MS = 150;
const CITY_SEARCH_LIMIT = 20;

/**
 * Debounces a fast-changing value on a plain `setTimeout` — not worth a
 * dependency for one call site. Kept private to this file rather than its
 * own module: a hook needs a React render to invoke at all, so it isn't
 * unit-testable under this repo's "no React test infra" constraint either
 * way, and there is nothing pure left to extract from it.
 */
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type GeoOptionGroupProps = {
  group: GeoGroup;
  activeIndex: number;
  indexByKey: ReadonlyMap<string, number>;
  selected: TargetArea | null;
  activeRowRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (area: TargetArea) => void;
  onHover: (index: number) => void;
};

/** One group's muted heading plus its rows.
 *
 * Deliberately styled with plain Tailwind rather than DaisyUI's `menu`
 * component classes. Two reasons, both learned the hard way:
 *
 *   1. `menu-none` — what the wrapper `<li>` used to carry — is not a DaisyUI
 *      class at all. It appears nowhere in the package, so it was always a
 *      no-op, and the wrapper silently inherited `.menu`'s own descendant
 *      rules (`flex-flow: column wrap`) instead of the containment it looked
 *      like it was asking for.
 *   2. The app is mid-migration off DaisyUI onto Kumo, and a production build
 *      has already shipped without DaisyUI's component layer at all. Anything
 *      that depends on `.menu` painting its children's padding, radius and
 *      hover state renders as naked list items the moment that happens. The
 *      rows below carry their own layout so they look identical either way.
 *
 * `role="presentation"` on both wrappers is what keeps the ARIA correct: a
 * `listbox` must own its `option`s, and a bare `<li>`/`<ul>` in between
 * breaks that relationship. Presentation removes them from the tree so the
 * options read as direct children of the listbox they actually belong to.
 */
function GeoOptionGroup({
  group,
  activeIndex,
  indexByKey,
  selected,
  activeRowRef,
  onSelect,
  onHover,
}: GeoOptionGroupProps) {
  return (
    <li role="presentation">
      <p
        aria-hidden="true"
        className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-base-content/40"
      >
        {group.heading}
      </p>
      <ul role="presentation" className="flex flex-col gap-0.5 p-0">
        {group.rows.map((area) => {
          const key = areaKey(area);
          const index = indexByKey.get(key) ?? -1;
          const isActive = index === activeIndex;
          const isSelected = isSameArea(selected, area);
          return (
            <li
              key={key}
              id={`geo-option-${key}`}
              role="option"
              aria-selected={isSelected}
            >
              <button
                type="button"
                // Click target only -- the option owns the label. Keeping
                // these focusable made every location its own Tab stop.
                tabIndex={-1}
                aria-hidden="true"
                ref={isActive ? activeRowRef : undefined}
                // The active row needs real contrast, not a tint. Arrow keys
                // leave focus in the search input, so this background is the
                // ONLY thing telling a keyboard user what Enter will select --
                // and `bg-base-200` on `bg-base-100` is about 1.07:1, far
                // under the 3:1 guidance for a state indicator. The primary
                // tint plus a ring is visible in both themes; hover stays a
                // quiet tint because the pointer already says where it is.
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors ${
                  isActive
                    ? "bg-primary/15 ring-1 ring-inset ring-primary/50 font-medium"
                    : "hover:bg-base-200"
                }`}
                onClick={() => onSelect(area)}
                onMouseEnter={() => onHover(index)}
              >
                <span className="min-w-0 flex-1 truncate">{area.label}</span>
                {isSelected ? (
                  <Check className="size-4 shrink-0 text-primary" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

/**
 * Grouped, searchable location picker covering metros, cities, US states and
 * countries. Extends `src/client/components/LocationSelect.tsx`'s open/
 * close/query/`activeIndex` shell (same structure, same trigger/input/list
 * classes) rather than inventing a second interaction model; the one thing
 * that shell never needed — grouping — borrows `CommandPalette.tsx`'s
 * already-established muted-heading section pattern instead of a third one.
 *
 * Metros, states and countries come from bundled tables and filter
 * synchronously on every keystroke (no network, no debounce, no spinner).
 * Cities come from the free, D1-only `searchGeoLocations`, debounced and
 * kept on screen (`placeholderData: keepPreviousData`) while a newer
 * keystroke's request is in flight, so typing never flashes an empty list.
 */
export function GeoLocationSelect({
  value,
  onChange,
  className = "w-full",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);

  const debouncedQuery = useDebouncedValue(
    query,
    CITY_SEARCH_DEBOUNCE_MS,
  ).trim();

  // Named for what it searches, not just cities: the same free D1 lookup
  // returns every seeded geotarget type prefix-matching the query, and both
  // the city group (below) and the metro group's seeded half read from it.
  const geoSearchQuery = useQuery({
    queryKey: ["geo-location-search", debouncedQuery],
    queryFn: () =>
      searchGeoLocations({
        data: { query: debouncedQuery, limit: CITY_SEARCH_LIMIT },
      }),
    // An empty query means "just opened" -- gating on a non-empty debounced
    // query is what makes opening and closing the picker free.
    enabled: debouncedQuery.length > 0,
    placeholderData: keepPreviousData,
  });

  // States/countries key off the LIVE query -- they never touch the network,
  // so there's no reason to make them wait on the same debounce that protects
  // the D1 search from firing on every keystroke. Metros merge two sources:
  // the bundled US_DMAS table (synchronous, LIVE query, empty until an
  // operator has an independent verified source) and seeded "DMA Region"
  // rows from that same D1 search (debounced, since they share its network
  // round trip) -- the bundled table is an accelerator for the un-seeded
  // case, never a whitelist the seeded rows have to clear (see
  // buildMetroAreasFromSearch's own doc comment).
  const groups = useMemo(
    () =>
      groupGeoAreas({
        metros: [
          ...filterMetroAreas(query),
          ...selectMetroAreasFromSearch(
            debouncedQuery,
            geoSearchQuery.data ?? [],
          ),
        ],
        cities: selectCityAreas(debouncedQuery, geoSearchQuery.data ?? []),
        states: filterStateAreas(query),
        countries: filterCountryAreas(query),
      }),
    [query, debouncedQuery, geoSearchQuery.data],
  );
  const flatAreas = useMemo(() => flattenGeoGroups(groups), [groups]);

  const indexByKey = useMemo(() => {
    const map = new Map<string, number>();
    flatAreas.forEach((area, index) => map.set(areaKey(area), index));
    return map;
  }, [flatAreas]);

  // Reset transient state and focus the search input each time the menu
  // opens -- same as LocationSelect.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }, [open]);

  // Close on outside click so it behaves like the surrounding native
  // selects -- same as LocationSelect.
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

  // A keystroke resets activeIndex to 0 synchronously (below), but the list
  // can also change shape asynchronously -- a debounced city search can
  // resolve after the user has already arrowed past where the new, shorter
  // list ends. Clamp rather than let Enter select nothing.
  useEffect(() => {
    setActiveIndex((index) =>
      Math.min(index, Math.max(flatAreas.length - 1, 0)),
    );
  }, [flatAreas.length]);

  // Keep the highlighted option in view as the user arrows through results.
  useEffect(() => {
    if (!open) return;
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const select = (area: TargetArea) => {
    onChange(area);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, flatAreas.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Enter": {
        event.preventDefault();
        const area = flatAreas[activeIndex];
        if (area) select(area);
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
        <span className="truncate">{value?.label ?? "Select location"}</span>
      </button>

      {open ? (
        // `absolute`, not `fixed`. A fixed element's containing block is the
        // viewport, so `w-full` resolved against the VIEWPORT and only landed
        // near the trigger's width because `max-w-56` happened to clamp it to
        // 224px — the alignment was a coincidence, and the panel escaped every
        // ancestor's clipping. Anchoring left/right to the `relative` wrapper
        // below makes it genuinely trigger-width at any size.
        //
        // `rounded-xl` rather than `rounded-box`: the latter reads DaisyUI's
        // `--radius-box`, which is absent from a build without DaisyUI's
        // component layer, and an undefined radius var silently renders square.
        <div className="absolute inset-x-0 z-30 mt-2 rounded-xl border border-base-300 bg-base-100 p-2 shadow-lg">
          <label className="flex items-center gap-2 rounded-lg border border-base-300 px-3 py-2 focus-within:border-primary">
            <MagnifyingGlass className="size-4 shrink-0 text-base-content/45" />
            {/* The input is the real combobox: focus never leaves it and
                arrow keys only move `activeIndex`, so without these a screen
                reader went silent as the user arrowed and never said which
                location Enter would choose. */}
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="geo-location-listbox"
              aria-activedescendant={
                flatAreas[activeIndex]
                  ? `geo-option-${areaKey(flatAreas[activeIndex])}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-label="Search locations"
              className="grow min-w-0 bg-transparent text-sm outline-none placeholder:text-base-content/40"
              placeholder="Search locations"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
            />
          </label>

          {/* `overflow-x-hidden` is not cosmetic. Setting only `overflow-y`
              makes the computed `overflow-x` become `auto` (verified in the
              browser), so this list could scroll sideways — and the
              `scrollIntoView` effect below drives exactly that, slicing
              option labels off at their left edge. Pinning the x axis keeps
              `truncate` on each row the only way a long label is shortened.

              No `menu` class: see GeoOptionGroup's own header. Rows carry
              their own padding and hover state now, so the list renders the
              same with or without DaisyUI's component layer present. */}
          <ul
            role="listbox"
            id="geo-location-listbox"
            aria-label="Locations"
            className="mt-2 flex max-h-64 w-full flex-col overflow-y-auto overflow-x-hidden p-0"
          >
            {flatAreas.length === 0 ? (
              <li className="w-full break-all px-3 py-2 text-sm text-base-content/50">
                {describeNoGeoMatches(query)}
              </li>
            ) : (
              groups.map((group) => (
                <GeoOptionGroup
                  key={group.key}
                  group={group}
                  activeIndex={activeIndex}
                  indexByKey={indexByKey}
                  selected={value}
                  activeRowRef={activeRowRef}
                  onSelect={select}
                  onHover={setActiveIndex}
                />
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
