import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookSlot,
  claimOtpAttempt,
  consumeRateLimit,
  deleteBookingOtp,
  findBookingOtp,
  listBusyIntervals,
  markOtpVerified,
  readBookingContext,
  readPractitionerSchedules,
  readSiteFacts,
  recordConsent,
  type AppointmentRow,
  type BookingContext,
  type BookingOtpRow,
  type PractitionerScheduleRow,
  type SiteFacts,
} from "@firstfold/db";
import { getStaffDb } from "./db";
import { bookingOtpBypassed, bookingOtpSecret } from "./env";
import { hashOtpCode } from "./otp-crypto";
import { confirmBookingOtp, PATIENT_OVERLAP_MESSAGE, TAKEN_MESSAGE } from "./booking-confirm";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./env", () => ({ bookingOtpSecret: vi.fn(), bookingOtpBypassed: vi.fn(() => false) }));
vi.mock("@firstfold/db", async () => {
  const actual = await vi.importActual<typeof import("@firstfold/db")>("@firstfold/db");
  return {
    bookSlot: vi.fn(),
    BookingClosedError: actual.BookingClosedError,
    claimOtpAttempt: vi.fn(),
    consumeRateLimit: vi.fn(),
    deleteBookingOtp: vi.fn(),
    findBookingOtp: vi.fn(),
    listBusyIntervals: vi.fn(),
    markOtpVerified: vi.fn(),
    readBookingContext: vi.fn(),
    readPractitionerSchedules: vi.fn(),
    readSiteFacts: vi.fn(),
    recordConsent: vi.fn(),
    PatientOverlapError: actual.PatientOverlapError,
    SlotTakenError: actual.SlotTakenError,
  };
});

const mockedGetStaffDb = vi.mocked(getStaffDb);
const mockedBookingOtpSecret = vi.mocked(bookingOtpSecret);
const mockedConsumeRateLimit = vi.mocked(consumeRateLimit);
const mockedDeleteBookingOtp = vi.mocked(deleteBookingOtp);
const mockedFindBookingOtp = vi.mocked(findBookingOtp);
const mockedClaimOtpAttempt = vi.mocked(claimOtpAttempt);
const mockedListBusyIntervals = vi.mocked(listBusyIntervals);
const mockedMarkOtpVerified = vi.mocked(markOtpVerified);
const mockedReadBookingContext = vi.mocked(readBookingContext);
const mockedReadSiteFacts = vi.mocked(readSiteFacts);
const mockedBookSlot = vi.mocked(bookSlot);
const mockedReadPractitionerSchedules = vi.mocked(readPractitionerSchedules);

const SECRET = "s".repeat(32);
const OTP_ID = "11111111-1111-1111-1111-111111111111";
const BUSINESS_ID = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-01-05T09:00:00Z");
const EXPIRES_AT = new Date("2026-01-05T09:10:00Z");
const CODE = "482913";
const PHONE = "+919876543210";

const DOCTOR_A = "33333333-3333-3333-3333-33333333333a";
const DOCTOR_B = "33333333-3333-3333-3333-33333333333b";

function doctor(id: string, name: string): PractitionerScheduleRow {
  return { id, name, title: null, photoMediaId: null, usesClinicHours: true, hours: [], leave: [] };
}

/** otpRow()'s default slot, 16:00-16:30 Asia/Kolkata on 2026-01-05, booked with `practitionerId`. */
function busyAtSlot(practitionerId: string): { startsAt: Date; endsAt: Date; practitionerId: string } {
  return { startsAt: new Date("2026-01-05T10:30:00Z"), endsAt: new Date("2026-01-05T11:00:00Z"), practitionerId };
}

function appointment(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: "appt-1",
    practitionerId: DOCTOR_A,
    patientId: "0192f3c4-4444-7000-8000-000000000001",
    patientName: "Asha Rao",
    phone: PHONE,
    email: null,
    serviceId: null,
    serviceName: null,
    patientNote: null,
    localDate: "2026-01-05",
    localStart: "16:00",
    localEnd: "16:30",
    startsAt: new Date("2026-01-05T10:30:00Z"),
    endsAt: new Date("2026-01-05T11:00:00Z"),
    status: "booked",
    cancelReason: null,
    clinicNote: null,
    cancelledAt: null,
    doneAt: null,
    noShowAt: null,
    source: "online",
    createdAt: NOW,
    handledByUserId: null,
    seenAt: null,
    ...overrides,
  };
}

