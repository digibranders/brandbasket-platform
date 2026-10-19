import "server-only";
import {
  bookSlot,
  BookingClosedError,
  claimOtpAttempt,
  consumeRateLimit,
  deleteBookingOtp,
  findBookingOtp,
  markOtpVerified,
  readBookingContext,
  readSiteFacts,
  recordConsent,
  PatientOverlapError,
  SlotTakenError,
  type BookingOtpPayload,
  type Database,
  type NewAppointment,
} from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { addDays, zonedTimeToUtc } from "@brandbasket/shared/lib/calendar/local-date";
import { OTP_MAX_ATTEMPTS } from "@brandbasket/shared/lib/appointments/otp";
import { DEFAULT_PAUSED_MESSAGE } from "./availability";
import { loggableBookingError } from "./booking-log";
import { getStaffDb } from "./db";
import { loadClinicCalendars } from "./clinic-calendars";
import { accountCodeSecret, emailCodeBypassed } from "./env";
import { ipRateLimitKey } from "./ip-key";
import { otpCodeMatches } from "./otp-crypto";
import { resolveRequestedSlot } from "./slot-check";

/**
 * The write side of `POST /api/site/bookings/confirm`: rate limits by caller address, loads the pending OTP
 * (scoped to the site token's own business -- an OTP created under one business's token can never be confirmed
 * through another's), atomically claims an attempt, verifies the code, re-validates the slot against the
 * business's current hours/closures/window (see resolveRequestedSlot, shared with the OTP-request step), marks it
 * verified, then books the slot. `bookSlot` (packages/db) re-checks the module/paused state itself, inside its
 * advisory lock, so this needs no separate pre-check of its own for that -- only to translate the
 * `BookingClosedError` it can throw into the right response. Runs against the staff connection (see the
 * sanctioned-exceptions comment on `getStaffDb` in `./db.ts`).
 */

/** Not scoped to a business, unlike the OTP-request rate limits: confirming an OTP needs no businessId until the
 * OTP row itself is loaded, and this budget exists only to slow down code-guessing traffic from one address. */
const IP_RULE = { limit: 30, windowSeconds: 60 * 60 };

const NO_TRIES_LEFT_MESSAGE = "No tries left. Send a new code.";
const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Send a new code.";
export const TAKEN_MESSAGE = "Someone just booked that slot. Please pick another.";
const SLOT_STARTED_MESSAGE = "That time has passed. Please pick another slot.";
const SLOT_NO_LONGER_AVAILABLE_MESSAGE = "That time is no longer available. Please pick another slot.";

export type BookingConfirmOutcome =
  | {
      readonly kind: "booked";
      readonly date: string;
      readonly start: string;
      readonly end: string;
      /** The doctor bookSlot picked, read from the schedules loaded for the re-validation; null if not among them. */
      readonly practitionerName: string | null;
    }
  | { readonly kind: "expired" }
  | { readonly kind: "too_many_attempts"; readonly message: string }
  | { readonly kind: "wrong_code"; readonly message: string }
  | { readonly kind: "taken"; readonly message: string }
  | { readonly kind: "unavailable" }
  | { readonly kind: "paused"; readonly message: string }
  | { readonly kind: "limited" }
  | { readonly kind: "failed" };

/** "1 try left" / "2 tries left", so the message never reads "1 tries left". */
/**
 * Keeps proof of the patient notice the booking page showed (DPDP Act s.5, r.3), against the patient who booked, for the
 * clinic that must be able to show it. Nothing for a booking that carried no notice version, or whose patient has since
 * been erased. The booking is already made, so a failure is logged (never with the patient's details) and never undoes it.
 */
async function keepNoticeProof(db: Database, patientId: string | null, noticeVersion: string | undefined): Promise<void> {
  if (patientId === null || noticeVersion === undefined) return;
  try {
    await recordConsent(db, { subject: { type: "patient", ref: patientId }, purpose: "patient_booking", noticeVersion, channel: "web" });
  } catch (error) {
    console.error("A booking's consent record could not be written.", errorLogInfo(error));
  }
}

function wrongCodeMessage(triesLeft: number): string {
  return `That code isn't right. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`;
}

/** `practitionerIds` are bookSlot's candidates: the doctors the re-validation found free for this slot. */
function newAppointmentFrom(payload: BookingOtpPayload, practitionerIds: readonly string[]): NewAppointment {
  return {
    patientName: payload.name,
    phone: payload.phone,
    serviceId: payload.serviceId,
    serviceName: payload.serviceName,
    localDate: payload.date,
    localStart: payload.start,
    localEnd: payload.end,
    startsAt: new Date(payload.startsAt),
    endsAt: new Date(payload.endsAt),
    practitionerIds,
  };
}

