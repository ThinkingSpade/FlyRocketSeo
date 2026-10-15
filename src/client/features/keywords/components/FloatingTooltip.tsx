import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { placeTooltip } from "./tooltipPlacement";

type Position = { top: number; left: number; bottom?: number };

export function FloatingTooltip({
  id,
  position,
  children,
}: {
  id: string;
  position: Position;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [placed, setPlaced] = useState({
    left: position.left,
    top: position.top,
  });
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPlaced(
      placeTooltip(
        {
          top: position.top + 8,
          bottom: position.bottom ?? position.top + 8,
          center: position.left,
        },
        box,
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [position, children]);
  return (
    <span
      ref={ref}
      id={id}
      role="tooltip"
      className="pointer-events-none fixed z-[1000] w-max rounded-md border border-base-300 bg-base-100 px-2.5 py-2 text-[11px] font-normal normal-case leading-snug text-base-content shadow-md"
      style={{ ...placed, maxWidth: "min(16rem, calc(100vw - 1rem))" }}
    >
      {children}
    </span>
  );
}

export function useFloatingTooltip<T extends HTMLElement>({
  delayMs = 150,
  enabled = true,
}: {
  delayMs?: number;
  enabled?: boolean;
} = {}) {
  const tooltipId = useId();
  const triggerRef = useRef<T | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect)
      setPosition({
        top: rect.top - 8,
        bottom: rect.bottom,
        left: rect.left + rect.width / 2,
      });
  }, []);
  const clearOpenTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);
  const open = useCallback(() => {
    if (!enabled) return;
    updatePosition();
    setIsOpen(true);
  }, [enabled, updatePosition]);
  const scheduleOpen = useCallback(() => {
    if (!enabled) return;
    clearOpenTimeout();
    timeoutRef.current = setTimeout(() => {
      open();
      timeoutRef.current = null;
    }, delayMs);
  }, [enabled, clearOpenTimeout, open, delayMs]);
  const close = useCallback(() => {
    clearOpenTimeout();
    setIsOpen(false);
  }, [clearOpenTimeout]);

  useEffect(() => clearOpenTimeout, [clearOpenTimeout]);
  // A span inside a sort button does NOT receive focus when its parent does.
  // Listen on that native button, without introducing nested tab stops.
  useEffect(() => {
    const trigger = triggerRef.current;
    const owner = trigger?.closest("button");
    if (!owner || owner.isSameNode(trigger) || !enabled) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    owner.addEventListener("focus", scheduleOpen);
    owner.addEventListener("blur", close);
    owner.addEventListener("keydown", escape);
    return () => {
      owner.removeEventListener("focus", scheduleOpen);
      owner.removeEventListener("blur", close);
      owner.removeEventListener("keydown", escape);
    };
  }, [enabled, scheduleOpen, close]);
  useEffect(() => {
    const trigger = triggerRef.current;
    const owner = trigger?.closest("button");
    if (!isOpen || !owner || owner.isSameNode(trigger)) return;
    const descriptions = new Set(
      (owner.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter(Boolean),
    );
    descriptions.add(tooltipId);
    owner.setAttribute("aria-describedby", [...descriptions].join(" "));
    return () => {
      const remaining = (owner.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter((id) => id && id !== tooltipId);
      if (remaining.length)
        owner.setAttribute("aria-describedby", remaining.join(" "));
      else owner.removeAttribute("aria-describedby");
    };
  }, [isOpen, tooltipId]);
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);
  return { close, isOpen, open, position, scheduleOpen, tooltipId, triggerRef };
}
