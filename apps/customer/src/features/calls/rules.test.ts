import { describe, expect, it } from "vitest";
import {
  BOOKING_WINDOW_DAYS,
  bookButtonLabel,
  calcomBookingMetadata,
  calcomBookingUid,
  calcomMeetingUrl,
  calcomPage,
  calcomSaysTaken,
  callAlert,
  callRows,
  callsAreOpen,
  defaultReasonOf,
  fakeSlots,
  inFirstLook,
  MAX_UPCOMING_CALLS,
  promiseDates,
  readBookCall,
  readSlotStart,
  readTimeZone,
  reasonOptions,
  upcomingCount,
  type CallInput,
} from "./rules";

// Ported from apps/platform lib/calls/{rows,form,slot-view,alert-facts}.test.ts, lib/server/call-scheduling.test.ts (pure parts)
// and lib/first-look.test.ts. Times are 24-hour here: the old "2:00 pm" is "14:00".

const NOW = new Date("2026-12-01T06:30:00.000Z"); // Tue 1 Dec 2026, 12:00 in India.

function call(overrides: Partial<CallInput> & Pick<CallInput, "id">): CallInput {
  return { reason: "social", note: null, startsAt: new Date("2026-12-02T08:30:00.000Z"), endsAt: new Date("2026-12-02T09:00:00.000Z"), status: "booked", summary: null, ...overrides };
}

describe("callRows", () => {
  it("splits calls still to come from calls that are over, soonest first and newest first", () => {
    const { upcoming, past } = callRows({
      calls: [
        call({ id: "later", startsAt: new Date("2026-12-09T08:30:00.000Z"), endsAt: new Date("2026-12-09T09:00:00.000Z") }),
        call({ id: "soon" }),
        call({ id: "old-1", status: "held", reason: "website", startsAt: new Date("2026-11-03T11:00:00.000Z"), endsAt: new Date("2026-11-03T11:30:00.000Z"), summary: "Brighter photos" }),
        call({ id: "old-2", status: "held", reason: "billing", startsAt: new Date("2026-11-20T11:00:00.000Z"), endsAt: new Date("2026-11-20T11:30:00.000Z") }),
      ],
      kickoff: null,
      now: NOW,
    });
    expect(upcoming.map((row) => row.key)).toEqual(["soon", "later"]);
    expect(past.map((row) => row.key)).toEqual(["old-2", "old-1"]);
  });

  it("writes the time in India, the reason in the customer's words, and lets only a call still ahead be changed or cancelled", () => {
    const { upcoming } = callRows({ calls: [call({ id: "soon", reason: "other" })], kickoff: null, now: NOW });
    expect(upcoming[0]).toMatchObject({ about: "Something else", when: "Wed 2 Dec, 14:00", canChange: true, canCancel: true, callId: "soon" });
    const underway = callRows({ calls: [call({ id: "now", startsAt: new Date("2026-12-01T06:00:00.000Z"), endsAt: new Date("2026-12-01T06:45:00.000Z") })], kickoff: null, now: NOW });
    expect(underway.upcoming[0]).toMatchObject({ canChange: false, canCancel: false });
  });

  it("keeps the reason and the note, leaves a cancelled call out, and shows what was agreed only for a held call", () => {
    expect(callRows({ calls: [call({ id: "soon", reason: "billing", note: "About my invoice" })], kickoff: null, now: NOW }).upcoming[0]).toMatchObject({ reason: "billing", note: "About my invoice" });
    expect(callRows({ calls: [call({ id: "gone", status: "cancelled" })], kickoff: null, now: NOW })).toEqual({ upcoming: [], past: [] });
    const { past } = callRows({
      calls: [
        call({ id: "held", status: "held", startsAt: new Date("2026-11-03T11:00:00.000Z"), endsAt: new Date("2026-11-03T11:30:00.000Z"), summary: "Add Saturday timings" }),
        call({ id: "unmarked", startsAt: new Date("2026-11-04T11:00:00.000Z"), endsAt: new Date("2026-11-04T11:30:00.000Z"), summary: "Never shown" }),
      ],
      kickoff: null,
      now: NOW,
    });
    expect(past.find((row) => row.key === "held")?.agreed).toBe("Add Saturday timings");
    expect(past.find((row) => row.key === "unmarked")?.agreed).toBeNull();
  });

  it("adds the kickoff as a row that cannot be changed here, only with both times", () => {
    const kickoff = { startsAt: new Date("2026-10-27T08:30:00.000Z"), endsAt: new Date("2026-10-27T09:00:00.000Z"), heldAt: new Date("2026-10-27T09:10:00.000Z"), summary: "6 pages in blue and white" };
    expect(callRows({ calls: [], kickoff, now: NOW }).past).toEqual([
      {
        key: "kickoff",
        callId: null,
        about: "Kickoff",
        reason: null,
        note: null,
        when: "Tue 27 Oct, 14:00",
        startsAtIso: "2026-10-27T08:30:00.000Z",
        endsAtIso: "2026-10-27T09:00:00.000Z",
        agreed: "6 pages in blue and white",
        canChange: false,
        canCancel: false,
      },
    ]);
    expect(callRows({ calls: [], kickoff: { startsAt: null, endsAt: null, heldAt: NOW, summary: "x" }, now: NOW })).toEqual({ upcoming: [], past: [] });
    const ahead = callRows({ calls: [], kickoff: { startsAt: new Date("2026-12-03T08:30:00.000Z"), endsAt: new Date("2026-12-03T09:00:00.000Z"), heldAt: null, summary: null }, now: NOW });
    expect(ahead.upcoming.map((row) => row.key)).toEqual(["kickoff"]);
  });
});

