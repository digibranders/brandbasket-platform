import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_WINDOW_DAYS, bookCallSlot, calcomBookingMetadata, calcomPage, cancelCallBooking, listCallSlots, readSlotStart, readTimeZone } from "./call-scheduling";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-16T08:00:00.000Z"); // a Friday
const URL = "https://calendly.com/steve-brandbasket/30min";
const INVITEE = { name: "Meera Shah", email: "meera@example.com", timeZone: "Asia/Kolkata", businessId: "b1" };

describe("the local call scheduler", () => {
  // The local scheduler only runs off a real deployment, so pin a local environment: the VPS runs these tests with its https
  // build settings loaded, and a real CALCOM or CALENDLY key would pick a live scheduler instead.
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "http://app.brandbasket.localhost:3198");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("CALCOM_API_KEY", "");
    vi.stubEnv("CALENDLY_API_TOKEN", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offers weekday times inside the booking window, none in the past", async () => {
    const slots = (await listCallSlots(URL, NOW)) ?? [];
    expect(slots.length).toBeGreaterThan(0);
    for (const iso of slots) {
      const start = new Date(iso);
      expect(start.getTime()).toBeGreaterThan(NOW.getTime());
      expect(start.getTime()).toBeLessThanOrEqual(NOW.getTime() + BOOKING_WINDOW_DAYS * 86_400_000);
      expect([0, 6]).not.toContain(start.getUTCDay());
    }
  });

  it("books a time it offered and refuses one it did not", async () => {
    const real = new Date(Date.now() + 86_400_000);
    const upcoming = (await listCallSlots(URL, new Date())) ?? [];
    const first = upcoming[0];
    expect(first).toBeDefined();
    const booked = await bookCallSlot(URL, first ?? "", INVITEE);
    expect(booked?.ok).toBe(true);
    if (booked?.ok) expect(booked.call.endsAt.getTime() - booked.call.startsAt.getTime()).toBe(30 * 60_000);
    const refused = await bookCallSlot(URL, real.toISOString().replace(/\d\d:\d\d:\d\d/, "03:17:00"), INVITEE);
    expect(refused).toEqual({ ok: false, reason: "taken" });
  });
});

