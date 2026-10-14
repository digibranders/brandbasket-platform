import { describe, expect, it } from "vitest";
import type { BookingContext, SiteFacts } from "@fynix/db";
import { buildSiteInfo } from "./site-info";

/** 2026-01-01T19:00:00Z is already 2026-01-02 in Asia/Kolkata (UTC+5:30), so this exercises the time-zone shift. */
const NOW = new Date("2026-01-01T19:00:00Z");

function facts(overrides: Partial<SiteFacts> = {}): SiteFacts {
  return {
    timeZone: "Asia/Kolkata",
    hours: [],
    closures: [],
    announcement: null,
    ...overrides,
  };
}

function booking(overrides: Partial<BookingContext> = {}): BookingContext {
  return {
    enabled: true,
    timeZone: "Asia/Kolkata",
    settings: { accepting: true, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
    services: [],
    ...overrides,
  };
}

describe("buildSiteInfo", () => {
  it("uses the business's own time zone for today, not UTC's date", () => {
    const info = buildSiteInfo({ businessName: "Smile Dental", facts: facts(), booking: booking(), practitioners: [], now: NOW });
    expect(info.today).toBe("2026-01-02");
    expect(info.business).toBe("Smile Dental");
    expect(info.timeZone).toBe("Asia/Kolkata");
  });

  it("reads today in India time, and says so, when the business has not chosen a time zone", () => {
    const info = buildSiteInfo({
      businessName: "Smile Dental",
      facts: facts({ timeZone: null }),
      booking: booking({ enabled: false }),
      practitioners: [],
      now: NOW,
    });
    expect(info.today).toBe("2026-01-02");
    expect(info.timeZone).toBe("Asia/Kolkata");
  });

  it("slices HH:MM:SS times from the database down to HH:MM", () => {
    const info = buildSiteInfo({
      businessName: "Smile Dental",
      facts: facts({
        hours: [{ id: "h1", dayOfWeek: 0, opensAt: "09:00:00", closesAt: "17:30:00", closed: false, openAllDay: false }],
      }),
      booking: booking(),
      practitioners: [],
      now: NOW,
    });
    expect(info.hours).toEqual([{ dayOfWeek: 0, opensAt: "09:00", closesAt: "17:30", closed: false, openAllDay: false }]);
  });

  it("keeps nulls for a closed or open-all-day row", () => {
    const info = buildSiteInfo({
      businessName: "Smile Dental",
      facts: facts({
        hours: [{ id: "h1", dayOfWeek: 1, opensAt: null, closesAt: null, closed: true, openAllDay: false }],
      }),
      booking: booking(),
      practitioners: [],
      now: NOW,
    });
    expect(info.hours[0]).toMatchObject({ opensAt: null, closesAt: null });
  });

  it("drops a closure that has already ended", () => {
    const info = buildSiteInfo({
      businessName: "Smile Dental",
      facts: facts({
        closures: [
          { id: "c1", startsOn: "2025-12-01", endsOn: "2025-12-05", note: "Past" },
          { id: "c2", startsOn: "2026-02-01", endsOn: "2026-02-03", note: "Upcoming" },
        ],
      }),
      booking: booking(),
      practitioners: [],
      now: NOW,
    });
    expect(info.closures).toEqual([{ startsOn: "2026-02-01", endsOn: "2026-02-03", note: "Upcoming" }]);
  });

  it("shows the announcement while today falls within its range", () => {
    const info = buildSiteInfo({
      businessName: "Smile Dental",
      facts: facts({ announcement: { message: "Closed for Diwali", startsOn: "2026-01-01", endsOn: "2026-01-03" } }),
      booking: booking(),
      practitioners: [],
      now: NOW,
    });
    expect(info.announcement).toEqual({ message: "Closed for Diwali", endsOn: "2026-01-03" });
  });

  it("hides the announcement once its range has passed", () => {
    const info = buildSiteInfo({
      businessName: "Smile Dental",
      facts: facts({ announcement: { message: "Closed for Diwali", startsOn: "2025-11-01", endsOn: "2025-11-05" } }),
      booking: booking(),
      practitioners: [],
      now: NOW,
    });
    expect(info.announcement).toBeNull();
  });

  it("returns booking null when the module is disabled", () => {
    const info = buildSiteInfo({ businessName: "Smile Dental", facts: facts(), booking: booking({ enabled: false }), practitioners: [], now: NOW });
    expect(info.booking).toBeNull();
  });

  it("returns booking null when the business has no time zone set", () => {
    const info = buildSiteInfo({ businessName: "Smile Dental", facts: facts(), booking: booking({ timeZone: null }), practitioners: [], now: NOW });
    expect(info.booking).toBeNull();
  });

  it("returns booking null when there are no settings yet", () => {
    const info = buildSiteInfo({ businessName: "Smile Dental", facts: facts(), booking: booking({ settings: null }), practitioners: [], now: NOW });
    expect(info.booking).toBeNull();
  });

  it("builds the booking payload with services and the slot length", () => {
    const info = buildSiteInfo({
      businessName: "Smile Dental",
      facts: facts(),
      booking: booking({
        settings: { accepting: false, pausedMessage: "Back on Monday", slotMinutes: 45, minNoticeMinutes: 60, horizonDays: 28 },
        services: [{ id: "s1", name: "Cleaning", position: 0, archivedAt: null }],
      }),
      practitioners: [],
      now: NOW,
    });
    expect(info.booking).toEqual({
      accepting: false,
      pausedMessage: "Back on Monday",
      services: [{ id: "s1", name: "Cleaning" }],
      slotMinutes: 45,
      practitioners: [],
    });
  });

  it("lists the active doctors in the order given, without their hours, leave or media ids", () => {
    const info = buildSiteInfo({
      businessName: "Smile Dental",
      facts: facts(),
      booking: booking(),
      practitioners: [
        { id: "p1", name: "Dr. Asha Rao", title: "Orthodontist", photoMediaId: "m1", usesClinicHours: true, hours: [], leave: [] },
        {
          id: "p2",
          name: "Dr. Vikram Shah",
          title: null,
          photoMediaId: null,
          usesClinicHours: false,
          hours: [{ id: "h1", dayOfWeek: 0, opensAt: "09:00", closesAt: "13:00", closed: false, openAllDay: false }],
          leave: [{ id: "l1", startsOn: "2026-01-05", endsOn: "2026-01-06", note: "Conference" }],
        },
      ],
      now: NOW,
    });
    expect(info.booking?.practitioners).toEqual([
      { id: "p1", name: "Dr. Asha Rao", title: "Orthodontist", photoUrl: null },
      { id: "p2", name: "Dr. Vikram Shah", title: null, photoUrl: null },
    ]);
  });
});
