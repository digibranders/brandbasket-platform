"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";

/**
 * Moving a topic to another day by dragging its card, the way the calendar moves a post: the card is picked up after a few pixels of
 * movement (so a click on an icon still works), a small copy follows the pointer, the day column underneath lights up when the topic may
 * land there, and Escape puts it back. Columns say where a topic can land with `data-drop-day`. A finger scrolls the week sideways, so a
 * touch does not drag: the card has its own day picker for that.
 */

const PICK_UP_DISTANCE = 5;

interface Options {
  /** Whether the topic may land on this day. */
  readonly allowed: (key: string, day: string) => boolean;
  readonly onDrop: (key: string, day: string) => void;
}

export interface TopicDrag {
  /** The key of the card being dragged, or null. */
  readonly dragging: string | null;
  /** The day the card is over and may land on, or null. */
  readonly over: string | null;
  /** Starts a drag on a pointer press; the card is picked up only once the pointer has moved a little. */
  readonly begin: (event: ReactPointerEvent, key: string, headline: string) => void;
  /** The small copy that follows the pointer; draw it once, anywhere on the page. */
  readonly ghost: ReactElement | null;
}

export function useTopicDrag({ allowed, onDrop }: Options): TopicDrag {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [headline, setHeadline] = useState("");
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ allowed, onDrop });
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => {
    latest.current = { allowed, onDrop };
  });
  // A drag still going when the screen goes away must not leave its listeners behind.
  useEffect(() => () => stop.current?.(), []);

  const begin = useCallback((event: ReactPointerEvent, key: string, text: string): void => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    stop.current?.();
    const startX = event.clientX;
    const startY = event.clientY;
    let started = false;
    let overDay: string | null = null;
    const dayAt = (x: number, y: number): string | null => {
      const day = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-day]")?.dataset["dropDay"];
      return day !== undefined && latest.current.allowed(key, day) ? day : null;
    };
    const move = (moved: PointerEvent): void => {
      if (!started) {
        if (Math.hypot(moved.clientX - startX, moved.clientY - startY) < PICK_UP_DISTANCE) return;
        started = true;
        setDragging(key);
        setHeadline(text);
      }
      if (ghostRef.current !== null) ghostRef.current.style.transform = `translate(${moved.clientX + 12}px, ${moved.clientY + 12}px)`;
      const day = dayAt(moved.clientX, moved.clientY);
      if (day !== overDay) {
        overDay = day;
        setOver(day);
      }
    };
    const finish = (drop: boolean): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape);
      stop.current = null;
      if (!started) return;
      setDragging(null);
      setOver(null);
      if (drop && overDay !== null) latest.current.onDrop(key, overDay);
    };
    const up = (): void => finish(true);
    const cancel = (): void => finish(false);
    const escape = (pressed: KeyboardEvent): void => {
      if (pressed.key === "Escape") finish(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape);
    stop.current = cancel;
  }, []);

  const ghost =
    dragging === null ? null : (
      <div ref={ghostRef} aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-50 max-w-52 rounded-xl bg-surface px-3 py-2 text-[0.8125rem] font-semibold leading-snug text-ink shadow-[0_12px_30px_-10px_rgb(21_22_26/0.5)] ring-1 ring-line" style={{ transform: "translate(-9999px, -9999px)" }}>
        {headline}
      </div>
    );
  return { dragging, over, begin, ghost };
}
