"use client";

import { useEffect, useMemo, useState, useTransition, type ReactElement } from "react";
import { bookCallSlot, loadCallSlots } from "@/app/app-host/(protected)/setup-call-actions";
import { groupSlotsByDay, keyOf, monthWeeks } from "@brandbasket/shared/lib/call-slots";
import { ChevronRightIcon } from "@brandbasket/shared/ui/icons";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { cn } from "@brandbasket/shared/lib/cn";

/** A pulsing bar the shape of what will load; the shared one is always a pill, which would draw the calendar as an oval. */
function Bar({ className }: { readonly className: string }): ReactElement {
  return <span className={cn("block bg-ink/[0.07] motion-safe:animate-pulse", className)} />;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface CallSlotPickerProps {
  /** Called with the meeting's time once it is booked. */
  readonly onBooked: (call: { readonly startsAtIso: string; readonly endsAtIso: string }) => void;
  /** Called when times cannot be offered here, so the card can show the booking page instead. */
  readonly onUnavailable: () => void;
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** A day key (`YYYY-MM-DD`) as a date at midday, which no zone moves to another day. */
function dayDate(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

const dayLong = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The kickoff call's own calendar: a month of days with free times marked, and the times of the chosen day beside it. The
 * times come from the booking service (loadCallSlots) and a pick is only a booking once it is confirmed, so the customer
 * sees the day and the time they are about to book. Times are shown in the customer's own time zone.
 */
export function CallSlotPicker({ onBooked, onUnavailable }: CallSlotPickerProps): ReactElement {
  const [slots, setSlots] = useState<readonly string[] | null>(null);
  const [month, setMonth] = useState<{ readonly year: number; readonly month: number } | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [pickedSlot, setPickedSlot] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [booking, startBooking] = useTransition();
  const timeZone = useMemo(() => browserTimeZone(), []);

  useEffect(() => {
    let current = true;
    void loadCallSlots().then((result) => {
      if (!current) return;
      if (result.status === "ok") setSlots(result.slots);
      else onUnavailable();
    });
    return () => {
      current = false;
    };
  }, [onUnavailable]);

  const days = useMemo(() => groupSlotsByDay(slots ?? [], timeZone), [slots, timeZone]);
  const timeFormat = useMemo(() => new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }), [timeZone]);
  const zoneName = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { timeZoneName: "long", timeZone }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value ?? timeZone,
    [timeZone],
  );

  if (slots === null) {
    return (
      <div aria-busy="true" aria-label="Loading times" className="grid gap-8 rounded-card bg-card p-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:p-6">
        <div className="space-y-4">
          <Bar className="h-5 w-36 rounded-full" />
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }, (_, index) => (
              <Bar key={index} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>
        <div className="space-y-2.5">
          <Bar className="h-4 w-28 rounded-full" />
          <Bar className="h-11 w-full rounded-control" />
          <Bar className="h-11 w-full rounded-control" />
          <Bar className="h-11 w-full rounded-control" />
        </div>
      </div>
    );
  }

  const dayKeys = [...days.keys()];
  const firstDay = dayKeys[0];
  if (firstDay === undefined) {
    return <p className="rounded-card bg-card p-6 text-sm leading-relaxed text-ink-soft">There are no free times in the next few weeks. Email us and we will arrange a time with you.</p>;
  }

  const first = dayDate(firstDay);
  const view = month ?? { year: first.getUTCFullYear(), month: first.getUTCMonth() };
  const activeDay = pickedDay ?? firstDay;
  const times = days.get(activeDay) ?? [];
  const lastDay = dayKeys[dayKeys.length - 1] ?? firstDay;
  const monthIndex = (year: number, month: number): number => year * 12 + month;
  const canGoBack = monthIndex(view.year, view.month) > monthIndex(first.getUTCFullYear(), first.getUTCMonth());
  const last = dayDate(lastDay);
  const canGoForward = monthIndex(view.year, view.month) < monthIndex(last.getUTCFullYear(), last.getUTCMonth());

  const shiftMonth = (by: -1 | 1): void => {
    const next = new Date(Date.UTC(view.year, view.month + by, 1));
    setMonth({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  };

  const confirm = (): void => {
    if (pickedSlot === null) return;
    const chosen = pickedSlot;
    setProblem(null);
    startBooking(async () => {
      const result = await bookCallSlot(chosen, timeZone);
      if (result.ok) {
        onBooked({ startsAtIso: result.startsAtIso, endsAtIso: result.endsAtIso });
        return;
      }
      if (result.reason === "taken") {
        setSlots((current) => (current ?? []).filter((slot) => slot !== chosen));
        setPickedSlot(null);
        setProblem("Someone has just taken that time. Please pick another.");
      } else {
        setProblem("We could not book that time. Please try again, or email us and we will book it for you.");
      }
    });
  };

  return (
    <div className="rounded-card bg-card p-4 sm:p-6">
      <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">{monthLong.format(new Date(Date.UTC(view.year, view.month, 1)))}</h3>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                disabled={!canGoBack}
                aria-label="Previous month"
                className="grid size-9 place-items-center rounded-full text-ink transition-colors hover:bg-paper-deep disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRightIcon className="size-4 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={!canGoForward}
                aria-label="Next month"
                className="grid size-9 place-items-center rounded-full text-ink transition-colors hover:bg-paper-deep disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          </div>
          <div role="grid" aria-label="Choose a day" className="mt-3 grid grid-cols-7 gap-1.5 text-center text-sm">
            {WEEKDAYS.map((name) => (
              <span key={name} className="pb-1 text-[0.8125rem] text-ink-soft">
                {name}
              </span>
            ))}
            {monthWeeks(view.year, view.month)
              .flat()
              .map((day, index) => {
                if (day === null) return <span key={`blank-${String(index)}`} />;
                const key = keyOf(view.year, view.month, day);
                const free = days.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!free}
                    aria-pressed={free ? key === activeDay : undefined}
                    aria-label={free ? `${dayLong.format(dayDate(key))}, times free` : `${dayLong.format(dayDate(key))}, no times`}
                    onClick={() => {
                      setPickedDay(key);
                      setPickedSlot(null);
                      setProblem(null);
                    }}
                    className={cn(
                      "aspect-square rounded-xl text-sm tabular-nums transition-colors duration-200 ease-calm",
                      key === activeDay && free
                        ? "bg-accent font-semibold text-accent-light"
                        : free
                          ? "bg-accent-pale font-semibold text-ink hover:bg-highlight/40"
                          : "text-ink-soft/80",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
          </div>
          <p className="mt-4 text-[0.8125rem] text-ink-soft">Times are in {zoneName}.</p>
        </div>

        <div className="sm:relative">
          <p className="text-sm text-ink-soft">{dayLong.format(dayDate(activeDay))}</p>
          {/* On a wide screen the list is as tall as the calendar beside it, however many times there are, and scrolls inside that. */}
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:absolute sm:inset-x-0 sm:bottom-0 sm:top-7 sm:flex sm:flex-col sm:overflow-y-auto sm:pr-1">
            {times.map((iso) => (
              <li key={iso}>
                <button
                  type="button"
                  aria-pressed={iso === pickedSlot}
                  onClick={() => {
                    setPickedSlot(iso);
                    setProblem(null);
                  }}
                  className={cn(
                    "w-full rounded-full border px-3 py-2.5 text-[0.9375rem] font-semibold tabular-nums transition-colors duration-200 ease-calm",
                    iso === pickedSlot ? "border-accent bg-accent text-accent-light" : "border-ink-soft/65 bg-card text-ink hover:bg-accent-pale",
                  )}
                >
                  {timeFormat.format(new Date(iso))}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3" aria-live="polite">
        <Button type="button" onClick={confirm} disabled={pickedSlot === null || booking}>
          {booking ? "Booking…" : pickedSlot === null ? "Pick a time" : `Book ${timeFormat.format(new Date(pickedSlot))}`}
        </Button>
        {problem === null ? null : (
          <p role="alert" className="text-sm text-ink">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