describe("booking through Cal.com", () => {
  const CAL_URL = "https://cal.com/steve-brandbasket/30min";
  const booking = (data: Record<string, unknown>) =>
    vi.fn(async () => new Response(JSON.stringify({ status: "success", data: { uid: "u1", start: "2026-10-28T10:00:00.000Z", end: "2026-10-28T10:30:00.000Z", ...data } }), { status: 201 }));

  beforeEach(() => {
    vi.stubEnv("CALCOM_API_KEY", "test-key");
    vi.stubEnv("CALENDLY_API_TOKEN", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns the meeting address Cal.com made for the booking", async () => {
    vi.stubGlobal("fetch", booking({ meetingUrl: "https://app.cal.com/video/u1" }));
    const booked = await bookCallSlot(CAL_URL, "2026-10-28T10:00:00.000Z", INVITEE);
    expect(booked?.ok && booked.call.meetingUrl).toBe("https://app.cal.com/video/u1");
  });

  it("falls back to a location that is a web address, and to none for anything else", async () => {
    vi.stubGlobal("fetch", booking({ location: "https://meet.google.com/abc-defg-hij" }));
    const withLink = await bookCallSlot(CAL_URL, "2026-10-28T10:00:00.000Z", INVITEE);
    expect(withLink?.ok && withLink.call.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    vi.stubGlobal("fetch", booking({ location: "In person at the office" }));
    const without = await bookCallSlot(CAL_URL, "2026-10-28T10:00:00.000Z", INVITEE);
    expect(without?.ok && without.call.meetingUrl).toBeNull();
  });
});

describe("calcomPage", () => {
  it("reads the user and event from a cal.com link", () => {
    expect(calcomPage("https://cal.com/steve-brandbasket/30min")).toEqual({ username: "steve-brandbasket", slug: "30min" });
    expect(calcomPage("https://cal.com/steve-brandbasket/30min/")).toEqual({ username: "steve-brandbasket", slug: "30min" });
  });

  it("refuses anything else", () => {
    expect(calcomPage("https://cal.com/steve-brandbasket")).toBeNull();
    expect(calcomPage("https://cal.com/team/acme/intro")).toBeNull();
    expect(calcomPage("https://calendly.com/steve-brandbasket/30min")).toBeNull();
    expect(calcomPage("http://cal.com/steve-brandbasket/30min")).toBeNull();
    expect(calcomPage("not a link")).toBeNull();
  });
});

describe("cancelCallBooking", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("cancels a Cal.com booking this server made, and nothing else", async () => {
    vi.stubEnv("CALCOM_API_KEY", "cal_live_test");
    const fetchMock = vi.fn<(address: string) => Promise<Response>>(() => Promise.resolve(new Response(JSON.stringify({ status: "success" }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await cancelCallBooking(URL.replace("calendly.com", "cal.com"), "https://api.cal.com/v2/bookings/abc123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.cal.com/v2/bookings/abc123/cancel");

    await cancelCallBooking(URL.replace("calendly.com", "cal.com"), "https://api.calendly.com/scheduled_events/E1/invitees/I1");
    await cancelCallBooking(URL.replace("calendly.com", "cal.com"), "https://api.cal.com/v2/bookings/abc/../../me");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("calcomBookingMetadata", () => {
  it("calls a booking with no purpose the kickoff, as every booking was before calls existed", () => {
    expect(calcomBookingMetadata(INVITEE)).toEqual({ source: "dashboard", businessId: "b1", purpose: "kickoff" });
  });

  it("carries the purpose, the reason and the customer's note, so the host sees why the call was booked", () => {
    expect(calcomBookingMetadata({ ...INVITEE, purpose: "call", reason: "social", note: "Ads for braces in January" })).toEqual({
      source: "dashboard",
      businessId: "b1",
      purpose: "call",
      reason: "social",
      note: "Ads for braces in January",
    });
  });

  it("leaves out an empty note and cuts a long one to Cal.com's 500 characters", () => {
    expect(calcomBookingMetadata({ ...INVITEE, purpose: "call", reason: "other", note: "" })).not.toHaveProperty("note");
    expect(calcomBookingMetadata({ ...INVITEE, purpose: "call", reason: "other", note: null })).not.toHaveProperty("note");
    expect(calcomBookingMetadata({ ...INVITEE, purpose: "call", reason: "other", note: "x".repeat(600) }).note).toHaveLength(500);
  });
});

describe("readSlotStart", () => {
  it("accepts a time still ahead and inside the booking window", () => {
    expect(readSlotStart("2026-10-17T05:00:00.000Z", NOW)).toEqual(new Date("2026-10-17T05:00:00.000Z"));
  });

  it("refuses a time in the past, beyond the window, not a time, or not text", () => {
    expect(readSlotStart("2026-10-16T07:59:00.000Z", NOW)).toBeNull();
    expect(readSlotStart(NOW.toISOString(), NOW)).toBeNull();
    expect(readSlotStart(new Date(NOW.getTime() + (BOOKING_WINDOW_DAYS + 1) * 86_400_000).toISOString(), NOW)).toBeNull();
    expect(readSlotStart("tomorrow", NOW)).toBeNull();
    expect(readSlotStart(12, NOW)).toBeNull();
  });
});

describe("readTimeZone", () => {
  it("keeps a real time zone and falls back to UTC for anything else", () => {
    expect(readTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(readTimeZone("Not/AZone")).toBe("UTC");
    expect(readTimeZone("x".repeat(65))).toBe("UTC");
    expect(readTimeZone(undefined)).toBe("UTC");
  });
});
