"use client";

import { Check } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { loadCallSlots } from "@/app/app-host/(protected)/setup-call-actions";
import { groupSlotsByDay } from "@brandbasket/shared/lib/call-slots";
import { cn } from "@brandbasket/shared/lib/cn";
import { BRAND_TIME_ZONE, slotDay, slotTime } from "@/lib/call-dates";
import { MAX_UPCOMING_CALLS } from "@/lib/calls/rows";
import { bookButtonLabel, splitDayTimes } from "@/lib/calls/slot-view";
import { DARK_BUTTON } from "@/components/v2/classes";

/** Days shown before More days. */
const DAYS_SHOWN = 3;

const CHIP = "inline-flex min-w-0 flex-col items-center justify-center rounded-lg motion-safe:transition-colors motion-safe:duration-200 active:translate-y-px";
const DAY_CHIP = cn(CHIP, "h-14 w-[4.25rem] shrink-0 snap-start");

type Slots = { readonly kind: "loading" } | { readonly kind: "ready"; readonly slots: readonly string[] } | { readonly kind: "unavailable" };

/** Why a booking did not happen. */
export type PickerProblem = "taken" | "failed" | "limit";

export type PickerOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: PickerProblem; readonly message?: string };

const PROBLEM_TEXT: Readonly<Record<PickerProblem, string>> = {
  taken: "That time was just taken. Please pick another.",
  failed: "We could not book that time. Please try again.",
  limit: `You already have ${String(MAX_UPCOMING_CALLS)} calls booked. Change or cancel one first.`,
};

interface SlotPickerProps {
  /** The booking page staff set in the console, offered when the times cannot be listed here. */
  readonly bookingUrl: string | null;
  /** Books the picked time. A thrown error is treated as a failure. */
  readonly book: (slotIso: string) => Promise<PickerOutcome>;
  /** Called after a booking worked. */
  readonly onBooked: () => void;
  /** Drawn between the times and the button (the Book a call sheet puts the reason and the note here). */
  readonly details?: ReactNode;
  /** A line under the button once a time is picked or not (the kickoff says when the website can be live). */
  readonly note?: (slotIso: string | null) => ReactNode;
}