function otpRow(overrides: Partial<BookingOtpRow> = {}): BookingOtpRow {
  return {
    id: OTP_ID,
    businessId: BUSINESS_ID,
    phone: PHONE,
    codeHash: hashOtpCode(OTP_ID, CODE, SECRET),
    payload: {
      name: "Asha Rao",
      phone: PHONE,
      serviceId: null,
      serviceName: null,
      date: "2026-01-05",
      start: "16:00",
      end: "16:30",
      startsAt: "2026-01-05T10:30:00.000Z",
      endsAt: "2026-01-05T11:00:00.000Z",
      practitionerId: null,
    },
    attempts: 0,
    expiresAt: EXPIRES_AT,
    verifiedAt: null,
    createdAt: new Date("2026-01-05T09:00:00Z"),
    ...overrides,
  };
}

function context(overrides: Partial<BookingContext> = {}): BookingContext {
  return {
    enabled: true,
    timeZone: "Asia/Kolkata",
    settings: { accepting: true, pausedMessage: null, slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
    services: [],
    ...overrides,
  };
}

/** Open 09:00-18:00 Monday, no closures -- matches otpRow()'s default payload (2026-01-05, a Monday, 16:00-16:30)
 * so the re-validation step's default finds it still free, same as booking-otp.test.ts's own facts(). */
function facts(overrides: Partial<SiteFacts> = {}): SiteFacts {
  return {
    timeZone: "Asia/Kolkata",
    hours: [{ id: "h1", dayOfWeek: 0, opensAt: "09:00:00", closesAt: "18:00:00", closed: false, openAllDay: false }],
    closures: [],
    announcement: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(bookingOtpBypassed).mockReturnValue(false);
  vi.clearAllMocks();
  mockedGetStaffDb.mockReturnValue({} as never);
  mockedBookingOtpSecret.mockReturnValue(SECRET);
  mockedConsumeRateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  mockedFindBookingOtp.mockResolvedValue(otpRow());
  mockedClaimOtpAttempt.mockResolvedValue({ attempts: 1 });
  mockedMarkOtpVerified.mockResolvedValue(true);
  mockedDeleteBookingOtp.mockResolvedValue(true);
  mockedReadBookingContext.mockResolvedValue(context());
  mockedReadSiteFacts.mockResolvedValue(facts());
  mockedListBusyIntervals.mockResolvedValue([]);
  mockedReadPractitionerSchedules.mockResolvedValue([doctor(DOCTOR_A, "Dr. Asha Rao"), doctor(DOCTOR_B, "Dr. Vikram Shah")]);
  mockedBookSlot.mockResolvedValue(appointment());
});

describe("confirmBookingOtp", () => {
  it("returns failed, without ever spending the rate limit, when bookingOtpSecret() throws", async () => {
    mockedBookingOtpSecret.mockImplementation(() => {
      throw new Error("BOOKING_OTP_SECRET must be at least 32 characters");
    });
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "failed" });
    expect(mockedConsumeRateLimit).not.toHaveBeenCalled();
    expect(mockedFindBookingOtp).not.toHaveBeenCalled();
  });

  it("is limited when the ip rate limit is refused, before loading the OTP", async () => {
    mockedConsumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "203.0.113.9", NOW);
    expect(outcome).toEqual({ kind: "limited" });
    expect(mockedFindBookingOtp).not.toHaveBeenCalled();
  });

  it("passes businessId to findBookingOtp, scoping the lookup to the site token's own business", async () => {
    await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedFindBookingOtp).toHaveBeenCalledWith({}, { otpId: OTP_ID, businessId: BUSINESS_ID });
  });

  it("is expired when the OTP is not found (wrong id, wrong business, or truly missing)", async () => {
    mockedFindBookingOtp.mockResolvedValue(null);
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "expired" });
  });

  it("is expired when the OTP was already verified (used)", async () => {
    mockedFindBookingOtp.mockResolvedValue(otpRow({ verifiedAt: new Date("2026-01-05T09:01:00Z") }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "expired" });
    expect(mockedClaimOtpAttempt).not.toHaveBeenCalled();
  });

  it("is expired when past expires_at", async () => {
    mockedFindBookingOtp.mockResolvedValue(otpRow({ expiresAt: new Date("2026-01-05T08:59:00Z") }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "expired" });
    expect(mockedClaimOtpAttempt).not.toHaveBeenCalled();
  });

  it("is too_many_attempts at the attempts ceiling, before even trying to claim", async () => {
    mockedFindBookingOtp.mockResolvedValue(otpRow({ attempts: 5 }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, "000000", "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "too_many_attempts", message: "Too many attempts. Send a new code." });
    expect(mockedClaimOtpAttempt).not.toHaveBeenCalled();
  });

  it("claims the attempt before comparing the code", async () => {
    await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedClaimOtpAttempt).toHaveBeenCalledWith({}, { otpId: OTP_ID, businessId: BUSINESS_ID, maxAttempts: 5, now: NOW });
  });

  it("re-reads and returns expired when the claim is lost to a race and the OTP has since expired", async () => {
    mockedClaimOtpAttempt.mockResolvedValue(null);
    mockedFindBookingOtp.mockResolvedValueOnce(otpRow()).mockResolvedValueOnce(otpRow({ expiresAt: new Date("2026-01-05T08:59:00Z") }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "expired" });
  });

  it("re-reads and returns too_many_attempts when the claim is lost to a race but the OTP hasn't expired", async () => {
    mockedClaimOtpAttempt.mockResolvedValue(null);
    mockedFindBookingOtp.mockResolvedValueOnce(otpRow()).mockResolvedValueOnce(otpRow({ attempts: 5 }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "too_many_attempts", message: "Too many attempts. Send a new code." });
  });

  it("reports tries left on a wrong code, using the claimed attempt count", async () => {
    mockedClaimOtpAttempt.mockResolvedValue({ attempts: 3 });
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, "000000", "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "wrong_code", message: "That code isn't right. 2 tries left." });
    expect(mockedMarkOtpVerified).not.toHaveBeenCalled();
  });

  it("with the OTP bypass on, books on any 6-digit code", async () => {
    vi.mocked(bookingOtpBypassed).mockReturnValue(true);
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, "000000", "1.2.3.4", NOW);
    expect(outcome.kind).toBe("booked");
    expect(mockedClaimOtpAttempt).toHaveBeenCalled();
  });

  it("with the OTP bypass on, still refuses an expired OTP and one at the attempts ceiling", async () => {
    vi.mocked(bookingOtpBypassed).mockReturnValue(true);
    mockedFindBookingOtp.mockResolvedValueOnce(null);
    expect((await confirmBookingOtp(BUSINESS_ID, OTP_ID, "000000", "1.2.3.4", NOW)).kind).toBe("expired");
    mockedClaimOtpAttempt.mockResolvedValueOnce(null);
    expect((await confirmBookingOtp(BUSINESS_ID, OTP_ID, "000000", "1.2.3.4", NOW)).kind).not.toBe("booked");
  });

  it("reports 'no tries left' with code too_many_attempts on a wrong code that exhausts the last attempt", async () => {
    mockedClaimOtpAttempt.mockResolvedValue({ attempts: 5 });
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, "000000", "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "too_many_attempts", message: "No tries left. Send a new code." });
  });

  it("is expired when markOtpVerified loses a race (already verified or expired by then)", async () => {
    mockedMarkOtpVerified.mockResolvedValue(false);
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "expired" });
    expect(mockedBookSlot).not.toHaveBeenCalled();
  });

  it("passes businessId to markOtpVerified and bookSlot", async () => {
    await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedMarkOtpVerified).toHaveBeenCalledWith({}, { otpId: OTP_ID, businessId: BUSINESS_ID, maxAttempts: 5, now: NOW });
    expect(mockedBookSlot).toHaveBeenCalledWith({}, BUSINESS_ID, expect.anything());
  });

  it("re-validates the payload's own date/start against current hours/closures/busy intervals before verifying", async () => {
    await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedReadSiteFacts).toHaveBeenCalledWith({}, BUSINESS_ID);
    expect(mockedListBusyIntervals).toHaveBeenCalledWith({}, BUSINESS_ID, new Date("2026-01-04T18:30:00Z"), new Date("2026-01-05T18:30:00Z"));
  });

  it("returns taken (no longer available) and never verifies the OTP when the business's hours no longer cover the slot", async () => {
    mockedReadSiteFacts.mockResolvedValue(facts({ hours: [] })); // closed every day now
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "taken", message: "That time is no longer available. Please pick another slot." });
    expect(mockedMarkOtpVerified).not.toHaveBeenCalled();
    expect(mockedBookSlot).not.toHaveBeenCalled();
  });

  it("returns taken (no longer available) when a closure now covers the payload's date", async () => {
    mockedReadSiteFacts.mockResolvedValue(facts({ closures: [{ id: "c1", startsOn: "2026-01-05", endsOn: "2026-01-05", note: "Emergency" }] }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "taken", message: "That time is no longer available. Please pick another slot." });
    expect(mockedMarkOtpVerified).not.toHaveBeenCalled();
  });

  it("returns taken (no longer available) when the slot itself no longer aligns to a since-changed slot length", async () => {
    mockedReadBookingContext.mockResolvedValue(
      context({ settings: { accepting: true, pausedMessage: null, slotMinutes: 45, minNoticeMinutes: 60, horizonDays: 28 } }),
    );
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "taken", message: "That time is no longer available. Please pick another slot." });
    expect(mockedMarkOtpVerified).not.toHaveBeenCalled();
  });

  it("skips the re-validation (and never calls readSiteFacts/listBusyIntervals) when the module is off, leaving bookSlot's own BookingClosedError path to answer", async () => {
    mockedReadBookingContext.mockResolvedValue(context({ enabled: false }));
    await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedReadSiteFacts).not.toHaveBeenCalled();
    expect(mockedListBusyIntervals).not.toHaveBeenCalled();
    // Still proceeds to verify and book -- bookSlot's own re-check (mocked to succeed here) is what would refuse it.
    expect(mockedMarkOtpVerified).toHaveBeenCalled();
  });

  it("returns unavailable, without verifying the OTP or booking, when the module is on but the business has no time zone", async () => {
    mockedReadBookingContext.mockResolvedValue(context({ timeZone: null }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "unavailable" });
    expect(mockedMarkOtpVerified).not.toHaveBeenCalled();
    expect(mockedBookSlot).not.toHaveBeenCalled();
  });

  it("still books normally when the re-validation finds the slot free (no regression on the happy path)", async () => {
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "booked", date: "2026-01-05", start: "16:00", end: "16:30", practitionerName: "Dr. Asha Rao" });
  });

  it("returns taken with the friendly message when bookSlot throws SlotTakenError", async () => {
    const { SlotTakenError } = await import("@firstfold/db");
    mockedBookSlot.mockRejectedValue(new SlotTakenError());
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "taken", message: TAKEN_MESSAGE });
    expect(TAKEN_MESSAGE).toBe("Someone just booked that slot. Please pick another.");
  });

  it("tells a patient who already has a booking at that time so, in its own words, not as a taken slot", async () => {
    const { PatientOverlapError } = await import("@firstfold/db");
    mockedBookSlot.mockRejectedValue(new PatientOverlapError());
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "taken", message: PATIENT_OVERLAP_MESSAGE });
    expect(PATIENT_OVERLAP_MESSAGE).toBe("You already have an appointment at that time. Please pick another time.");
  });

  it("returns taken with its own message when the slot's start time has already passed", async () => {
    // The payload's startsAt is 10:30Z; the OTP's own expiry is pushed later than that so the "still valid but
    // the slot already started" case can actually be reached (normally expiry -- 10 minutes -- lands well before
    // a slot's start, given the minimum notice a business requires).
    mockedFindBookingOtp.mockResolvedValue(otpRow({ expiresAt: new Date("2026-01-05T10:35:00Z") }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", new Date("2026-01-05T10:31:00Z"));
    expect(outcome).toEqual({ kind: "taken", message: "That time has passed. Please pick another slot." });
    expect(mockedMarkOtpVerified).not.toHaveBeenCalled();
    expect(mockedBookSlot).not.toHaveBeenCalled();
  });

  it("checks the slot's start time only after a matching code, not before", async () => {
    // A wrong code with a since-passed slot should still report wrong_code, not taken -- the time check only
    // runs once the code has actually matched.
    mockedFindBookingOtp.mockResolvedValue(otpRow({ expiresAt: new Date("2026-01-05T10:35:00Z") }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, "000000", "1.2.3.4", new Date("2026-01-05T10:31:00Z"));
    expect(outcome.kind).toBe("wrong_code");
  });

  it("maps BookingClosedError to unavailable when the module is off", async () => {
    const { BookingClosedError } = await import("@firstfold/db");
    mockedBookSlot.mockRejectedValue(new BookingClosedError());
    mockedReadBookingContext.mockResolvedValue(context({ enabled: false }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "unavailable" });
  });

  it("maps BookingClosedError to paused, with the business's message, when accepting is off", async () => {
    const { BookingClosedError } = await import("@firstfold/db");
    mockedBookSlot.mockRejectedValue(new BookingClosedError());
    mockedReadBookingContext.mockResolvedValue(
      context({ settings: { accepting: false, pausedMessage: "Back on Monday", slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 } }),
    );
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "paused", message: "Back on Monday" });
  });

  it("keeps proof of the notice the patient saw, against the patient who booked", async () => {
    mockedFindBookingOtp.mockResolvedValue(otpRow({ payload: { ...otpRow().payload, noticeVersion: "pre-dpdp" } }));
    vi.mocked(recordConsent).mockResolvedValue(undefined);
    expect(await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "203.0.113.9", NOW)).toMatchObject({ kind: "booked" });
    expect(recordConsent).toHaveBeenCalledWith({}, {
      subject: { type: "patient", ref: "0192f3c4-4444-7000-8000-000000000001" },
      purpose: "patient_booking",
      noticeVersion: "pre-dpdp",
      channel: "web",
    });
  });

  it("records no consent for a booking that carried no notice version", async () => {
    await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "203.0.113.9", NOW);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("still returns booked, and logs nothing about the patient, when the consent record cannot be written", async () => {
    mockedFindBookingOtp.mockResolvedValue(otpRow({ payload: { ...otpRow().payload, noticeVersion: "pre-dpdp" } }));
    vi.mocked(recordConsent).mockRejectedValue(new Error(`write failed for ${PHONE}`));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "203.0.113.9", NOW)).toMatchObject({ kind: "booked" });
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("consent record"), expect.anything());
    expect(JSON.stringify(logged.mock.calls)).not.toContain(PHONE);
    logged.mockRestore();
  });

  it("books the slot and returns booked on a matching code", async () => {
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "booked", date: "2026-01-05", start: "16:00", end: "16:30", practitionerName: "Dr. Asha Rao" });
    expect(mockedBookSlot).toHaveBeenCalledWith(
      {},
      BUSINESS_ID,
      expect.objectContaining({ patientName: "Asha Rao", phone: PHONE, localDate: "2026-01-05", localStart: "16:00", localEnd: "16:30" }),
    );
  });

  it("deletes the OTP row, scoped by its own id, once its slot is booked", async () => {
    await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedDeleteBookingOtp).toHaveBeenCalledTimes(1);
    expect(mockedDeleteBookingOtp).toHaveBeenCalledWith({}, OTP_ID);
    // Deleted only after bookSlot has actually returned, not before.
    expect(mockedBookSlot.mock.invocationCallOrder[0]).toBeLessThan(mockedDeleteBookingOtp.mock.invocationCallOrder[0] ?? Infinity);
  });

  it("still returns booked, and never logs patient data, when deleting the now-redundant OTP row fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedDeleteBookingOtp.mockRejectedValue(new Error('Failed query params: ["Asha Rao","+919876543210"]'));

    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);

    expect(outcome).toEqual({ kind: "booked", date: "2026-01-05", start: "16:00", end: "16:30", practitionerName: "Dr. Asha Rao" });
    for (const call of consoleError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("Asha Rao");
      expect(JSON.stringify(call)).not.toContain("+919876543210");
    }
    consoleError.mockRestore();
  });

  it("does not delete any OTP row when bookSlot throws (the OTP stays usable for retry/expiry as before)", async () => {
    const { SlotTakenError } = await import("@firstfold/db");
    mockedBookSlot.mockRejectedValue(new SlotTakenError());
    await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedDeleteBookingOtp).not.toHaveBeenCalled();
  });

  it("accepts a payload/appointment end of '24:00' without rejecting it", async () => {
    mockedFindBookingOtp.mockResolvedValue(
      otpRow({ payload: { ...otpRow().payload, end: "24:00", endsAt: "2026-01-06T00:00:00.000Z" } }),
    );
    mockedBookSlot.mockResolvedValue(
      appointment({
        id: "appt-2",
        localStart: "23:30",
        localEnd: "24:00",
        startsAt: new Date("2026-01-05T18:00:00Z"),
        endsAt: new Date("2026-01-06T00:00:00Z"),
      }),
    );
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "booked", date: "2026-01-05", start: "23:30", end: "24:00", practitionerName: "Dr. Asha Rao" });
  });

  it("offers bookSlot every doctor free for the slot when the patient chose any doctor", async () => {
    await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedBookSlot).toHaveBeenCalledWith({}, BUSINESS_ID, expect.objectContaining({ practitionerIds: [DOCTOR_A, DOCTOR_B] }));
  });

  it("leaves a doctor already booked then out of the candidates for any doctor", async () => {
    mockedListBusyIntervals.mockResolvedValue([busyAtSlot(DOCTOR_A)]);
    mockedBookSlot.mockResolvedValue(appointment({ practitionerId: DOCTOR_B }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedBookSlot).toHaveBeenCalledWith({}, BUSINESS_ID, expect.objectContaining({ practitionerIds: [DOCTOR_B] }));
    expect(outcome).toMatchObject({ kind: "booked", practitionerName: "Dr. Vikram Shah" });
  });

  it("books with the chosen doctor alone when they are still free", async () => {
    mockedFindBookingOtp.mockResolvedValue(otpRow({ payload: { ...otpRow().payload, practitionerId: DOCTOR_B } }));
    mockedListBusyIntervals.mockResolvedValue([busyAtSlot(DOCTOR_A)]);
    mockedBookSlot.mockResolvedValue(appointment({ practitionerId: DOCTOR_B }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedBookSlot).toHaveBeenCalledWith({}, BUSINESS_ID, expect.objectContaining({ practitionerIds: [DOCTOR_B] }));
    expect(outcome).toEqual({ kind: "booked", date: "2026-01-05", start: "16:00", end: "16:30", practitionerName: "Dr. Vikram Shah" });
  });

  it("returns taken, without verifying the OTP, when the chosen doctor has since been booked, even while another is free", async () => {
    mockedFindBookingOtp.mockResolvedValue(otpRow({ payload: { ...otpRow().payload, practitionerId: DOCTOR_A } }));
    mockedListBusyIntervals.mockResolvedValue([busyAtSlot(DOCTOR_A)]);
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "taken", message: TAKEN_MESSAGE });
    expect(mockedMarkOtpVerified).not.toHaveBeenCalled();
    expect(mockedBookSlot).not.toHaveBeenCalled();
  });

  it("returns taken (no longer available) when the chosen doctor has since been archived", async () => {
    mockedFindBookingOtp.mockResolvedValue(otpRow({ payload: { ...otpRow().payload, practitionerId: DOCTOR_A } }));
    mockedReadPractitionerSchedules.mockResolvedValue([doctor(DOCTOR_B, "Dr. Vikram Shah")]);
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "taken", message: "That time is no longer available. Please pick another slot." });
    expect(mockedBookSlot).not.toHaveBeenCalled();
  });

  it("reads an OTP written before doctors existed (no practitionerId key) as any doctor", async () => {
    // Spelled out rather than spread from otpRow(), so the key is genuinely absent, as in a row stored back then.
    const legacyPayload = {
      name: "Asha Rao",
      phone: PHONE,
      serviceId: null,
      serviceName: null,
      date: "2026-01-05",
      start: "16:00",
      end: "16:30",
      startsAt: "2026-01-05T10:30:00.000Z",
      endsAt: "2026-01-05T11:00:00.000Z",
    };
    mockedFindBookingOtp.mockResolvedValue(otpRow({ payload: legacyPayload }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(mockedBookSlot).toHaveBeenCalledWith({}, BUSINESS_ID, expect.objectContaining({ practitionerIds: [DOCTOR_A, DOCTOR_B] }));
    expect(outcome.kind).toBe("booked");
  });

  it("returns a null practitionerName when the booked doctor is not among the schedules read", async () => {
    mockedBookSlot.mockResolvedValue(appointment({ practitionerId: "33333333-3333-3333-3333-3333333333ff" }));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toMatchObject({ kind: "booked", practitionerName: null });
  });

  it("returns failed, without throwing, when a dependency rejects", async () => {
    mockedFindBookingOtp.mockRejectedValue(new Error("connection lost"));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "failed" });
  });

  it("returns failed, without throwing, when the BookingClosedError follow-up read itself fails", async () => {
    const { BookingClosedError } = await import("@firstfold/db");
    mockedBookSlot.mockRejectedValue(new BookingClosedError());
    mockedReadBookingContext.mockRejectedValue(new Error("connection lost"));
    const outcome = await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);
    expect(outcome).toEqual({ kind: "failed" });
  });

  it("never logs patient data when a dependency throws a params-carrying error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedBookSlot.mockRejectedValue(new Error('Failed query params: ["Asha Rao","+919876543210"]'));

    await confirmBookingOtp(BUSINESS_ID, OTP_ID, CODE, "1.2.3.4", NOW);

    for (const call of consoleError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("Asha Rao");
      expect(JSON.stringify(call)).not.toContain("+919876543210");
    }
    consoleError.mockRestore();
  });
});
