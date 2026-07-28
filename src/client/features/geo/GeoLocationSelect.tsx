import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
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

/** One group's muted heading plus its rows. Split out of GeoLocationSelect
 * purely to keep that function short — same markup CommandPalette.tsx
 * already uses for its own grouped, muted-heading listbox sections, since
 * LocationSelect (the component this one extends) has no grouping of its
 * own to borrow from. */
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
    <li className="menu-none">
      <ul className="gap-0.5 px-0">
        <li
          role="presentation"
          className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-base-content/40"
        >
          {group.heading}
        </li>
        {group.rows.map((area) => {
          const key = areaKey(area);
          const index = indexByKey.get(key) ?? -1;
          const isActive = index === activeIndex;
          const isSelected = isSameArea(selected, area);
          return (
            <li key={key} role="option" aria-selected={isSelected}>
              <button
                type="button"
                ref={isActive ? activeRowRef : undefined}
                className={`w-full ${isActive ? "menu-focus" : ""}`}
                onClick={() => onSelect(area)}
                onMouseEnter={() => onHover(index)}
              >
                <span className="flex-1 truncate">{area.label}</span>
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
        className="select select-bordered flex w-full items-center justify-between gap-2 text-left font-normal"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate">{value?.label ?? "Select location"}</span>
      </button>

      {open ? (
        <div className="fixed z-30 mt-2 w-full max-w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
          <label className="flex items-center gap-2 rounded-lg border border-base-300 px-3 py-2 focus-within:border-primary">
            <Search className="size-4 shrink-0 text-base-content/45" />
            <input
              ref={inputRef}
              type="text"
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

          <ul
            role="listbox"
            className="menu mt-2 max-h-64 w-full flex-nowrap gap-0 overflow-y-auto p-0"
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