describe("upcomingCount and the limit", () => {
  it("counts booked calls that have not ended, and can leave out the one being changed", () => {
    const calls = [call({ id: "a" }), call({ id: "b" }), call({ id: "c", status: "cancelled" }), call({ id: "d", status: "held", startsAt: new Date("2026-11-03T11:00:00.000Z"), endsAt: new Date("2026-11-03T11:30:00.000Z") })];
    expect(upcomingCount(calls, NOW)).toBe(2);
    expect(upcomingCount(calls, NOW, "a")).toBe(1);
    expect(MAX_UPCOMING_CALLS).toBe(3);
  });
});

describe("readBookCall", () => {
  const ALL = ["website", "social", "search", "billing", "other"] as const;

  it("takes a reason the customer may pick and keeps the note trimmed; a blank note is no note", () => {
    expect(readBookCall({ reason: "social", note: "  Ads for braces in January.  " }, ALL)).toEqual({ ok: true, reason: "social", note: "Ads for braces in January." });
    expect(readBookCall({ reason: "billing", note: undefined }, ALL)).toEqual({ ok: true, reason: "billing", note: null });
    expect(readBookCall({ reason: "billing", note: "   " }, ALL)).toEqual({ ok: true, reason: "billing", note: null });
  });

  it("refuses a reason that is not on the list, or a service the customer has not bought", () => {
    const refused = { ok: false, message: "Choose what the call is about." };
    expect(readBookCall({ reason: "kickoff", note: "" }, ALL)).toEqual(refused);
    expect(readBookCall({ reason: undefined, note: "" }, ALL)).toEqual(refused);
    expect(readBookCall({ reason: "search", note: "" }, ["website", "billing", "other"])).toEqual(refused);
  });

  it("refuses a note that is too long or is not text", () => {
    expect(readBookCall({ reason: "other", note: "x".repeat(501) }, ALL)).toEqual({ ok: false, message: "Keep the note to 500 characters or fewer." });
    expect(readBookCall({ reason: "other", note: "x".repeat(500) }, ALL)).toMatchObject({ ok: true });
    expect(readBookCall({ reason: "other", note: 42 }, ALL)).toMatchObject({ ok: false });
  });
});

