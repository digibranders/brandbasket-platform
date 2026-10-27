"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { loadCallSlots } from "@/app/app-host/(protected)/setup-call-actions";
import { groupSlotsByDay } from "@brandbasket/shared/lib/call-slots";
import { cn } from "@brandbasket/shared/lib/cn";
import { BRAND_TIME_ZONE, slotDay, slotLabel, slotTime } from "@/lib/call-dates";
import { MAX_UPCOMING_CALLS } from "@/lib/calls/rows";
import { DARK_BUTTON } from "@/components/v2/classes";

/** Days shown before More days. */
const DAYS_SHOWN = 3;

const CHIP = "inline-flex flex-col items-center justify-center rounded-lg transition-colors duration-200 active:translate-y-px";

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
  /** A line under the button once a time is picked or not (the kickoff says when the website can be live). */
  readonly note?: (slotIso: string | null) => ReactNode;
}

/** The next open days and their times, in India, and one button that books the picked time. Shared by the kickoff call and later calls. */
export function SlotPicker({ bookingUrl, book, onBooked, note }: SlotPickerProps): ReactElement {
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
        <div className="h-12 animate-pulse rounded-lg bg-sunken" />
        <div className="h-9 animate-pulse rounded-lg bg-sunken" />
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

  return (
    <div className="grid gap-3">
      <p className="text-[0.8125rem] font-semibold text-ink-2">Pick a day, times in India</p>
      <div role="group" aria-label="Day" className="grid grid-cols-4 gap-1.5">
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
              className={cn(CHIP, "h-12", picked ? "bg-ink text-white" : "bg-sunken text-ink hover:bg-line")}
            >
              <span className="text-xs">{slotDay(first)}</span>
              <span className="text-sm font-semibold tabular-nums">{Number(key.slice(8))}</span>
            </button>
          );
        })}
        {allDays || dayKeys.length <= DAYS_SHOWN ? null : (
          <button type="button" onClick={() => setAllDays(true)} className={cn(CHIP, "h-12 bg-sunken text-[0.8125rem] font-semibold text-ink-2 hover:bg-line")}>
            More days
          </button>
        )}
      </div>
      <div role="group" aria-label="Time" className="grid grid-cols-4 gap-1.5">
        {times.map((iso) => (
          <button
            key={iso}
            type="button"
            aria-pressed={iso === slot}
            onClick={() => setSlot(iso)}
            className={cn(CHIP, "h-9 font-figure text-[0.8125rem]", iso === slot ? "bg-rattan text-ink" : "bg-sunken text-ink hover:bg-line")}
          >
            {slotTime(iso)}
          </button>
        ))}
      </div>
      <button type="button" disabled={slot === null || booking} onClick={submit} className={cn(DARK_BUTTON, "mt-1 w-full")}>
        {booking ? "Booking…" : slot === null ? "Pick a time" : `Book ${slotLabel(slot)}`}
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
