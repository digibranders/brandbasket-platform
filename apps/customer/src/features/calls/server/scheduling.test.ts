import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_WINDOW_DAYS } from "../rules";
import { bookCallSlot, cancelCallBooking, listCallSlots } from "./scheduling";

// Ported from apps/platform lib/server/call-scheduling.test.ts (the parts with I/O).

vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));

const CALENDLY = "https://calendly.com/steve-brandbasket/30min";
const CAL = "https://cal.com/steve-brandbasket/30min";
const INVITEE = { name: "Meera Shah", email: "meera@example.com", timeZone: "Asia/Kolkata", businessId: "b1" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the local call scheduler", () => {
  // Off a real deployment, with no booking service keys: the stand-in that never runs where customers can reach the app.
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "http://localhost:3197");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("CALCOM_API_KEY", "");
    vi.stubEnv("CALENDLY_API_TOKEN", "");
  });

  it("offers weekday times inside the booking window, none in the past", async () => {
    const now = new Date("2026-10-16T08:00:00.000Z");
    const slots = (await listCallSlots(CALENDLY, now)) ?? [];
    expect(slots.length).toBeGreaterThan(0);
    for (const iso of slots) {
      const start = new Date(iso);
      expect(start.getTime()).toBeGreaterThan(now.getTime());
      expect(start.getTime()).toBeLessThanOrEqual(now.getTime() + BOOKING_WINDOW_DAYS * 86_400_000);
      expect([0, 6]).not.toContain(start.getUTCDay());
    }
  });

  it("books a time it offered and refuses one it did not", async () => {
    const first = ((await listCallSlots(CALENDLY, new Date())) ?? [])[0];
    expect(first).toBeDefined();
    const booked = await bookCallSlot(CALENDLY, first ?? "", INVITEE);
    expect(booked?.ok).toBe(true);
    if (booked?.ok) expect(booked.call.endsAt.getTime() - booked.call.startsAt.getTime()).toBe(30 * 60_000);
    const odd = new Date(Date.now() + 86_400_000).toISOString().replace(/\d\d:\d\d:\d\d/, "03:17:00");
    expect(await bookCallSlot(CALENDLY, odd, INVITEE)).toEqual({ ok: false, reason: "taken" });
  });

  it("offers nothing on a real deployment without a booking service, so the booking page is shown", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.brandbasket.in");
    expect(await listCallSlots(CALENDLY, new Date())).toBeNull();
  });
});

describe("booking through Cal.com", () => {
  const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const booking = (data: Record<string, unknown>) => answer(201, { status: "success", data: { uid: "u1", start: "2026-10-28T10:00:00.000Z", end: "2026-10-28T10:30:00.000Z", ...data } });

  beforeEach(() => {
    vi.stubEnv("CALCOM_API_KEY", "test-key");
    vi.stubEnv("CALENDLY_API_TOKEN", "");
  });

  it("returns the booking's own address and the meeting address Cal.com made", async () => {
    vi.stubGlobal("fetch", booking({ meetingUrl: "https://app.cal.com/video/u1" }));
    const booked = await bookCallSlot(CAL, "2026-10-28T10:00:00.000Z", INVITEE);
    expect(booked).toMatchObject({ ok: true, call: { inviteeUri: "https://api.cal.com/v2/bookings/u1", meetingUrl: "https://app.cal.com/video/u1" } });
  });

  it("says a time is taken on a conflict, and failed on anything else", async () => {
    vi.stubGlobal("fetch", answer(409, { error: { message: "Booking conflict" } }));
    expect(await bookCallSlot(CAL, "2026-10-28T10:00:00.000Z", INVITEE)).toEqual({ ok: false, reason: "taken" });
    vi.stubGlobal("fetch", answer(500, {}));
    expect(await bookCallSlot(CAL, "2026-10-28T10:00:00.000Z", INVITEE)).toEqual({ ok: false, reason: "failed" });
  });

  it("cancels a Cal.com booking this app made, and nothing else", async () => {
    const fetchMock = vi.fn<(address: string) => Promise<Response>>(() => Promise.resolve(new Response(JSON.stringify({ status: "success" }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    await cancelCallBooking(CAL, "https://api.cal.com/v2/bookings/abc123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.cal.com/v2/bookings/abc123/cancel");
    await cancelCallBooking(CAL, "https://api.calendly.com/scheduled_events/E1/invitees/I1");
    await cancelCallBooking(CAL, "https://api.cal.com/v2/bookings/abc/../../me");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
