"use client";

import { Clock } from "@phosphor-icons/react/dist/ssr";
import { useState, type KeyboardEvent, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { time12 } from "@/legacy-social/lib/social/auto";
import { joinTime, splitTime } from "@/legacy-social/lib/social/month-grid";

const TRIGGER = "inline-flex h-10 items-center justify-between gap-3 rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink transition-colors hover:bg-sunken aria-expanded:border-ok";
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;

interface TimePickerProps {
  readonly id: string;
  /** `HH:MM`, 24-hour, India time. */
  readonly value: string;
  readonly onChange: (time: string) => void;
  readonly className?: string;
}

const CELL = "grid h-8 place-items-center rounded-lg text-[0.8125rem] transition-colors";
const cell = (on: boolean): string => cn(CELL, on ? "bg-ok font-semibold text-on-primary" : "text-ink hover:bg-sunken");

/**
 * A time field with a small panel under it (hour, minute in steps of five, AM or PM) in place of the browser's own picker. Each choice is saved at once;
 * a minute that is not a multiple of five (a time set another way) is kept and shown as its own button. Escape closes the panel and not the window around it.
 */
export function TimePicker({ id, value, onChange, className }: TimePickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  const parts = splitTime(value);
  const minutes: readonly number[] = (MINUTES as readonly number[]).includes(parts.minute) ? MINUTES : [...MINUTES, parts.minute].sort((a, b) => a - b);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div onKeyDown={onKeyDown} className={cn("grid gap-2", className)}>
      <button id={id} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} className={TRIGGER}>
        {time12(value)}
        <Clock size={16} weight="bold" aria-hidden="true" className="text-ink-2" />
      </button>
      {!open ? null : (
        <div role="group" aria-label="Choose a time" className="w-[17.5rem] rounded-xl border border-line bg-surface p-3 shadow-popover">
          <p className="mb-1.5 text-[0.6875rem] font-semibold text-ink-3">Hour</p>
          <div className="grid grid-cols-6 gap-1">
            {HOURS.map((hour) => (
              <button key={hour} type="button" aria-pressed={parts.hour === hour} onClick={() => onChange(joinTime({ ...parts, hour }))} className={cell(parts.hour === hour)}>
                {hour}
              </button>
            ))}
          </div>
          <p className="mb-1.5 mt-3 text-[0.6875rem] font-semibold text-ink-3">Minute</p>
          <div className="grid grid-cols-6 gap-1">
            {minutes.map((minute) => (
              <button key={minute} type="button" aria-pressed={parts.minute === minute} onClick={() => onChange(joinTime({ ...parts, minute }))} className={cell(parts.minute === minute)}>
                {String(minute).padStart(2, "0")}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
            <div role="group" aria-label="AM or PM" className="inline-flex rounded-lg bg-sunken p-0.5">
              {([false, true] as const).map((pm) => (
                <button key={String(pm)} type="button" aria-pressed={parts.pm === pm} onClick={() => onChange(joinTime({ ...parts, pm }))} className={cn("rounded-md px-3 py-1 text-[0.8125rem] font-semibold transition-colors", parts.pm === pm ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>
                  {pm ? "PM" : "AM"}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-[0.8125rem] font-semibold text-ink-2 hover:bg-sunken">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
