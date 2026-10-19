import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeRateLimit,
  createBookingOtp,
  deleteBookingOtp,
  listBusyIntervals,
  purgeExpiredBookingData,
  readBookingContext,
  readPractitionerSchedules,
  readSiteFacts,
  type BookingContext,
  type PractitionerScheduleRow,
  type SiteFacts,
} from "@brandbasket/db";
import { EmailConfigurationError, type EmailMessage } from "@brandbasket/email";
import type { BookingInput } from "@brandbasket/shared/lib/appointments/booking-form";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import { accountCodeSecret, emailCodeBypassed } from "./env";
import { hashOtpCode } from "./otp-crypto";
import { getPublicDb } from "./public-db";
import { requestBookingOtp } from "./booking-otp";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./env", () => ({ accountCodeSecret: vi.fn(), emailCodeBypassed: vi.fn(() => false) }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));
vi.mock("./public-db", () => ({ getPublicDb: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  consumeRateLimit: vi.fn(),
  createBookingOtp: vi.fn(),
  deleteBookingOtp: vi.fn(),
  listBusyIntervals: vi.fn(),
  purgeExpiredBookingData: vi.fn(),
  readBookingContext: vi.fn(),
  readPractitionerSchedules: vi.fn(),
  readSiteFacts: vi.fn(),
}));

const mockedGetStaffDb = vi.mocked(getStaffDb);
const mockedAccountCodeSecret = vi.mocked(accountCodeSecret);
const mockedCustomerEmailTransport = vi.mocked(customerEmailTransport);
const mockedGetPublicDb = vi.mocked(getPublicDb);
const mockedConsumeRateLimit = vi.mocked(consumeRateLimit);
const mockedCreateBookingOtp = vi.mocked(createBookingOtp);
const mockedDeleteBookingOtp = vi.mocked(deleteBookingOtp);
const mockedListBusyIntervals = vi.mocked(listBusyIntervals);
const mockedPurgeExpiredBookingData = vi.mocked(purgeExpiredBookingData);
const mockedReadBookingContext = vi.mocked(readBookingContext);
const mockedReadSiteFacts = vi.mocked(readSiteFacts);
const mockedReadPractitionerSchedules = vi.mocked(readPractitionerSchedules);

const SECRET = "s".repeat(32);
/** Matches every UUID shape used here (v4 randomUUID() or v7-shaped test ids alike). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
/** 2026-01-05 is a Monday; 09:00Z is 14:30 Asia/Kolkata. */
const NOW = new Date("2026-01-05T09:00:00Z");

