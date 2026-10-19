"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { CalendarIcon } from "@brandbasket/shared/ui/icons";
import { cn } from "@brandbasket/shared/lib/cn";
import { placeDropdown, type DropdownPlacement } from "@brandbasket/shared/lib/dropdown-placement";
import { CaretGlyph } from "./icons";

interface DateTimePickerProps {
  readonly id?: string;
  /** "2026-09-30T14:05" in the reader's own time zone, or "" for none: the same value a datetime-local input holds. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Shown on the trigger while no date is set. */
  readonly placeholder: string;
}

interface Parts {
  readonly year: number;
  /** 0–11. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
/** The panel's natural size; placeDropdown flips it above and caps it so it always fits the window. */
const PANEL_WIDTH = 296;
const PANEL_HEIGHT = 388;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parse(value: string): Parts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (match === null) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  return { year, month: month - 1, day, hour, minute };
}

function format(parts: Parts): string {
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function partsOf(date: Date): Parts {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

function label(parts: Parts): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(parts.year, parts.month, parts.day, parts.hour, parts.minute));
}

/** The days shown for a month: leading blanks so the 1st falls under its weekday (weeks start on Monday). */
function monthCells(year: number, month: number): readonly (number | null)[] {
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [...Array.from({ length: leading }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)];
}

/**
 * A date and time field in the dashboard's own look. The browser's datetime-local input opens a calendar drawn by
 * the operating system; this one opens a cream calendar that belongs to the panel. It holds the same value a
 * datetime-local input would, so everything around it is unchanged.
 *
 * Picking a day keeps the time already set (or the current time, the first time); the time is typed in the two
 * small boxes under the calendar. The panel is rendered at the end of `<body>` so the scrolling sidebar cannot clip it,
 * and is placed by `placeDropdown`: below the field, or above (anchored by its bottom edge) when there is more room
 * there, never taller than the window allows (it scrolls) or past the window's edges.
 */
