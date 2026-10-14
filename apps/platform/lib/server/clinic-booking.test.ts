import { describe, expect, it, vi } from "vitest";
import type { BookingContext, SiteFacts } from "@fynix/db";
import type { PractitionerCalendar } from "@fynix/shared/lib/appointments/clinic-availability";
import { buildClinicDay, checkReceptionDate, lastReceptionDate, resolveClinicSlot, type ClinicDay, type ClinicDayInput, type ClinicDaySlot } from "./clinic-booking";

// Only the pure half is under test; the loaders' staff connection is never opened.
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));

/** 2026-01-05 is a Monday; 09:00Z is 14:30 Asia/Kolkata. */
const NOW = new Date("2026-01-05T09:00:00Z");
const TODAY = "2026-01-05";

/** Every weekday 09:00-18:00, so dates far ahead land on an open day whatever weekday they are. */
const WEEK_HOURS = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  id: `h${String(dayOfWeek)}`,
  dayOfWeek,
  opensAt: "09:00:00",
  closesAt: "18:00:00",
  closed: false,
  openAllDay: false,
}));

/** A clinic whose website asks for an hour's notice and books four weeks ahead: neither applies to reception. */
function context(overrides: Partial<BookingContext> = {}): BookingContext {
  return {
    enabled: true,
    timeZone: "Asia/Kolkata",
    settings: { accepting: false, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
    services: [],
    ...overrides,
  };
}

function facts(overrides: Partial<SiteFacts> = {}): SiteFacts {
  return { timeZone: "Asia/Kolkata", hours: WEEK_HOURS, closures: [], announcement: null, ...overrides };
}

function calendar(id: string, overrides: Partial<PractitionerCalendar> = {}): PractitionerCalendar {
  return { id, hours: WEEK_HOURS, leave: [], busy: [], ...overrides };
}

function input(overrides: Partial<ClinicDayInput> = {}): ClinicDayInput {
  return { context: context(), facts: facts(), calendars: [calendar("p1")], date: TODAY, practitionerId: null, now: NOW, ...overrides };
}

function slotsOf(day: ClinicDay): readonly ClinicDaySlot[] {
  if (day.kind !== "ready") throw new Error(`Expected a ready day, got ${day.kind}`);
  return day.slots;
}

describe("checkReceptionDate", () => {
  it("allows today through the 180th day, and refuses before and after", () => {
    expect(lastReceptionDate(TODAY)).toBe("2026-07-03");
    expect(checkReceptionDate("2026-01-04", TODAY)).toBe("past");
    expect(checkReceptionDate(TODAY, TODAY)).toBe("ok");
    expect(checkReceptionDate("2026-07-03", TODAY)).toBe("ok");
    expect(checkReceptionDate("2026-07-04", TODAY)).toBe("too_far");
  });
});

describe("buildClinicDay", () => {
  it("is unavailable when the module is off or never set up", () => {
    expect(buildClinicDay(input({ context: context({ enabled: false }) })).kind).toBe("unavailable");
    expect(buildClinicDay(input({ context: context({ timeZone: null }) })).kind).toBe("unavailable");
    expect(buildClinicDay(input({ context: context({ settings: null }) })).kind).toBe("unavailable");
  });

  it("ignores the clinic's minimum notice but never offers a slot that has already started", () => {
    const slots = slotsOf(buildClinicDay(input()));
    const state = (start: string): string | undefined => slots.find((slot) => slot.start === start)?.state;
    // "now" is 14:30 local. The website, with an hour's notice, would not offer 14:30 or 15:00.
    expect(state("14:00")).toBe("past");
    expect(state("14:30")).toBe("free");
    expect(state("15:00")).toBe("free");
    expect(slots.find((slot) => slot.start === "14:30")?.freePractitionerIds).toEqual(["p1"]);
    expect(slots.find((slot) => slot.start === "14:00")?.freePractitionerIds).toEqual([]);
  });

  it("does not change the clinic's own settings", () => {
    const own = context();
    buildClinicDay(input({ context: own }));
    expect(own.settings).toEqual({ accepting: false, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 });
  });

  it("opens days up to 180 days ahead, past the clinic's online window", () => {
    const farButInside = slotsOf(buildClinicDay(input({ date: "2026-07-03" })));
    expect(farButInside.length).toBeGreaterThan(0);
    expect(farButInside.every((slot) => slot.state === "free")).toBe(true);
    expect(slotsOf(buildClinicDay(input({ date: "2026-07-04" })))).toEqual([]);
  });

  it("marks every slot on a day before today as past", () => {
    const slots = slotsOf(buildClinicDay(input({ date: "2026-01-04" })));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => slot.state === "past" && slot.freePractitionerIds.length === 0)).toBe(true);
  });

  it("returns no slots on a clinic closure", () => {
    const closed = facts({ closures: [{ id: "c1", startsOn: "2026-01-06", endsOn: "2026-01-06", note: "Holiday" }] });
    expect(slotsOf(buildClinicDay(input({ facts: closed, date: "2026-01-06" })))).toEqual([]);
  });

  it("lists every free doctor for any doctor, and only the chosen one otherwise", () => {
    const calendars = [calendar("p1", { busy: [{ date: TODAY, start: "16:00", end: "16:30" }] }), calendar("p2")];
    const at = (day: ClinicDay, start: string): ClinicDaySlot | undefined => slotsOf(day).find((slot) => slot.start === start);

    expect(at(buildClinicDay(input({ calendars })), "16:00")).toEqual({ start: "16:00", end: "16:30", state: "free", freePractitionerIds: ["p2"] });
    expect(at(buildClinicDay(input({ calendars })), "16:30")).toEqual({ start: "16:30", end: "17:00", state: "free", freePractitionerIds: ["p1", "p2"] });
    expect(at(buildClinicDay(input({ calendars, practitionerId: "p1" })), "16:00")).toEqual({
      start: "16:00",
      end: "16:30",
      state: "taken",
      freePractitionerIds: [],
    });
    expect(at(buildClinicDay(input({ calendars, practitionerId: "p2" })), "16:00")).toEqual({
      start: "16:00",
      end: "16:30",
      state: "free",
      freePractitionerIds: ["p2"],
    });
  });

  it("refuses a doctor who is not one of the active doctors", () => {
    expect(buildClinicDay(input({ practitionerId: "gone" })).kind).toBe("doctor_not_found");
  });
});