function context(overrides: Partial<BookingContext> = {}): BookingContext {
  return {
    enabled: true,
    timeZone: "Asia/Kolkata",
    settings: { accepting: true, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
    services: [{ id: "22222222-2222-2222-2222-222222222222", name: "Cleaning", position: 0, archivedAt: null }],
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

const DOCTOR_A = "33333333-3333-3333-3333-33333333333a";
const DOCTOR_B = "33333333-3333-3333-3333-33333333333b";

function doctor(id: string): PractitionerScheduleRow {
  return { id, name: `Dr. ${id.slice(-1).toUpperCase()}`, title: null, photoMediaId: null, usesClinicHours: true, hours: [], leave: [] };
}

/** 2026-01-05T10:30:00Z is 16:00 Asia/Kolkata: `input()`'s own slot. */
function busyAt16(practitionerId: string): { startsAt: Date; endsAt: Date; practitionerId: string } {
  return { startsAt: new Date("2026-01-05T10:30:00Z"), endsAt: new Date("2026-01-05T11:00:00Z"), practitionerId };
}

function input(overrides: Partial<BookingInput> = {}): BookingInput {
  return {
    name: "Asha Rao",
    email: "asha@example.com",
    phone: "+919876543210",
    serviceId: null,
    date: "2026-01-05", // Monday, open 09:00-18:00 local
    start: "16:00", // well past the 60-minute notice from 14:30 local "now"
    practitionerId: null,
    ...overrides,
  };
}

const PUBLIC_DB = { name: "public-db" } as never;
const sendMock = vi.fn<(message: EmailMessage) => Promise<void>>(async () => undefined);

/** The six digits in the emailed message: the only place the code is ever written in the clear. */
function emailedCode(): string {
  return /\b(\d{6})\b/.exec(sendMock.mock.calls[0]?.[0]?.bodyText ?? "")?.[1] ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(emailCodeBypassed).mockReturnValue(false);
  mockedGetStaffDb.mockReturnValue({} as never);
  mockedGetPublicDb.mockReturnValue(PUBLIC_DB);
  mockedAccountCodeSecret.mockReturnValue(SECRET);
  sendMock.mockReset().mockResolvedValue(undefined);
  mockedCustomerEmailTransport.mockReturnValue({ send: sendMock } as unknown as ReturnType<typeof customerEmailTransport>);
  mockedReadBookingContext.mockResolvedValue(context());
  mockedReadSiteFacts.mockResolvedValue(facts());
  mockedListBusyIntervals.mockResolvedValue([]);
  mockedReadPractitionerSchedules.mockResolvedValue([doctor(DOCTOR_A)]);
  mockedConsumeRateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  mockedCreateBookingOtp.mockResolvedValue("db-assigned-id-unused");
  mockedDeleteBookingOtp.mockResolvedValue(true);
  mockedPurgeExpiredBookingData.mockResolvedValue({ deletedOtps: 0 });
});

describe("requestBookingOtp", () => {
  it("is unavailable when the module is disabled", async () => {
    mockedReadBookingContext.mockResolvedValue(context({ enabled: false }));
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(outcome).toEqual({ kind: "unavailable" });
    expect(mockedListBusyIntervals).not.toHaveBeenCalled();
  });

  it("is unavailable when the business has no time zone", async () => {
    mockedReadBookingContext.mockResolvedValue(context({ timeZone: null }));
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(outcome).toEqual({ kind: "unavailable" });
  });

  it("is unavailable when there are no settings yet", async () => {
    mockedReadBookingContext.mockResolvedValue(context({ settings: null }));
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(outcome).toEqual({ kind: "unavailable" });
  });

  it("is paused with the default message when none was set", async () => {
    mockedReadBookingContext.mockResolvedValue(
      context({ settings: { accepting: false, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 } }),
    );
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(outcome).toEqual({ kind: "paused", message: "Online booking is paused. Please call us." });
  });

  it("is paused with the business's own message when one was set", async () => {
    mockedReadBookingContext.mockResolvedValue(
      context({
        settings: { accepting: false, pausedMessage: "Back on Monday", slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
      }),
    );
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(outcome).toEqual({ kind: "paused", message: "Back on Monday" });
  });

  it("is invalid on serviceId when it names a service the business doesn't have", async () => {
    const outcome = await requestBookingOtp(BUSINESS_ID, input({ serviceId: "99999999-9999-9999-9999-999999999999" }), "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "invalid", field: "serviceId", message: "Choose a service from the list." });
  });

  it("is invalid on start when the day is closed", async () => {
    mockedReadSiteFacts.mockResolvedValue(facts({ hours: [] }));
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "invalid", field: "start", message: "Choose an available time." });
  });

  it("is invalid on start when the slot doesn't align to the grid", async () => {
    const outcome = await requestBookingOtp(BUSINESS_ID, input({ start: "16:05" }), "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "invalid", field: "start", message: "Choose an available time." });
  });

  it("is invalid on start when the slot is already past (inside the notice window)", async () => {
    // "now" is 14:30 local; a 14:30 slot with 60 minutes notice required is past.
    const outcome = await requestBookingOtp(BUSINESS_ID, input({ start: "09:00" }), "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "invalid", field: "start", message: "Choose an available time." });
  });

  it("is taken when the slot overlaps an existing busy interval", async () => {
    // 2026-01-05T10:30:00Z is 16:00 Asia/Kolkata.
    mockedListBusyIntervals.mockResolvedValue([busyAt16(DOCTOR_A)]);
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "taken" });
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
    expect(mockedCreateBookingOtp).not.toHaveBeenCalled();
  });

  it("is invalid on practitionerId when it names no active doctor, before any rate limit is spent", async () => {
    const outcome = await requestBookingOtp(
      BUSINESS_ID,
      input({ practitionerId: "33333333-3333-3333-3333-3333333333ff" }),
      "1.2.3.4",
      NOW,
    );
    expect(outcome).toEqual({ kind: "invalid", field: "practitionerId", message: "Choose a doctor from the list." });
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
    expect(mockedCreateBookingOtp).not.toHaveBeenCalled();
  });

  it("is taken when the chosen doctor is booked then, even while another doctor is free", async () => {
    mockedReadPractitionerSchedules.mockResolvedValue([doctor(DOCTOR_A), doctor(DOCTOR_B)]);
    mockedListBusyIntervals.mockResolvedValue([busyAt16(DOCTOR_A)]);
    const outcome = await requestBookingOtp(BUSINESS_ID, input({ practitionerId: DOCTOR_A }), "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "taken" });
    expect(mockedCreateBookingOtp).not.toHaveBeenCalled();
  });

  it("emails a code for any doctor while one of them is still free, storing no doctor in the payload", async () => {
    mockedReadPractitionerSchedules.mockResolvedValue([doctor(DOCTOR_A), doctor(DOCTOR_B)]);
    mockedListBusyIntervals.mockResolvedValue([busyAt16(DOCTOR_A)]);
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "1.2.3.4", NOW);
    expect(outcome.kind).toBe("otp_sent");
    expect(mockedCreateBookingOtp.mock.calls[0]?.[1]?.payload.practitionerId).toBeNull();
  });

  it("stores the notice version the patient saw in the payload, and none when the client site sent none", async () => {
    await requestBookingOtp(BUSINESS_ID, input({ noticeVersion: "pre-dpdp" }), "1.2.3.4", NOW);
    expect(mockedCreateBookingOtp.mock.calls[0]?.[1]?.payload.noticeVersion).toBe("pre-dpdp");
    await requestBookingOtp(BUSINESS_ID, input(), "1.2.3.4", NOW);
    expect(mockedCreateBookingOtp.mock.calls[1]?.[1]?.payload).not.toHaveProperty("noticeVersion");
  });

  it("stores the chosen doctor in the payload when they are free", async () => {
    mockedReadPractitionerSchedules.mockResolvedValue([doctor(DOCTOR_A), doctor(DOCTOR_B)]);
    mockedListBusyIntervals.mockResolvedValue([busyAt16(DOCTOR_A)]);
    const outcome = await requestBookingOtp(BUSINESS_ID, input({ practitionerId: DOCTOR_B }), "1.2.3.4", NOW);
    expect(outcome.kind).toBe("otp_sent");
    expect(mockedCreateBookingOtp.mock.calls[0]?.[1]?.payload.practitionerId).toBe(DOCTOR_B);
  });

  it("is invalid on start when the clinic has no active doctor", async () => {
    mockedReadPractitionerSchedules.mockResolvedValue([]);
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "invalid", field: "start", message: "Choose an available time." });
  });

  it("consumes the rate limits narrowest first: IP, then email (short, day, global), then business -- each email rule under its own key", async () => {
    await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);

    expect(mockedConsumeRateLimit).toHaveBeenCalledTimes(5);
    const keys = mockedConsumeRateLimit.mock.calls.map((call) => call[1]);
    const rules = mockedConsumeRateLimit.mock.calls.map((call) => call[2]);
    expect(keys).toEqual([
      `otp:ip:${BUSINESS_ID}:203.0.113.9`,
      `otp:email:10m:${BUSINESS_ID}:asha@example.com`,
      `otp:email:day:${BUSINESS_ID}:asha@example.com`,
      `otp:email:any:asha@example.com`,
      `otp:business:${BUSINESS_ID}`,
    ]);
    // The two per-business email rules use distinct keys precisely so neither can wipe the other's counter (see
    // consumeRateLimit's window-cleanup behaviour) -- asserted explicitly since it's the whole point of the fix.
    expect(keys[1]).not.toBe(keys[2]);
    expect(rules[0]).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(rules[1]).toEqual({ limit: 3, windowSeconds: 600 });
    expect(rules[2]).toEqual({ limit: 8, windowSeconds: 86400 });
    expect(rules[3]).toEqual({ limit: 10, windowSeconds: 86400 });
    expect(rules[4]).toEqual({ limit: 300, windowSeconds: 86400 });
  });

  it("never keys a rate limit on the phone number: it is collected, not used to send anything", async () => {
    await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    for (const call of mockedConsumeRateLimit.mock.calls) expect(call[1]).not.toContain("+919876543210");
  });

  it("keys the global per-email limit on the address alone, so the same address is capped across different businesses", async () => {
    const otherBusinessId = "33333333-3333-3333-3333-333333333333";
    await requestBookingOtp(otherBusinessId, input(), "203.0.113.9", NOW);

    const globalCall = mockedConsumeRateLimit.mock.calls.find((call) => (call[1] as string).startsWith("otp:email:any:"));
    expect(globalCall?.[1]).toBe("otp:email:any:asha@example.com");
    expect(globalCall?.[2]).toEqual({ limit: 10, windowSeconds: 86400 });
  });

  it("is limited when only the global per-email rule refuses, even though every per-business rule allows", async () => {
    mockedConsumeRateLimit.mockImplementation(async (_db, key) => {
      if ((key as string).startsWith("otp:email:any:")) return { allowed: false, remaining: 0, retryAfterSeconds: 3600 };
      return { allowed: true, remaining: 1, retryAfterSeconds: 0 };
    });

    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);

    expect(outcome).toEqual({ kind: "limited" });
    expect(mockedCreateBookingOtp).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("stops at the first refused rate limit and never creates or sends a code", async () => {
    mockedConsumeRateLimit
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 })
      .mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });

    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);

    expect(outcome).toEqual({ kind: "limited" });
    expect(mockedConsumeRateLimit).toHaveBeenCalledTimes(1);
    expect(mockedCreateBookingOtp).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("creates the code, emails it to the patient's address and returns otp_sent with the email hint", async () => {
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);

    expect(outcome.kind).toBe("otp_sent");
    if (outcome.kind !== "otp_sent") throw new Error("expected otp_sent");
    expect(outcome.otpId).toMatch(UUID_PATTERN);
    expect(outcome.expiresInSeconds).toBe(600);
    expect(outcome.emailHint).toBe("a•••@example.com");
    expect(outcome).not.toHaveProperty("phoneHint");

    expect(mockedCreateBookingOtp).toHaveBeenCalledTimes(1);
    const createCall = mockedCreateBookingOtp.mock.calls[0]?.[1];
    // The id passed to createBookingOtp -- generated before the insert so codeHash can be salted with it -- is
    // exactly the otpId the caller gets back, not whatever createBookingOtp's own return value would have been.
    expect(createCall?.id).toBe(outcome.otpId);
    expect(createCall?.businessId).toBe(BUSINESS_ID);
    expect(createCall?.email).toBe("asha@example.com");
    expect(createCall?.phone).toBe("+919876543210");
    expect(createCall?.payload).toMatchObject({
      name: "Asha Rao",
      phone: "+919876543210",
      date: "2026-01-05",
      start: "16:00",
      end: "16:30",
      practitionerId: null,
    });
    // The address proves who asked; it is not kept on the booking itself.
    expect(createCall?.payload).not.toHaveProperty("email");
    expect(mockedCustomerEmailTransport).toHaveBeenCalledWith(PUBLIC_DB);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({ to: "asha@example.com", template: "booking-code", subject: "Your appointment confirmation code" });
  });

  it("never texts anything: the phone number is not an address a code goes to", async () => {
    await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(sendMock.mock.calls)).not.toContain("+919876543210");
  });

  it("with the local code bypass on, still emails the code and applies every check, and says so without naming the patient", async () => {
    vi.mocked(emailCodeBypassed).mockReturnValue(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);

    expect(outcome.kind).toBe("otp_sent");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(mockedCreateBookingOtp).toHaveBeenCalledTimes(1);
    // The warning names the business only -- never the patient's address, phone or name.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("asha@example.com");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("+919876543210");
    warn.mockRestore();
  });

  it("with the local code bypass on, still applies the rate limits", async () => {
    vi.mocked(emailCodeBypassed).mockReturnValue(true);
    mockedConsumeRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(outcome.kind).toBe("limited");
    expect(mockedCreateBookingOtp).not.toHaveBeenCalled();
  });

  it("fires the opportunistic expired-data purge with the staff db and the request's own now", async () => {
    await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(mockedPurgeExpiredBookingData).toHaveBeenCalledTimes(1);
    expect(mockedPurgeExpiredBookingData).toHaveBeenCalledWith({}, NOW);
  });

  it("still emails the code, and never logs patient data, when the opportunistic purge rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedPurgeExpiredBookingData.mockRejectedValue(new Error("connection reset"));

    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    // Let the fire-and-forget purge promise's rejection handler run before asserting on it.
    await new Promise((resolve) => setImmediate(resolve));

    expect(outcome.kind).toBe("otp_sent");
    for (const call of consoleError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("Asha Rao");
      expect(JSON.stringify(call)).not.toContain("asha@example.com");
      expect(JSON.stringify(call)).not.toContain("+919876543210");
    }
    consoleError.mockRestore();
  });

  it("generates a fresh otpId on every call", async () => {
    const first = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    const second = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    if (first.kind !== "otp_sent" || second.kind !== "otp_sent") throw new Error("expected otp_sent");
    expect(first.otpId).not.toBe(second.otpId);
  });

  it("hashes and emails the same code: the stored codeHash verifies against the code actually put in the email", async () => {
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    if (outcome.kind !== "otp_sent") throw new Error("expected otp_sent");

    const sentCode = emailedCode();
    expect(sentCode).toMatch(/^\d{6}$/);

    const createCall = mockedCreateBookingOtp.mock.calls[0]?.[1];
    expect(createCall?.codeHash).toBe(hashOtpCode(outcome.otpId, sentCode, SECRET));
    // ...and a different code (never the code itself, stored in the clear) does not verify against it.
    expect(createCall?.codeHash).not.toBe(hashOtpCode(outcome.otpId, "000000" === sentCode ? "111111" : "000000", SECRET));
  });

  it("snapshots the service name into the payload when a service was requested", async () => {
    await requestBookingOtp(BUSINESS_ID, input({ serviceId: "22222222-2222-2222-2222-222222222222" }), "1.2.3.4", NOW);
    const payload = mockedCreateBookingOtp.mock.calls[0]?.[1]?.payload;
    expect(payload?.serviceId).toBe("22222222-2222-2222-2222-222222222222");
    expect(payload?.serviceName).toBe("Cleaning");
  });

  it("deletes the code and returns failed when emailing it fails", async () => {
    sendMock.mockRejectedValue(new Error("provider down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);

    expect(outcome).toEqual({ kind: "failed" });
    for (const call of consoleError.mock.calls) expect(JSON.stringify(call)).not.toContain("asha@example.com");
    consoleError.mockRestore();
    const createCall = mockedCreateBookingOtp.mock.calls[0]?.[1];
    expect(mockedDeleteBookingOtp).toHaveBeenCalledWith({}, createCall?.id);
  });

  it("accepts a phone number from any country: it is collected for the clinic to call, and nothing is sent to it", async () => {
    const outcome = await requestBookingOtp(BUSINESS_ID, input({ phone: "+14155551234" }), "1.2.3.4", NOW);
    expect(outcome.kind).toBe("otp_sent");
    expect(mockedCreateBookingOtp.mock.calls[0]?.[1]?.phone).toBe("+14155551234");
  });

  it("returns failed, without spending a rate limit or reading anything, when the code secret is missing", async () => {
    mockedAccountCodeSecret.mockImplementation(() => {
      throw new Error("Invalid email code configuration: ACCOUNT_CODE_SECRET is required (at least 32 characters)");
    });
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(outcome).toEqual({ kind: "failed" });
    expect(mockedReadBookingContext).not.toHaveBeenCalled();
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
  });

  it("returns failed, without spending a rate limit or reading anything, when the email transport cannot be built", async () => {
    mockedCustomerEmailTransport.mockImplementation(() => {
      throw new Error("DATABASE_URL_PUBLIC is missing");
    });
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(outcome).toEqual({ kind: "failed" });
    expect(mockedReadBookingContext).not.toHaveBeenCalled();
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
  });

  it("is unavailable, not failed, without spending a rate limit or reading anything, when production has no email provider", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCustomerEmailTransport.mockImplementation(() => {
      throw new EmailConfigurationError("BREVO_API_KEY is not set");
    });

    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);

    expect(outcome).toEqual({ kind: "unavailable" });
    expect(mockedReadBookingContext).not.toHaveBeenCalled();
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
    expect(mockedCreateBookingOtp).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    for (const call of consoleError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("Asha Rao");
      expect(JSON.stringify(call)).not.toContain("asha@example.com");
      expect(JSON.stringify(call)).not.toContain("+919876543210");
    }
    consoleError.mockRestore();
  });

  it("returns failed, without throwing, when a dependency rejects", async () => {
    mockedListBusyIntervals.mockRejectedValue(new Error("connection lost"));
    const outcome = await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);
    expect(outcome).toEqual({ kind: "failed" });
  });

  it("never logs patient data when a dependency throws a params-carrying error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateBookingOtp.mockRejectedValue(new Error('Failed query params: ["Asha Rao","asha@example.com","+919876543210"]'));

    await requestBookingOtp(BUSINESS_ID, input(), "203.0.113.9", NOW);

    for (const call of consoleError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("Asha Rao");
      expect(JSON.stringify(call)).not.toContain("asha@example.com");
      expect(JSON.stringify(call)).not.toContain("+919876543210");
    }
    consoleError.mockRestore();
  });
});