/** Disambiguates a `BookingClosedError` from `bookSlot` (which only means "module off or not accepting", not
 * which) into the two responses the endpoint contract distinguishes, by reading the current state back. Since
 * `bookSlot` already re-checked atomically inside its lock, this read is only for the response's wording -- it
 * cannot itself race the booking decision. Falls back to `unavailable` if even that read can't tell (context
 * gone entirely), which is the more conservative of the two messages. */
async function describeBookingClosed(businessId: string): Promise<{ readonly kind: "unavailable" } | { readonly kind: "paused"; readonly message: string }> {
  const db = getStaffDb();
  const context = await readBookingContext(db, businessId);
  if (context.enabled && context.timeZone !== null && context.settings !== null && !context.settings.accepting) {
    return { kind: "paused", message: context.settings.pausedMessage ?? DEFAULT_PAUSED_MESSAGE };
  }
  return { kind: "unavailable" };
}

/**
 * Confirms a pending booking OTP for `businessId` (the site token's own business -- see the module doc comment).
 * `otpId` need not already be validated as a uuid: `findBookingOtp` treats a non-uuid the same as "not found",
 * which this maps onto `expired` like any other missing row.
 */
export async function confirmBookingOtp(businessId: string, otpId: string, code: string, clientIp: string, now: Date): Promise<BookingConfirmOutcome> {
  try {
    // Resolved first, before the rate limit is even spent: a misconfigured secret must fail immediately, not
    // after the request has already cost the caller part of a rate-limit budget it can never get back.
    const secret = accountCodeSecret();

    const db = getStaffDb();

    const rateLimit = await consumeRateLimit(db, `otp-confirm:ip:${ipRateLimitKey(clientIp)}`, IP_RULE, now);
    if (!rateLimit.allowed) return { kind: "limited" };

    const otp = await findBookingOtp(db, { otpId, businessId });
    if (otp === null) return { kind: "expired" };
    if (otp.verifiedAt !== null || otp.expiresAt.getTime() <= now.getTime()) return { kind: "expired" };
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return { kind: "too_many_attempts", message: TOO_MANY_ATTEMPTS_MESSAGE };

    // Claims the attempt (and so its slot in the maxAttempts budget) atomically, before the code is even compared:
    // comparing first and incrementing after would let two requests racing the same OTP both read "one try left"
    // and both check a code they were never entitled to.
    const claim = await claimOtpAttempt(db, { otpId, businessId, maxAttempts: OTP_MAX_ATTEMPTS, now });
    if (claim === null) {
      // Lost a race since the load above: re-read to tell an expiry from an attempts ceiling reached meanwhile.
      const fresh = await findBookingOtp(db, { otpId, businessId });
      if (fresh === null || fresh.verifiedAt !== null || fresh.expiresAt.getTime() <= now.getTime()) return { kind: "expired" };
      return { kind: "too_many_attempts", message: TOO_MANY_ATTEMPTS_MESSAGE };
    }

    // Salted with the OTP's own id (see hashOtpCode's doc comment): requestBookingOtp generates it up front and
    // hands it to createBookingOtp as an explicit id, precisely so it is available here, unchanged, via otp.id.
    // With the local bypass on (see emailCodeBypassed), any 6-digit code matches: the code was still emailed (to the
    // outbox), but the address is not proven. The attempt was still claimed above, so the attempts ceiling and expiry
    // keep applying.
    const matches = emailCodeBypassed() || otpCodeMatches(otp.codeHash, otp.id, code, secret);
    if (!matches) {
      const triesLeft = Math.max(OTP_MAX_ATTEMPTS - claim.attempts, 0);
      if (triesLeft === 0) return { kind: "too_many_attempts", message: NO_TRIES_LEFT_MESSAGE };
      return { kind: "wrong_code", message: wrongCodeMessage(triesLeft) };
    }

    // The slot itself may have started (and so can no longer be booked) while the OTP sat unconfirmed -- checked
    // before spending the one-time verification below, so a stale confirm reads as "that slot is gone" rather
    // than silently verifying an OTP whose booking can never succeed.
    if (new Date(otp.payload.startsAt).getTime() <= now.getTime()) {
      return { kind: "taken", message: SLOT_STARTED_MESSAGE };
    }

    // Re-runs the same hours/closures/leave/window rules the OTP step itself used (resolveRequestedSlot, shared with
    // requestBookingOtp), for the payload's own date/start and doctor -- hours can be shortened, a closure or leave
    // added, the chosen doctor archived or booked, or the booking window shrunk in the minutes between that request
    // and this confirm, and none of that is caught by bookSlot's own re-check below (module/accepting plus a plain
    // overlap check only). Its free doctors become bookSlot's candidates: the chosen one alone, or every doctor free
    // then for "any". An OTP written before doctors existed has no practitionerId key and reads as any doctor.
    //
    // Skipped when the context itself can't answer the question (module off, or never fully set up), leaving no
    // candidates: bookSlot checks module/accepting before candidates, so its BookingClosedError path still gives the
    // right unavailable/paused response, and duplicating that here would only risk the two disagreeing. The one
    // exception is a switched-on, set-up module whose business has no time zone: bookSlot does not look at the
    // time zone, so with no candidates it would report "taken" for what is really a clinic that cannot take
    // bookings at all -- answered here as unavailable, before the OTP is spent.
    const chosenPractitionerId = otp.payload.practitionerId ?? null;
    let candidateIds: readonly string[] = [];
    let practitionerNames = new Map<string, string>();
    const context = await readBookingContext(db, businessId);
    if (context.enabled && context.settings !== null && context.timeZone === null) return { kind: "unavailable" };
    if (context.enabled && context.timeZone !== null && context.settings !== null) {
      const timeZone = context.timeZone;
      const facts = await readSiteFacts(db, businessId);
      const { practitioners, calendars } = await loadClinicCalendars(db, businessId, {
        clinicHours: facts.hours,
        timeZone,
        fromUtc: zonedTimeToUtc(otp.payload.date, "00:00", timeZone),
        toUtc: zonedTimeToUtc(addDays(otp.payload.date, 1), "00:00", timeZone),
        onlyPractitionerId: chosenPractitionerId,
      });
      practitionerNames = new Map(practitioners.map((practitioner) => [practitioner.id, practitioner.name]));
      const resolved = resolveRequestedSlot(context, facts, calendars, otp.payload.date, otp.payload.start, now);
      // Taken means someone (with the chosen doctor, or with every doctor) has booked it since; anything else --
      // gone from the grid, or past -- means the slot itself is no longer on offer.
      if (resolved?.slot.state === "taken") return { kind: "taken", message: TAKEN_MESSAGE };
      if (resolved === null || resolved.slot.state !== "free" || resolved.freePractitionerIds.length === 0) {
        return { kind: "taken", message: SLOT_NO_LONGER_AVAILABLE_MESSAGE };
      }
      candidateIds = resolved.freePractitionerIds;
    }

    const verified = await markOtpVerified(db, { otpId, businessId, maxAttempts: OTP_MAX_ATTEMPTS, now });
    if (!verified) return { kind: "expired" }; // lost a race with another confirm, or expired between claim and here

    try {
      const appointment = await bookSlot(db, businessId, newAppointmentFrom(otp.payload, candidateIds));
      await keepNoticeProof(db, appointment.patientId, otp.payload.noticeVersion);
      try {
        // The OTP row (patient email, phone, and the code hash) is redundant once its slot is booked -- the
        // appointment itself is now the record. Its own try/catch: a cleanup failure must never turn a booking
        // that already succeeded into a failed response, so it is only ever logged, in the same safe shape as
        // every other unexpected error here (never otp.payload, which carries the patient data).
        await deleteBookingOtp(db, otp.id);
      } catch (cleanupError) {
        console.error("Could not delete a booking OTP after booking its slot.", loggableBookingError(businessId, cleanupError));
      }
      return {
        kind: "booked",
        date: appointment.localDate,
        start: appointment.localStart,
        end: appointment.localEnd,
        practitionerName: practitionerNames.get(appointment.practitionerId) ?? null,
      };
    } catch (error) {
      if (error instanceof SlotTakenError) return { kind: "taken", message: TAKEN_MESSAGE };
      // Worded as any other slot that is no longer on offer, never as "you already have a booking": the phone number
      // given is the clinic's to call, not proved, so anyone who knew a name and a number could otherwise find out
      // whether that person has a booking at a given time by proving an address of their own.
      if (error instanceof PatientOverlapError) return { kind: "taken", message: SLOT_NO_LONGER_AVAILABLE_MESSAGE };
      // Awaited (not just returned) so a failure in this follow-up read is caught by the outer try/catch below,
      // same as every other dependency call here, instead of rejecting confirmBookingOtp's own promise.
      if (error instanceof BookingClosedError) return await describeBookingClosed(businessId);
      throw error;
    }
  } catch (error) {
    console.error("Could not confirm a booking OTP.", loggableBookingError(businessId, error));
    return { kind: "failed" };
  }
}