describe("resolveClinicSlot", () => {
  it("resolves a free slot to its UTC instants and its free doctors", () => {
    const calendars = [calendar("p1"), calendar("p2", { busy: [{ date: TODAY, start: "16:00", end: "16:30" }] }), calendar("p3")];
    expect(resolveClinicSlot({ ...input({ calendars }), start: "16:00" })).toEqual({
      kind: "free",
      start: "16:00",
      end: "16:30",
      startsAt: new Date("2026-01-05T10:30:00Z"),
      endsAt: new Date("2026-01-05T11:00:00Z"),
      practitionerIds: ["p1", "p3"],
    });
  });

  it("accepts a slot inside the clinic's notice window", () => {
    expect(resolveClinicSlot({ ...input(), start: "14:30" }).kind).toBe("free");
  });

  it("refuses a slot that has started", () => {
    expect(resolveClinicSlot({ ...input(), start: "14:00" })).toEqual({ kind: "past" });
  });

  it("refuses a slot every considered doctor is booked for", () => {
    const calendars = [calendar("p1", { busy: [{ date: TODAY, start: "16:00", end: "16:30" }] }), calendar("p2")];
    expect(resolveClinicSlot({ ...input({ calendars, practitionerId: "p1" }), start: "16:00" })).toEqual({ kind: "taken" });
    expect(resolveClinicSlot({ ...input({ calendars, practitionerId: "p2" }), start: "16:00" })).toMatchObject({ kind: "free", practitionerIds: ["p2"] });
  });

  it("refuses a time off the grid, outside hours, on a closed day or beyond 180 days as closed", () => {
    expect(resolveClinicSlot({ ...input(), start: "16:05" })).toEqual({ kind: "closed" });
    expect(resolveClinicSlot({ ...input(), start: "19:00" })).toEqual({ kind: "closed" });
    expect(resolveClinicSlot({ ...input({ calendars: [calendar("p1", { leave: [{ startsOn: TODAY, endsOn: TODAY, note: null }] })] }), start: "16:00" })).toEqual({
      kind: "closed",
    });
    expect(resolveClinicSlot({ ...input({ date: "2026-07-04" }), start: "10:00" })).toEqual({ kind: "closed" });
  });

  it("refuses an unknown doctor and an unavailable module", () => {
    expect(resolveClinicSlot({ ...input({ practitionerId: "gone" }), start: "16:00" })).toEqual({ kind: "doctor_not_found" });
    expect(resolveClinicSlot({ ...input({ context: context({ enabled: false }) }), start: "16:00" })).toEqual({ kind: "unavailable" });
  });
});
