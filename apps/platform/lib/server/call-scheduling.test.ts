import { describe, expect, it, vi } from "vitest";
import { BOOKING_WINDOW_DAYS, bookCallSlot, calcomPage, listCallSlots } from "./call-scheduling";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-16T08:00:00.000Z"); // a Friday
const URL = "https://calendly.com/steve-fynix/30min";
const INVITEE = { name: "Meera Shah", email: "meera@example.com", timeZone: "Asia/Kolkata", businessId: "b1" };

describe("the local call scheduler", () => {
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

describe("calcomPage", () => {
  it("reads the user and event from a cal.com link", () => {
    expect(calcomPage("https://cal.com/steve-fynix/30min")).toEqual({ username: "steve-fynix", slug: "30min" });
    expect(calcomPage("https://cal.com/steve-fynix/30min/")).toEqual({ username: "steve-fynix", slug: "30min" });
  });

  it("refuses anything else", () => {
    expect(calcomPage("https://cal.com/steve-fynix")).toBeNull();
    expect(calcomPage("https://cal.com/team/acme/intro")).toBeNull();
    expect(calcomPage("https://calendly.com/steve-fynix/30min")).toBeNull();
    expect(calcomPage("http://cal.com/steve-fynix/30min")).toBeNull();
    expect(calcomPage("not a link")).toBeNull();
  });
});
