import { moveSetupCallBooking, removeSetupCallBooking } from "@brandbasket/db";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "./db";
import { handleCalcomWebhook, parseCalcomEvent, verifyCalcomSignature } from "./calcom-webhook";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ moveSetupCallBooking: vi.fn(), removeSetupCallBooking: vi.fn() }));

const SECRET = "whsec-test-0123456789abcdef";
const NOW = new Date("2026-10-23T10:00:00.000Z");
const staffDb = { name: "staff-db" } as never;

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}
function delivery(triggerEvent: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ triggerEvent, createdAt: "2026-10-23T09:59:00.000Z", payload });
}
const cancelled = delivery("BOOKING_CANCELLED", { uid: "old-uid-1", startTime: "2026-10-26T05:00:00.000Z", endTime: "2026-10-26T05:30:00.000Z" });
const rescheduled = delivery("BOOKING_RESCHEDULED", {
  uid: "new-uid-2",
  rescheduleUid: "old-uid-1",
  startTime: "2026-10-27T06:00:00.000Z",
  endTime: "2026-10-27T06:30:00.000Z",
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CALCOM_WEBHOOK_SECRET", SECRET);
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(moveSetupCallBooking).mockResolvedValue(true);
  vi.mocked(removeSetupCallBooking).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyCalcomSignature", () => {
  it("accepts the hex HMAC-SHA256 of the exact body under the secret, and nothing else", () => {
    expect(verifyCalcomSignature(cancelled, sign(cancelled), SECRET)).toBe(true);
    expect(verifyCalcomSignature(cancelled, sign(cancelled, "another-secret"), SECRET)).toBe(false);
    expect(verifyCalcomSignature(`${cancelled} `, sign(cancelled), SECRET)).toBe(false);
    expect(verifyCalcomSignature(cancelled, "no-secret-provided", SECRET)).toBe(false);
    expect(verifyCalcomSignature(cancelled, "", SECRET)).toBe(false);
  });
});

describe("parseCalcomEvent", () => {
  it("reads a cancel and a reschedule, with the booking it replaces", () => {
    expect(parseCalcomEvent(cancelled)).toEqual({ kind: "cancelled", uid: "old-uid-1" });
    expect(parseCalcomEvent(rescheduled)).toEqual({
      kind: "rescheduled",
      fromUid: "old-uid-1",
      uid: "new-uid-2",
      startsAt: new Date("2026-10-27T06:00:00.000Z"),
      endsAt: new Date("2026-10-27T06:30:00.000Z"),
    });
  });

  it("treats a ping, other events, broken bodies and odd booking ids as nothing to act on", () => {
    expect(parseCalcomEvent(delivery("PING", {}))).toEqual({ kind: "other" });
    expect(parseCalcomEvent(delivery("BOOKING_CREATED", { uid: "x" }))).toEqual({ kind: "other" });
    expect(parseCalcomEvent("not json")).toEqual({ kind: "other" });
    expect(parseCalcomEvent(delivery("BOOKING_CANCELLED", { uid: "../bookings/1" }))).toEqual({ kind: "other" });
    expect(parseCalcomEvent(delivery("BOOKING_RESCHEDULED", { uid: "new", rescheduleUid: "old", startTime: "2026-10-27T06:30:00.000Z", endTime: "2026-10-27T06:00:00.000Z" }))).toEqual({
      kind: "other",
    });
  });
});

describe("handleCalcomWebhook", () => {
  it("forgets the call the client cancelled from Cal.com, found by the Cal.com booking it was stored under", async () => {
    expect(await handleCalcomWebhook(cancelled, sign(cancelled), NOW)).toEqual({ kind: "removed" });
    expect(removeSetupCallBooking).toHaveBeenCalledWith(staffDb, "https://api.cal.com/v2/bookings/old-uid-1");
  });

  it("moves the call the client rescheduled from Cal.com to its new booking and time", async () => {
    expect(await handleCalcomWebhook(rescheduled, sign(rescheduled), NOW)).toEqual({ kind: "moved" });
    expect(moveSetupCallBooking).toHaveBeenCalledWith(staffDb, {
      fromInviteeUri: "https://api.cal.com/v2/bookings/old-uid-1",
      toInviteeUri: "https://api.cal.com/v2/bookings/new-uid-2",
      startsAt: new Date("2026-10-27T06:00:00.000Z"),
      endsAt: new Date("2026-10-27T06:30:00.000Z"),
      now: NOW,
    });
  });

  it("answers ignored for a meeting that is no kickoff call, and for events it does not use", async () => {
    vi.mocked(removeSetupCallBooking).mockResolvedValue(false);
    expect(await handleCalcomWebhook(cancelled, sign(cancelled), NOW)).toEqual({ kind: "ignored" });
    const ping = delivery("PING", {});
    expect(await handleCalcomWebhook(ping, sign(ping), NOW)).toEqual({ kind: "ignored" });
  });

  it("refuses an unsigned or wrongly signed delivery, and changes nothing", async () => {
    expect(await handleCalcomWebhook(cancelled, null, NOW)).toEqual({ kind: "refused" });
    expect(await handleCalcomWebhook(cancelled, sign(cancelled, "another-secret"), NOW)).toEqual({ kind: "refused" });
    expect(removeSetupCallBooking).not.toHaveBeenCalled();
  });

  it("acts on nothing when the server has no secret to check deliveries with", async () => {
    vi.stubEnv("CALCOM_WEBHOOK_SECRET", "");
    expect(await handleCalcomWebhook(cancelled, sign(cancelled, ""), NOW)).toEqual({ kind: "unconfigured" });
    expect(removeSetupCallBooking).not.toHaveBeenCalled();
  });
});
