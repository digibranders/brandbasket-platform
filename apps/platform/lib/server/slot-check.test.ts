import { describe, expect, it } from "vitest";
import type { BookingContext, SiteFacts } from "@fynix/db";
import type { PractitionerCalendar } from "@fynix/shared/lib/appointments/clinic-availability";
import { resolveRequestedSlot } from "./slot-check";

/** 2026-01-05 is a Monday; 09:00Z is 14:30 Asia/Kolkata. */
const NOW = new Date("2026-01-05T09:00:00Z");

function context(overrides: Partial<BookingContext> = {}): BookingContext {
  return {
    enabled: true,
    timeZone: "Asia/Kolkata",
    settings: { accepting: true, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
    services: [],
    ...overrides,
  };
}

function facts(overrides: Partial<SiteFacts> = {}): SiteFacts {
  return {
    timeZone: "Asia/Kolkata",
    hours: [{ id: "h1", dayOfWeek: 0, opensAt: "09:00:00", closesAt: "18:00:00", closed: false, openAllDay: false }],
    closures: [],
    announcement: null,
    ...overrides,
  };
}

const MONDAY_HOURS = [{ id: "h1", dayOfWeek: 0, opensAt: "09:00:00", closesAt: "18:00:00", closed: false, openAllDay: false }];

function calendar(id: string, overrides: Partial<PractitionerCalendar> = {}): PractitionerCalendar {
  return { id, hours: MONDAY_HOURS, leave: [], busy: [], ...overrides };
}

/** One doctor on the clinic's Monday hours: the single-calendar case every rule below was first written for. */
const ONE_DOCTOR = [calendar("p1")];

describe("resolveRequestedSlot", () => {
  it("returns null when the business has no time zone", () => {
    expect(resolveRequestedSlot(context({ timeZone: null }), facts(), ONE_DOCTOR, "2026-01-05", "16:00", NOW)).toBeNull();
  });

  it("returns null when there are no settings yet", () => {
    expect(resolveRequestedSlot(context({ settings: null }), facts(), ONE_DOCTOR, "2026-01-05", "16:00", NOW)).toBeNull();
  });

  it("finds a free slot on an open day, past the notice window, with the doctor free for it", () => {
    // "now" is 14:30 local; 16:00 is well past the 60-minute notice.
    const resolved = resolveRequestedSlot(context(), facts(), ONE_DOCTOR, "2026-01-05", "16:00", NOW);
    expect(resolved).toEqual({ slot: { start: "16:00", end: "16:30", state: "free" }, freePractitionerIds: ["p1"] });
  });

  it("returns null for a day with no hours (closed)", () => {
    expect(resolveRequestedSlot(context(), facts(), [calendar("p1", { hours: [] })], "2026-01-05", "16:00", NOW)).toBeNull();
  });

  it("returns null when there is no calendar at all (no active doctor, or the chosen one is gone)", () => {
    expect(resolveRequestedSlot(context(), facts(), [], "2026-01-05", "16:00", NOW)).toBeNull();
  });

  it("returns null for a closed date", () => {
    const closed = facts({ closures: [{ id: "c1", startsOn: "2026-01-05", endsOn: "2026-01-05", note: "Holiday" }] });
    expect(resolveRequestedSlot(context(), closed, ONE_DOCTOR, "2026-01-05", "16:00", NOW)).toBeNull();
  });

  it("returns null for a start that doesn't align to the slot grid", () => {
    expect(resolveRequestedSlot(context(), facts(), ONE_DOCTOR, "2026-01-05", "16:05", NOW)).toBeNull();
  });

  it("marks a slot inside the notice window as past", () => {
    // "now" is 14:30 local; a 14:30 slot with 60 minutes notice required is past.
    const resolved = resolveRequestedSlot(context(), facts(), ONE_DOCTOR, "2026-01-05", "09:00", NOW);
    expect(resolved?.slot.state).toBe("past");
    expect(resolved?.freePractitionerIds).toEqual([]);
  });

  it("marks a slot taken when its only doctor is booked then", () => {
    const busy = [calendar("p1", { busy: [{ date: "2026-01-05", start: "16:00", end: "16:30" }] })];
    const resolved = resolveRequestedSlot(context(), facts(), busy, "2026-01-05", "16:00", NOW);
    expect(resolved?.slot.state).toBe("taken");
    expect(resolved?.freePractitionerIds).toEqual([]);
  });

  it("keeps a slot free with whichever doctors are still free, in calendar order", () => {
    const calendars = [
      calendar("p1"),
      calendar("p2", { busy: [{ date: "2026-01-05", start: "16:00", end: "16:30" }] }),
      calendar("p3"),
    ];
    const resolved = resolveRequestedSlot(context(), facts(), calendars, "2026-01-05", "16:00", NOW);
    expect(resolved).toEqual({ slot: { start: "16:00", end: "16:30", state: "free" }, freePractitionerIds: ["p1", "p3"] });
  });

  it("leaves out a doctor on leave that day", () => {
    const calendars = [calendar("p1", { leave: [{ startsOn: "2026-01-05", endsOn: "2026-01-05", note: "Leave" }] }), calendar("p2")];
    expect(resolveRequestedSlot(context(), facts(), calendars, "2026-01-05", "16:00", NOW)?.freePractitionerIds).toEqual(["p2"]);
  });

  it("respects the business's current slot length and horizon, not stale values", () => {
    const shortHorizon = context({
      settings: { accepting: true, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 1 },
    });
    // Only today (2026-01-05) is inside a 1-day horizon; tomorrow is now out of the booking window.
    expect(resolveRequestedSlot(shortHorizon, facts(), ONE_DOCTOR, "2026-01-06", "16:00", NOW)).toBeNull();
  });

  it("reflects a closure added after the slot was first offered", () => {
    const freeBefore = resolveRequestedSlot(context(), facts(), ONE_DOCTOR, "2026-01-05", "16:00", NOW);
    expect(freeBefore?.slot.state).toBe("free");

    const closedNow = facts({ closures: [{ id: "c2", startsOn: "2026-01-05", endsOn: "2026-01-05", note: "Emergency closure" }] });
    expect(resolveRequestedSlot(context(), closedNow, ONE_DOCTOR, "2026-01-05", "16:00", NOW)).toBeNull();
  });
});
