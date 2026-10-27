import { cancelTeamCallByUri, moveSetupCallBooking, moveTeamCallByUri, recordBookedCallFromWebhook, removeSetupCallBooking } from "@brandbasket/db";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "./db";
import { handleCalcomWebhook, parseCalcomEvent, verifyCalcomSignature } from "./calcom-webhook";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  cancelTeamCallByUri: vi.fn(),
  moveSetupCallBooking: vi.fn(),
  moveTeamCallByUri: vi.fn(),
  recordBookedCallFromWebhook: vi.fn(),
  removeSetupCallBooking: vi.fn(),
}));

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
const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
function created(metadata: Record<string, unknown> | null | undefined, attendees: unknown = [{ name: "Priya", email: "Priya@Example.com" }]): string {
  return delivery("BOOKING_CREATED", {
    uid: "uid-3",
    startTime: "2026-12-02T08:30:00.000Z",
    endTime: "2026-12-02T09:00:00.000Z",
    attendees,
    ...(metadata === undefined ? {} : { metadata }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CALCOM_WEBHOOK_SECRET", SECRET);
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(moveSetupCallBooking).mockResolvedValue(true);
  vi.mocked(removeSetupCallBooking).mockResolvedValue(true);
  vi.mocked(moveTeamCallByUri).mockResolvedValue(true);
  vi.mocked(cancelTeamCallByUri).mockResolvedValue(true);
  vi.mocked(recordBookedCallFromWebhook).mockResolvedValue("recorded");
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

  it("reads a new booking with who booked it and what the dashboard said it is for", () => {
    expect(parseCalcomEvent(created({ source: "dashboard", purpose: "call", businessId: BUSINESS, reason: "billing", note: "About my invoice" }))).toEqual({
      kind: "created",
      uid: "uid-3",
      startsAt: new Date("2026-12-02T08:30:00.000Z"),
      endsAt: new Date("2026-12-02T09:00:00.000Z"),
      attendeeEmails: ["Priya@Example.com"],
      businessHint: BUSINESS,
      purpose: "call",
      reason: "billing",
      note: "About my invoice",
    });
  });

  it("calls a dashboard booking with no purpose a kickoff (every booking made before calls existed), and a booking with no metadata a booking page one", () => {
    expect(parseCalcomEvent(created({ source: "dashboard", businessId: BUSINESS }))).toMatchObject({ kind: "created", purpose: "kickoff" });
    expect(parseCalcomEvent(created(undefined))).toMatchObject({ kind: "created", purpose: null, businessHint: null, attendeeEmails: ["Priya@Example.com"] });
    expect(parseCalcomEvent(created(null))).toMatchObject({ kind: "created", purpose: null });
  });

  it("believes a business hint only when it is an id, and takes no attendee that is not an email field", () => {
    expect(parseCalcomEvent(created({ businessId: "not-an-id" }))).toMatchObject({ businessHint: null });
    expect(parseCalcomEvent(created({}, [{ name: "x" }, { email: "a@example.com" }, "junk"]))).toMatchObject({ attendeeEmails: ["a@example.com"] });
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

  it("cancels a team call the client cancelled from Cal.com when the booking is no kickoff call", async () => {
    vi.mocked(removeSetupCallBooking).mockResolvedValue(false);
    expect(await handleCalcomWebhook(cancelled, sign(cancelled), NOW)).toEqual({ kind: "removed" });
    expect(cancelTeamCallByUri).toHaveBeenCalledWith(staffDb, "https://api.cal.com/v2/bookings/old-uid-1", NOW);
  });

  it("does not look for a team call when the kickoff call was the booking", async () => {
    await handleCalcomWebhook(cancelled, sign(cancelled), NOW);
    expect(cancelTeamCallByUri).not.toHaveBeenCalled();
  });

  it("moves a team call the client rescheduled from Cal.com when the booking is no kickoff call", async () => {
    vi.mocked(moveSetupCallBooking).mockResolvedValue(false);
    expect(await handleCalcomWebhook(rescheduled, sign(rescheduled), NOW)).toEqual({ kind: "moved" });
    expect(moveTeamCallByUri).toHaveBeenCalledWith(staffDb, {
      fromProviderUri: "https://api.cal.com/v2/bookings/old-uid-1",
      toProviderUri: "https://api.cal.com/v2/bookings/new-uid-2",
      startsAt: new Date("2026-10-27T06:00:00.000Z"),
      endsAt: new Date("2026-10-27T06:30:00.000Z"),
      now: NOW,
    });
  });

  it("records a new booking for the business of the person who made it", async () => {
    const body = created({ source: "dashboard", purpose: "call", businessId: BUSINESS, reason: "billing", note: "About my invoice" });
    expect(await handleCalcomWebhook(body, sign(body), NOW)).toEqual({ kind: "recorded" });
    expect(recordBookedCallFromWebhook).toHaveBeenCalledWith(staffDb, {
      providerUri: "https://api.cal.com/v2/bookings/uid-3",
      startsAt: new Date("2026-12-02T08:30:00.000Z"),
      endsAt: new Date("2026-12-02T09:00:00.000Z"),
      attendeeEmails: ["Priya@Example.com"],
      businessHint: BUSINESS,
      purpose: "call",
      reason: "billing",
      note: "About my invoice",
    });
  });

  it("answers ignored for a new booking the query does not take", async () => {
    vi.mocked(recordBookedCallFromWebhook).mockResolvedValue("known");
    const body = created(undefined);
    expect(await handleCalcomWebhook(body, sign(body), NOW)).toEqual({ kind: "ignored" });
  });

  it("answers ignored for a meeting that is no kickoff call or team call, and for events it does not use", async () => {
    vi.mocked(removeSetupCallBooking).mockResolvedValue(false);
    vi.mocked(cancelTeamCallByUri).mockResolvedValue(false);
    expect(await handleCalcomWebhook(cancelled, sign(cancelled), NOW)).toEqual({ kind: "ignored" });
    const ping = delivery("PING", {});
    expect(await handleCalcomWebhook(ping, sign(ping), NOW)).toEqual({ kind: "ignored" });
  });

  it("refuses an unsigned or wrongly signed delivery, and changes nothing", async () => {
    expect(await handleCalcomWebhook(cancelled, null, NOW)).toEqual({ kind: "refused" });
    expect(await handleCalcomWebhook(cancelled, sign(cancelled, "another-secret"), NOW)).toEqual({ kind: "refused" });
    expect(removeSetupCallBooking).not.toHaveBeenCalled();
    expect(cancelTeamCallByUri).not.toHaveBeenCalled();
    expect(recordBookedCallFromWebhook).not.toHaveBeenCalled();
  });

  it("acts on nothing when the server has no secret to check deliveries with", async () => {
    vi.stubEnv("CALCOM_WEBHOOK_SECRET", "");
    expect(await handleCalcomWebhook(cancelled, sign(cancelled, ""), NOW)).toEqual({ kind: "unconfigured" });
    expect(removeSetupCallBooking).not.toHaveBeenCalled();
  });
});
