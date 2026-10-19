import { describe, expect, it } from "vitest";
import type { BookingContext, SiteFacts } from "@brandbasket/db";
import type { PractitionerCalendar } from "@brandbasket/shared/lib/appointments/clinic-availability";
import {
  buildAvailabilityResponse,
  DEFAULT_PAUSED_MESSAGE,
  parsePractitionerParam,
  resolveAvailabilityWindow,
  type AvailabilityWindow,
} from "./availability";

/** 2026-01-05 is a Monday. */
const NOW = new Date("2026-01-05T09:00:00Z"); // 14:30 Asia/Kolkata

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
    hours: [{ id: "h1", dayOfWeek: 0, opensAt: "09:00:00", closesAt: "17:00:00", closed: false, openAllDay: false }],
    closures: [],
    announcement: null,
    ...overrides,
  };
}

describe("resolveAvailabilityWindow", () => {
  it("is unavailable when the module is disabled", () => {
    expect(resolveAvailabilityWindow(context({ enabled: false }), null, NOW)).toEqual({ kind: "unavailable" });
  });

  it("is unavailable when the business has no time zone", () => {
    expect(resolveAvailabilityWindow(context({ timeZone: null }), null, NOW)).toEqual({ kind: "unavailable" });
  });

  it("is unavailable when there are no settings yet", () => {
    expect(resolveAvailabilityWindow(context({ settings: null }), null, NOW)).toEqual({ kind: "unavailable" });
  });

  it("is paused with the default message when none was set", () => {
    const outcome = resolveAvailabilityWindow(
      context({ settings: { accepting: false, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 } }),
      null,
      NOW,
    );
    expect(outcome).toEqual({ kind: "paused", message: DEFAULT_PAUSED_MESSAGE });
  });

  it("is paused with the business's own message when one was set", () => {
    const outcome = resolveAvailabilityWindow(
      context({
        settings: { accepting: false, pausedMessage: "Back on Monday", slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
      }),
      null,
      NOW,
    );
    expect(outcome).toEqual({ kind: "paused", message: "Back on Monday" });
  });

  it("checks unavailable and paused before a bad week param", () => {
    expect(resolveAvailabilityWindow(context({ enabled: false }), "not-a-date", NOW)).toEqual({ kind: "unavailable" });
  });

  it("is invalid_week on a malformed week param", () => {
    expect(resolveAvailabilityWindow(context(), "not-a-date", NOW)).toEqual({ kind: "invalid_week" });
  });

  it("defaults the week to the current week (its Monday) when weekParam is null", () => {
    const outcome = resolveAvailabilityWindow(context(), null, NOW);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.window.weekStart).toBe("2026-01-05"); // NOW's local date is already a Monday
      expect(outcome.window.today).toBe("2026-01-05");
    }
  });

  it("normalises weekParam to its Monday when it names another day in the week", () => {
    const outcome = resolveAvailabilityWindow(context(), "2026-01-08", NOW); // a Thursday
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") expect(outcome.window.weekStart).toBe("2026-01-05");
  });

  it("computes nowMinutes in the business's own time zone", () => {
    const outcome = resolveAvailabilityWindow(context(), null, NOW);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") expect(outcome.window.nowMinutes).toBe(14 * 60 + 30);
  });

  it("carries the settings' slot length, notice and horizon into the window", () => {
    const outcome = resolveAvailabilityWindow(
      context({ settings: { accepting: true, pausedMessage: null, slotMinutes: 45, minNoticeMinutes: 15, horizonDays: 14 } }),
      null,
      NOW,
    );
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.window.slotMinutes).toBe(45);
      expect(outcome.window.minNoticeMinutes).toBe(15);
      expect(outcome.window.horizonDays).toBe(14);
    }
  });
});

describe("buildAvailabilityResponse", () => {
  const window: AvailabilityWindow = {
    timeZone: "Asia/Kolkata",
    weekStart: "2026-01-05",
    today: "2026-01-05",
    nowMinutes: 14 * 60 + 30,
    slotMinutes: 30,
    minNoticeMinutes: 60,
    horizonDays: 28,
  };

  function calendar(id: string, busy: PractitionerCalendar["busy"] = []): PractitionerCalendar {
    return { id, hours: facts().hours, leave: [], busy };
  }

  it("returns a 7-day week built from the practitioners' calendars", () => {
    const availability = buildAvailabilityResponse(window, facts(), [calendar("p1")]);
    expect(availability.weekStart).toBe("2026-01-05");
    expect(availability.slotMinutes).toBe(30);
    expect(availability.days).toHaveLength(7);
    expect(availability.days[0]?.slots.some((slot) => slot.state === "free")).toBe(true);
  });

  it("marks a slot taken when the only doctor has a booking overlapping it", () => {
    const availability = buildAvailabilityResponse(window, facts(), [calendar("p1", [{ date: "2026-01-05", start: "16:00", end: "16:30" }])]);
    const monday = availability.days[0];
    expect(monday?.date).toBe("2026-01-05");
    const slot = monday?.slots.find((candidate) => candidate.start === "16:00");
    expect(slot?.state).toBe("taken");
  });

  it("keeps a slot free while another doctor can still take it", () => {
    const availability = buildAvailabilityResponse(window, facts(), [
      calendar("p1", [{ date: "2026-01-05", start: "16:00", end: "16:30" }]),
      calendar("p2"),
    ]);
    expect(availability.days[0]?.slots.find((candidate) => candidate.start === "16:00")?.state).toBe("free");
  });

  it("closes every day when there are no calendars (no active doctor)", () => {
    const availability = buildAvailabilityResponse(window, facts(), []);
    expect(availability.days.every((day) => day.closed)).toBe(true);
  });
});

describe("parsePractitionerParam", () => {
  it("reads a missing or blank param as any doctor", () => {
    expect(parsePractitionerParam(null)).toEqual({ kind: "any" });
    expect(parsePractitionerParam("  ")).toEqual({ kind: "any" });
  });

  it("keeps a uuid, trimmed", () => {
    expect(parsePractitionerParam(" 01923a4e-7b3a-7c3e-8f3a-1234567890ab ")).toEqual({
      kind: "one",
      id: "01923a4e-7b3a-7c3e-8f3a-1234567890ab",
    });
  });

  it("refuses anything that is not a uuid", () => {
    expect(parsePractitionerParam("dr-mehta")).toEqual({ kind: "invalid" });
  });
});