describe("reasons and the Book button", () => {
  it("offers the services bought, then Billing and Something else", () => {
    expect(reasonOptions(["website", "search"]).map((option) => option.value)).toEqual(["website", "search", "billing", "other"]);
  });

  it("starts from the reason it was opened with, or the first option", () => {
    const options = [{ value: "website" }, { value: "billing" }, { value: "other" }] as const;
    expect(defaultReasonOf(options, "billing")).toBe("billing");
    expect(defaultReasonOf(options, "search")).toBe("website");
    expect(defaultReasonOf([], "billing")).toBeUndefined();
  });

  it("asks for a time, names the time picked, and says Booking while it books", () => {
    expect(bookButtonLabel(null, false)).toBe("Pick a time");
    expect(bookButtonLabel("2026-12-02T08:30:00.000Z", false, NOW)).toBe("Book Wed 2 Dec, 14:00");
    expect(bookButtonLabel("2026-12-02T08:30:00.000Z", true)).toBe("Booking…");
  });
});

describe("times that can be picked", () => {
  const FRIDAY = new Date("2026-10-16T08:00:00.000Z");

  it("accepts a time still ahead and inside the booking window, and nothing else", () => {
    expect(readSlotStart("2026-10-17T05:00:00.000Z", FRIDAY)).toEqual(new Date("2026-10-17T05:00:00.000Z"));
    expect(readSlotStart("2026-10-16T07:59:00.000Z", FRIDAY)).toBeNull();
    expect(readSlotStart(FRIDAY.toISOString(), FRIDAY)).toBeNull();
    expect(readSlotStart(new Date(FRIDAY.getTime() + (BOOKING_WINDOW_DAYS + 1) * 86_400_000).toISOString(), FRIDAY)).toBeNull();
    expect(readSlotStart("tomorrow", FRIDAY)).toBeNull();
    expect(readSlotStart(12, FRIDAY)).toBeNull();
  });

  it("keeps a real time zone and falls back to UTC for anything else", () => {
    expect(readTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(readTimeZone("UTC")).toBe("UTC");
    expect(readTimeZone("Not/AZone")).toBe("UTC");
    expect(readTimeZone("x".repeat(65))).toBe("UTC");
    expect(readTimeZone(undefined)).toBe("UTC");
  });

  it("the local stand-in offers weekday times only, inside the window", () => {
    const to = new Date(FRIDAY.getTime() + BOOKING_WINDOW_DAYS * 86_400_000);
    const slots = fakeSlots(FRIDAY, to);
    expect(slots.length).toBeGreaterThan(0);
    for (const iso of slots) {
      const start = new Date(iso);
      expect(start.getTime()).toBeGreaterThanOrEqual(FRIDAY.getTime());
      expect(start.getTime()).toBeLessThanOrEqual(to.getTime());
      expect([0, 6]).not.toContain(start.getUTCDay());
    }
  });
});

describe("Cal.com", () => {
  const INVITEE = { name: "Meera Shah", email: "meera@example.com", timeZone: "Asia/Kolkata", businessId: "b1" };

  it("reads the user and event from a cal.com link, and refuses anything else", () => {
    expect(calcomPage("https://cal.com/steve-brandbasket/30min")).toEqual({ username: "steve-brandbasket", slug: "30min" });
    expect(calcomPage("https://cal.com/steve-brandbasket/30min/")).toEqual({ username: "steve-brandbasket", slug: "30min" });
    for (const link of ["https://cal.com/steve-brandbasket", "https://cal.com/team/acme/intro", "https://calendly.com/steve/30min", "http://cal.com/steve/30min", "not a link"]) {
      expect(calcomPage(link), link).toBeNull();
    }
  });

  it("cancels only a booking this app stored", () => {
    expect(calcomBookingUid("https://api.cal.com/v2/bookings/abc123")).toBe("abc123");
    expect(calcomBookingUid("https://api.calendly.com/scheduled_events/E1/invitees/I1")).toBeNull();
    expect(calcomBookingUid("https://api.cal.com/v2/bookings/abc/../../me")).toBeNull();
  });

  it("calls a booking with no purpose the kickoff, and carries the purpose, reason and note of a later call", () => {
    expect(calcomBookingMetadata(INVITEE)).toEqual({ source: "dashboard", businessId: "b1", purpose: "kickoff" });
    expect(calcomBookingMetadata({ ...INVITEE, purpose: "call", reason: "social", note: "Ads for braces" })).toEqual({ source: "dashboard", businessId: "b1", purpose: "call", reason: "social", note: "Ads for braces" });
    expect(calcomBookingMetadata({ ...INVITEE, purpose: "call", reason: "other", note: "" })).not.toHaveProperty("note");
    expect(calcomBookingMetadata({ ...INVITEE, purpose: "call", reason: "other", note: "x".repeat(600) }).note).toHaveLength(500);
  });

  it("reads a taken time and the meeting address from Cal.com's answers", () => {
    expect(calcomSaysTaken(409, "")).toBe(true);
    expect(calcomSaysTaken(400, "User is not available at this time")).toBe(true);
    expect(calcomSaysTaken(400, "Invalid email")).toBe(false);
    expect(calcomSaysTaken(500, "busy")).toBe(false);
    expect(calcomMeetingUrl({ meetingUrl: "https://app.cal.com/video/u1" })).toBe("https://app.cal.com/video/u1");
    expect(calcomMeetingUrl({ location: "https://meet.google.com/abc" })).toBe("https://meet.google.com/abc");
    expect(calcomMeetingUrl({ location: "In person" })).toBeNull();
  });
});

describe("promiseDates", () => {
  it("starts within 48 hours and goes live within 7 working days of the call, in India", () => {
    // Tue 3 Nov 11:00 in India.
    expect(promiseDates("2026-11-03T05:30:00.000Z")).toEqual({ startBy: "2026-11-05", liveBy: "2026-11-12" });
  });
});

describe("the first look, and when calls open", () => {
  const base = { hasAccess: true, websiteLive: false, setupSent: false, callHeld: false, callEndsAt: new Date("2026-11-30T06:00:00.000Z"), now: NOW };

  it("is open until two days after the call's end, unless held, sent or live", () => {
    expect(inFirstLook(base)).toBe(true);
    expect(inFirstLook({ ...base, now: new Date("2026-12-02T06:00:01.000Z") })).toBe(false);
    expect(inFirstLook({ ...base, callHeld: true })).toBe(false);
    expect(inFirstLook({ ...base, setupSent: true })).toBe(false);
    expect(inFirstLook({ ...base, websiteLive: true })).toBe(false);
    // A call with no end time keeps it open.
    expect(inFirstLook({ ...base, callEndsAt: null })).toBe(true);
  });

  it("never applies to an account without access, which has no calls either", () => {
    expect(inFirstLook({ ...base, hasAccess: false })).toBe(false);
    expect(callsAreOpen({ ...base, hasAccess: false })).toBe(false);
    expect(callsAreOpen(base)).toBe(false);
    expect(callsAreOpen({ ...base, callHeld: true })).toBe(true);
  });
});

describe("callAlert", () => {
  const starts = new Date("2026-10-28T10:00:00.000Z");
  const ends = new Date("2026-10-28T10:30:00.000Z");

  it("says when in India time, what it is about, the services and the meeting link, with a Join meeting button", () => {
    const alert = callAlert({ kind: "call", changed: false, startsAt: starts, endsAt: ends, previousStartsAt: null, previousEndsAt: null, services: ["Website", "Social & Ads"], meetingUrl: "https://meet.example/x", reason: "search", note: " Rank for implants " });
    expect(alert.event).toBe("call_booked");
    expect(alert.facts).toEqual([
      { name: "When", value: "Wed 28 Oct, 15:30 to 16:00 India time" },
      { name: "Moved from", value: null },
      { name: "About", value: "Search" },
      { name: "Services", value: "Website and Social & Ads" },
      { name: "Meeting link", value: "https://meet.example/x" },
    ]);
    expect(alert.text).toBe("Customer's note: Rank for implants");
    expect(alert.buttons).toEqual([{ label: "Join meeting", url: "https://meet.example/x" }]);
  });

  it("says a moved kickoff was moved, and from when", () => {
    const alert = callAlert({ kind: "kickoff", changed: true, startsAt: starts, endsAt: ends, previousStartsAt: new Date("2026-10-27T10:00:00.000Z"), previousEndsAt: new Date("2026-10-27T10:30:00.000Z"), services: [], meetingUrl: null, reason: null, note: null });
    expect(alert.event).toBe("kickoff_changed");
    expect(alert.facts[1]).toEqual({ name: "Moved from", value: "Tue 27 Oct, 15:30 to 16:00 India time" });
    expect(alert.buttons).toEqual([]);
  });
});
