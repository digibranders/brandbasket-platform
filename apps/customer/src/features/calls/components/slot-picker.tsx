"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";
import { Chips, Skeleton } from "@/ui";
import type { SlotList } from "../actions";
import { loadSlotsAction } from "../actions";
import { dayLabel, slotDays } from "../rules";

/** How many days the day chips show before "More days". */
const DAYS_SHOWN = 3;
const MORE = "more";

export type SlotsState = { readonly kind: "loading" } | SlotList;

/** Loads the times once, and drops a time the booking service said was just taken so it cannot be picked again. */
export function useCallSlots(): { readonly state: SlotsState; readonly drop: (slot: string) => void } {
  const [state, setState] = useState<SlotsState>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    loadSlotsAction()
      .then((result): SlotsState => (result.ok && result.data !== undefined ? result.data : { status: "unavailable", bookingUrl: null }))
      .catch((): SlotsState => ({ status: "unavailable", bookingUrl: null }))
      .then((next) => {
        if (live) setState(next);
      });
    return () => {
      live = false;
    };
  }, []);
  const drop = (slot: string): void =>
    setState((current) => {
      if (!("status" in current) || current.status !== "ok") return current;
      const left = current.slots.filter((iso) => iso !== slot);
      return left.length > 0 ? { status: "ok", slots: left } : { status: "unavailable", bookingUrl: null };
    });
  return { state, drop };
}

/**
 * Pick a day, then a time in India (mock: Book a call). Three days, then More days for the rest. While the times cannot be
 * listed here it says so and offers the booking page, or Requests when there is no booking page.
 */
export function SlotChooser({ state, slot, onSlotChange, bookingUrl }: { readonly state: SlotsState; readonly slot: string | null; readonly onSlotChange: (slot: string | null) => void; readonly bookingUrl: string | null }) {
  const [day, setDay] = useState<string | null>(null);
  const [allDays, setAllDays] = useState(false);

  if (!("status" in state)) {
    return (
      <div role="status" aria-label="Loading times" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-8 w-1/2" />
      </div>
    );
  }
  if (state.status === "unavailable") {
    const link = state.bookingUrl ?? bookingUrl;
    return link === null ? (
      <p className="type-body text-ink-2">
        We could not load the times. Please try again in a few minutes, or write to us in <Link href="/requests">Requests</Link>.
      </p>
    ) : (
      <p className="type-body text-ink-2">
        We could not load the times here.{" "}
        <a href={link} target="_blank" rel="noopener noreferrer">
          Pick a time on our booking page
        </a>
        .
      </p>
    );
  }

  const days = slotDays(state.slots);
  const keys = [...days.keys()];
  const active = day !== null && days.has(day) ? day : (keys[0] ?? null);
  const shown = allDays ? keys : keys.slice(0, DAYS_SHOWN);
  const dayOptions = [...shown.map((key) => ({ value: key, label: dayLabel(key) })), ...(allDays || keys.length <= DAYS_SHOWN ? [] : [{ value: MORE, label: "More days" }])];
  const times = active === null ? [] : (days.get(active) ?? []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="type-label">Pick a day</span>
        <Chips
          aria-label="Day"
          options={dayOptions}
          value={active ?? ""}
          onValueChange={(next) => {
            if (next === MORE) {
              setAllDays(true);
              return;
            }
            setDay(next);
            onSlotChange(null);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="type-label">Times in India</span>
        <Chips
          aria-label="Time"
          className="flex-wrap"
          options={times.map((iso) => ({ value: iso, label: formatTime(new Date(iso)) }))}
          value={slot ?? ""}
          onValueChange={(next) => onSlotChange(next)}
        />
      </div>
    </div>
  );
}
