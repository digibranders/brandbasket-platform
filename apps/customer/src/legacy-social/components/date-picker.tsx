"use client";

import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { useState, type KeyboardEvent, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { dayLabel } from "@/legacy-social/lib/social/auto";
import { monthGrid, monthOf, monthTitle, shiftMonth } from "@/legacy-social/lib/social/month-grid";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const TRIGGER = "inline-flex h-10 items-center justify-between gap-3 rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink transition-colors hover:bg-sunken aria-expanded:border-ok";

interface DatePickerProps {
  readonly id: string;
  /** `YYYY-MM-DD`. */
  readonly value: string;
  /** The first and last day that may be chosen, `YYYY-MM-DD`; days outside them are shown greyed out. */
  readonly min: string;
  readonly max: string;
  /** Today in India, `YYYY-MM-DD`, marked in the grid. */
  readonly today: string;
  readonly onChange: (day: string) => void;
  readonly className?: string;
}

/**
 * A day field with a month calendar that opens under it, in place of the browser's own picker (which looks different in every browser and opens over the
 * page, where a pop-up window can cut it off). Weeks start on Monday. Arrow buttons change the month; Escape closes the calendar and not the window around it.
 */
export function DatePicker({ id, value, min, max, today, onChange, className }: DatePickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthOf(value));
  const grid = monthGrid(month);
  const canGo = (by: number): boolean => {
    const target = shiftMonth(month, by);
    return by < 0 ? `${target}-31` >= min : `${target}-01` <= max;
  };
  const choose = (day: string): void => {
    onChange(day);
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div onKeyDown={onKeyDown} className={cn("grid gap-2", className)}>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setMonth(monthOf(value));
          setOpen(!open);
        }}
        className={TRIGGER}
      >
        {dayLabel(value, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        <CalendarBlank size={16} weight="bold" aria-hidden="true" className="text-ink-2" />
      </button>
      {!open ? null : (
        <div role="group" aria-label="Choose a day" className="w-[17.5rem] rounded-xl border border-line bg-surface p-3 shadow-popover">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous month" disabled={!canGo(-1)} onClick={() => setMonth(shiftMonth(month, -1))} className="grid size-8 place-items-center rounded-lg text-ink hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40">
              <CaretLeft size={14} weight="bold" aria-hidden="true" />
            </button>
            <span aria-live="polite" className="text-[0.875rem] font-semibold text-ink">
              {monthTitle(month)}
            </span>
            <button type="button" aria-label="Next month" disabled={!canGo(1)} onClick={() => setMonth(shiftMonth(month, 1))} className="grid size-8 place-items-center rounded-lg text-ink hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40">
              <CaretRight size={14} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((name) => (
              <span key={name} aria-hidden="true" className="pb-1 text-[0.6875rem] font-semibold text-ink-3">
                {name}
              </span>
            ))}
            {grid.map(({ day, inMonth }) => {
              const allowed = day >= min && day <= max;
              const selected = day === value;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!allowed}
                  aria-pressed={selected}
                  aria-label={dayLabel(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  onClick={() => choose(day)}
                  className={cn(
                    "grid h-8 place-items-center rounded-lg text-[0.8125rem] transition-colors",
                    selected ? "bg-ok font-semibold text-on-primary" : allowed ? "text-ink hover:bg-sunken" : "cursor-not-allowed text-ink-3 opacity-40",
                    !selected && !inMonth && allowed && "text-ink-3",
                    !selected && day === today && "ring-1 ring-inset ring-ok",
                  )}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button type="button" disabled={today < min || today > max} onClick={() => choose(today)} className="rounded-lg px-2 py-1 text-[0.8125rem] font-semibold text-ink-2 hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40">
              Today
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-[0.8125rem] font-semibold text-ink-2 hover:bg-sunken">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