/** The next open days and their times, in India, and one button that books the picked time. Shared by the kickoff call and later calls. */
export function SlotPicker({ bookingUrl, book, onBooked, details, note }: SlotPickerProps): ReactElement {
  const [slots, setSlots] = useState<Slots>({ kind: "loading" });
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [allDays, setAllDays] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [booking, startBooking] = useTransition();

  useEffect(() => {
    let live = true;
    loadCallSlots()
      .then((result) => (result.status === "ok" && result.slots.length > 0 ? ({ kind: "ready", slots: result.slots } as const) : ({ kind: "unavailable" } as const)))
      .catch(() => ({ kind: "unavailable" }) as const)
      .then((next) => {
        if (live) setSlots(next);
      });
    return () => {
      live = false;
    };
  }, []);

  const days = useMemo(() => (slots.kind === "ready" ? groupSlotsByDay(slots.slots, BRAND_TIME_ZONE) : new Map<string, readonly string[]>()), [slots]);

  if (slots.kind === "loading") {
    return (
      <div role="status" aria-label="Loading times" className="grid gap-2">
        <div className="h-12 motion-safe:animate-pulse rounded-lg bg-sunken" />
        <div className="h-9 motion-safe:animate-pulse rounded-lg bg-sunken" />
      </div>
    );
  }
  if (slots.kind === "unavailable") {
    return bookingUrl === null ? (
      <p className="text-sm text-ink-2">
        We could not load the times. Please try again in a few minutes, or write to us in{" "}
        <Link href="/requests" className="font-semibold text-ink underline underline-offset-4">
          Requests
        </Link>
        .
      </p>
    ) : (
      <p className="text-sm text-ink-2">
        We could not load the times here.{" "}
        <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">
          Pick a time on our booking page
        </a>
        .
      </p>
    );
  }

  const dayKeys = [...days.keys()];
  const shownDays = allDays ? dayKeys : dayKeys.slice(0, DAYS_SHOWN);
  const activeDay = day !== null && days.has(day) ? day : (dayKeys[0] ?? null);
  const times = activeDay === null ? [] : (days.get(activeDay) ?? []);

  const submit = (): void => {
    if (slot === null) return;
    setProblem(null);
    startBooking(async () => {
      const result = await book(slot).catch((): PickerOutcome => ({ ok: false, reason: "failed" }));
      // Updates after an await are no longer inside the transition, so wrap them to keep `booking` true until they land.
      startBooking(() => {
        if (result.ok) {
          onBooked();
          return;
        }
        setProblem(result.message ?? PROBLEM_TEXT[result.reason]);
        if (result.reason !== "taken") return;
        // The time is gone: drop it so it cannot be picked again.
        setSlot(null);
        setSlots((current) => {
          if (current.kind !== "ready") return current;
          const left = current.slots.filter((iso) => iso !== slot);
          return left.length > 0 ? { kind: "ready", slots: left } : { kind: "unavailable" };
        });
      });
    });
  };

  const { morning, afternoon } = splitDayTimes(times);
  const timeGroups = [
    { id: "morning", title: "Morning", times: morning },
    { id: "afternoon", title: "Afternoon", times: afternoon },
  ].filter((group) => group.times.length > 0);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <p className="text-[0.8125rem] font-semibold text-ink-2">Pick a day, times in India</p>
      <div role="group" aria-label="Day" className="flex snap-x gap-1.5 overflow-x-auto overscroll-x-contain pb-1">
        {shownDays.map((key) => {
          const first = days.get(key)?.[0] ?? `${key}T06:30:00.000Z`;
          const picked = key === activeDay;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={picked}
              onClick={() => {
                setDay(key);
                setSlot(null);
              }}
              className={cn(DAY_CHIP, picked ? "bg-ink text-white" : "bg-sunken text-ink hover:bg-line")}
            >
              <span className="text-xs">{slotDay(first)}</span>
              <span className="font-figure text-base font-semibold tabular-nums">{Number(key.slice(8))}</span>
            </button>
          );
        })}
        {allDays || dayKeys.length <= DAYS_SHOWN ? null : (
          <button type="button" onClick={() => setAllDays(true)} className={cn(DAY_CHIP, "bg-sunken px-1 text-center text-[0.8125rem] font-semibold leading-tight text-ink-2 hover:bg-line")}>
            More days
          </button>
        )}
      </div>
      <div role="group" aria-label="Time" className="grid min-w-0 gap-3">
        {timeGroups.map((group) => (
          <div key={group.id} role="group" aria-labelledby={`slot-${group.id}`} className="grid min-w-0 gap-1.5">
            <p id={`slot-${group.id}`} className="text-xs font-semibold text-ink-2">
              {group.title}
            </p>
            <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5">
              {group.times.map((iso) => (
                <button
                  key={iso}
                  type="button"
                  aria-pressed={iso === slot}
                  onClick={() => setSlot(iso)}
                  className={cn(CHIP, "h-10 flex-row gap-1.5 font-figure text-[0.8125rem]", iso === slot ? "bg-rattan font-semibold text-ink" : "bg-sunken text-ink hover:bg-line")}
                >
                  {iso === slot ? <Check size={14} aria-hidden="true" /> : null}
                  {slotTime(iso)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {details}
      <button type="button" disabled={slot === null || booking} onClick={submit} className={cn(DARK_BUTTON, "w-full")}>
        {bookButtonLabel(slot, booking)}
      </button>
      {problem === null ? null : (
        <p role="alert" className="text-sm text-error">
          {problem}
        </p>
      )}
      {note?.(slot)}
    </div>
  );
}
