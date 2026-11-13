"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { time12, type CalendarPost } from "@/legacy-social/lib/social/auto";

/**
 * Moving a post by dragging it, smoothly: the browser's own drag and drop jerks the page and draws a faded copy, so this follows the
 * mouse itself. The post is picked up after a few pixels of movement (so a click still opens it), a small copy follows the pointer,
 * the cell underneath lights up when the post may land there, and the grid scrolls by itself near its top and bottom edge. Cells say
 * where a post can land with `data-drop-day` (and `data-drop-hour` in the hourly grid). Escape puts the post back.
 */

const PICK_UP_DISTANCE = 5;
const EDGE = 44;
const MAX_SCROLL_PER_FRAME = 16;
const GRID = '[aria-label="Posts by hour"]';

export interface DropSpot {
  readonly day: string;
  readonly time: string;
  /** Identifies the cell, so it can be lit. */
  readonly key: string;
}

/** The key a cell uses to ask whether it is lit. */
export const cellKey = (day: string, hour?: number): string => `${day}|${hour ?? ""}`;

interface Options {
  /** Whether the post may land on this day and time. */
  readonly allowed: (post: CalendarPost, day: string, time: string) => boolean;
  readonly onDrop: (post: CalendarPost, day: string, time: string) => void;
}

export interface PostDrag {
  /** The post being dragged, or null. */
  readonly dragging: CalendarPost | null;
  /** The cell the post is over and may land on, or null. */
  readonly over: string | null;
  /** Starts a drag on a pointer press; the post is picked up only once the pointer has moved a little. */
  readonly begin: (event: ReactPointerEvent, post: CalendarPost) => void;
  /** True once, right after a drag ended, so the click that follows it does not also open the post. */
  readonly takeDragged: () => boolean;
  /** The small copy that follows the pointer; draw it once, anywhere on the page. */
  readonly ghost: ReactElement | null;
}

function spotAt(x: number, y: number, post: CalendarPost, allowed: Options["allowed"]): DropSpot | null {
  const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-day]");
  const day = cell?.dataset["dropDay"];
  if (cell === null || cell === undefined || day === undefined) return null;
  const hour = cell.dataset["dropHour"];
  // In the hourly grid a post takes the hour it is dropped on and keeps its minutes; on a day it keeps its time.
  const time = hour === undefined ? post.time : `${hour.padStart(2, "0")}:${post.time.slice(3)}`;
  return allowed(post, day, time) ? { day, time, key: cellKey(day, hour === undefined ? undefined : Number(hour)) } : null;
}

export function usePostDrag({ allowed, onDrop }: Options): PostDrag {
  const [dragging, setDragging] = useState<CalendarPost | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const justDragged = useRef(false);
  // The latest rules, so a drag that started earlier still uses them.
  const rules = useRef({ allowed, onDrop });
  useEffect(() => {
    rules.current = { allowed, onDrop };
  });

  const place = useCallback((): void => {
    if (ghost.current !== null) ghost.current.style.transform = `translate(${pointer.current.x + 14}px, ${pointer.current.y + 14}px)`;
  }, []);

  const begin = useCallback(
    (event: ReactPointerEvent, post: CalendarPost): void => {
      if (event.button !== 0 || event.pointerType === "touch") return;
      const start = { x: event.clientX, y: event.clientY };
      let picked = false;
      let spot: DropSpot | null = null;
      let frame = 0;

      const refresh = (): void => {
        spot = spotAt(pointer.current.x, pointer.current.y, post, rules.current.allowed);
        setOver(spot?.key ?? null);
      };

      // Near the top or bottom of the hourly grid it scrolls, faster the closer the pointer is to the edge.
      const scroll = (): void => {
        const grid = document.querySelector<HTMLElement>(GRID);
        if (grid !== null) {
          const box = grid.getBoundingClientRect();
          const { y } = pointer.current;
          const push = y < box.top + EDGE ? -(box.top + EDGE - y) : y > box.bottom - EDGE ? y - (box.bottom - EDGE) : 0;
          if (push !== 0) {
            grid.scrollTop += Math.max(-MAX_SCROLL_PER_FRAME, Math.min(MAX_SCROLL_PER_FRAME, push / 3));
            refresh();
          }
        }
        frame = requestAnimationFrame(scroll);
      };

      const finish = (): void => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key);
        cancelAnimationFrame(frame);
        if (picked) {
          justDragged.current = true;
          // The click that follows the release has come and gone by the next turn of the page.
          setTimeout(() => {
            justDragged.current = false;
          }, 0);
        }
        setDragging(null);
        setOver(null);
      };

      function move(moved: PointerEvent): void {
        pointer.current = { x: moved.clientX, y: moved.clientY };
        if (!picked) {
          if (Math.hypot(moved.clientX - start.x, moved.clientY - start.y) < PICK_UP_DISTANCE) return;
          picked = true;
          setDragging(post);
          frame = requestAnimationFrame(scroll);
        }
        place();
        refresh();
      }
      function up(): void {
        const landing = picked ? spot : null;
        finish();
        if (landing !== null) rules.current.onDrop(post, landing.day, landing.time);
      }
      function cancel(): void {
        finish();
      }
      function key(pressed: KeyboardEvent): void {
        if (pressed.key === "Escape") finish();
      }

      pointer.current = start;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key);
    },
    [place],
  );

  const takeDragged = useCallback((): boolean => justDragged.current, []);

  const copy =
    dragging === null ? null : (
      <div
        ref={(node) => {
          ghost.current = node;
          place();
        }}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[100] w-48 rounded-lg border border-ink-3 bg-surface px-2.5 py-2 text-xs shadow-[0_12px_28px_-10px_rgb(21_22_26/0.45)]"
      >
        <span className="block font-bold text-ink">{time12(dragging.time)}</span>
        <span className="line-clamp-2 break-words leading-snug text-ink-2">{dragging.caption}</span>
      </div>
    );

  return { dragging, over, begin, takeDragged, ghost: copy };
}