export function DateTimePicker({ id, value, onChange, placeholder }: DateTimePickerProps): ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const current = parse(value);
  // Where the panel sits and what "today" is, both read once, when it opens.
  const [position, setPosition] = useState<{
    readonly placement: DropdownPlacement;
    readonly today: Parts;
  } | null>(null);
  // The month on show; follows the chosen date each time the calendar opens.
  const [view, setView] = useState<{ readonly year: number; readonly month: number }>(() => {
    const start = current ?? partsOf(new Date());
    return { year: start.year, month: start.month };
  });
  const open = position !== null;

  const close = useCallback(() => setPosition(null), []);

  function openPanel(): void {
    const trigger = triggerRef.current;
    if (trigger === null) return;
    const rect = trigger.getBoundingClientRect();
    const placement = placeDropdown({
      trigger: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
      list: { width: PANEL_WIDTH, height: PANEL_HEIGHT },
    });
    const today = partsOf(new Date());
    const start = current ?? today;
    setView({ year: start.year, month: start.month });
    setPosition({ placement, today });
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) === true || panelRef.current?.contains(target) === true) return;
      close();
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    }
    function onScroll(event: Event): void {
      if (panelRef.current?.contains(event.target as Node) === true) return;
      close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  /** The value to build on: what is set, or right now the first time something is picked. */
  function base(): Parts {
    return current ?? partsOf(new Date());
  }

  function pickDay(day: number): void {
    onChange(format({ ...base(), year: view.year, month: view.month, day }));
  }

  function setTime(patch: Partial<Pick<Parts, "hour" | "minute">>): void {
    onChange(format({ ...base(), ...patch }));
  }

  function shiftMonth(by: number): void {
    setView((shown) => {
      const moved = new Date(shown.year, shown.month + by, 1);
      return { year: moved.getFullYear(), month: moved.getMonth() };
    });
  }

  const hour12 = current === null ? "" : String(current.hour % 12 === 0 ? 12 : current.hour % 12);
  const isPm = current !== null && current.hour >= 12;
  const stepClass =
    "grid size-8 place-items-center rounded-full text-ink-soft transition-colors duration-200 ease-calm hover:bg-paper-deep hover:text-ink";
  const timeBoxClass =
    "w-12 rounded-lg border border-line bg-paper px-2 py-1.5 text-center text-sm tabular-nums text-ink focus:border-accent focus:outline-none";

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : openPanel())}
        className="flex w-full items-center justify-between gap-2 rounded-control border border-line bg-card px-3.5 py-2 text-left text-sm transition-colors duration-200 ease-calm hover:border-ink-soft/40 focus:outline-none focus-visible:border-accent"
      >
        <span className={cn("truncate tabular-nums", current === null ? "text-ink-soft/70" : "text-ink")}>
          {current === null ? placeholder : label(current)}
        </span>
        <CalendarIcon className="size-4 shrink-0 text-ink-soft" />
      </button>

      {position === null
        ? null
        : createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label="Choose a date and time"
              style={{
                top: position.placement.side === "below" ? position.placement.offset : "auto",
                bottom: position.placement.side === "above" ? position.placement.offset : "auto",
                left: position.placement.left,
                width: position.placement.width,
                maxWidth: position.placement.width,
                maxHeight: position.placement.maxHeight,
              }}
              className="fixed z-[70] overflow-y-auto rounded-card border border-line bg-card p-4 text-ink shadow-[0_22px_48px_-20px_rgba(42,13,16,0.4)]"
            >
              <div className="flex items-center justify-between">
                <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className={stepClass}>
                  <CaretGlyph className="size-4 rotate-90" />
                </button>
                <p className="font-serif text-base" aria-live="polite">
                  {new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
                    new Date(view.year, view.month, 1),
                  )}
                </p>
                <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} className={stepClass}>
                  <CaretGlyph className="size-4 -rotate-90" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
                {WEEKDAYS.map((weekday) => (
                  <span key={weekday} className="pb-1 text-[0.6875rem] text-ink-soft">
                    {weekday}
                  </span>
                ))}
                {monthCells(view.year, view.month).map((day, index) => {
                  if (day === null) return <span key={`blank-${index}`} />;
                  const isChosen =
                    current !== null && current.year === view.year && current.month === view.month && current.day === day;
                  const { today } = position;
                  const isToday = today.year === view.year && today.month === view.month && today.day === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={isChosen}
                      onClick={() => pickDay(day)}
                      className={cn(
                        "mx-auto grid size-9 place-items-center rounded-full text-sm tabular-nums transition-colors duration-200 ease-calm",
                        isChosen
                          ? "bg-ink font-medium text-paper"
                          : isToday
                            ? "text-accent-deep ring-1 ring-inset ring-accent/40 hover:bg-accent-pale"
                            : "text-ink hover:bg-paper-deep",
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-line/70 pt-4">
                <span className="mr-auto text-xs text-ink-soft">Time</span>
                <input
                  aria-label="Hour"
                  inputMode="numeric"
                  maxLength={2}
                  onFocus={(event) => event.target.select()}
                  value={hour12}
                  placeholder="–"
                  onChange={(event) => {
                    const typed = Number(event.target.value.replace(/\D/g, ""));
                    if (!Number.isInteger(typed) || typed < 1 || typed > 12) return;
                    setTime({ hour: (typed % 12) + (isPm ? 12 : 0) });
                  }}
                  className={timeBoxClass}
                />
                <span aria-hidden="true" className="text-ink-soft">
                  :
                </span>
                <input
                  aria-label="Minute"
                  inputMode="numeric"
                  maxLength={3}
                  onFocus={(event) => event.target.select()}
                  value={current === null ? "" : pad(current.minute)}
                  placeholder="–"
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "").slice(-2);
                    const typed = Number(digits);
                    if (digits === "" || typed > 59) return;
                    setTime({ minute: typed });
                  }}
                  className={timeBoxClass}
                />
                <div className="flex rounded-lg bg-paper-deep p-0.5 text-xs font-medium">
                  {(["am", "pm"] as const).map((half) => {
                    const chosen = current !== null && (half === "pm") === isPm;
                    return (
                      <button
                        key={half}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => setTime({ hour: (base().hour % 12) + (half === "pm" ? 12 : 0) })}
                        className={cn(
                          "rounded-md px-2 py-1 transition-colors duration-200 ease-calm",
                          chosen ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink",
                        )}
                      >
                        {half}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    close();
                  }}
                  className="text-ink-soft transition-colors duration-200 ease-calm hover:text-ink"
                >
                  Clear
                </button>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      const now = partsOf(new Date());
                      setView({ year: now.year, month: now.month });
                      onChange(format(now));
                    }}
                    className="text-accent-deep transition-colors duration-200 ease-calm hover:text-ink"
                  >
                    Now
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full bg-ink px-3.5 py-1.5 text-paper transition-colors duration-200 ease-calm hover:bg-accent-deep"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
    </>
  );
}
