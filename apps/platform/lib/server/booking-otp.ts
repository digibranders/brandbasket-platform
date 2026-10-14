import "server-only";
import { randomUUID } from "node:crypto";
import {
  consumeRateLimit,
  createBookingOtp,
  deleteBookingOtp,
  purgeExpiredBookingData,
  readBookingContext,
  readSiteFacts,
  type BookingOtpPayload,
} from "@firstfold/db";
import { addDays, zonedTimeToUtc } from "@firstfold/shared/lib/calendar/local-date";
import type { BookingInput } from "@firstfold/shared/lib/appointments/booking-form";
import { phoneHint as toPhoneHint } from "@firstfold/shared/lib/appointments/booking-form";
import { OTP_TTL_SECONDS } from "@firstfold/shared/lib/appointments/otp";
import { DEFAULT_PAUSED_MESSAGE } from "./availability";
import { loggableBookingError } from "./booking-log";
import { getStaffDb } from "./db";
import { loadClinicCalendars } from "./clinic-calendars";
import { bookingOtpBypassed, bookingOtpSecret, smsAllowedCountryCodes } from "./env";
import { ipRateLimitKey } from "./ip-key";
import { generateOtpCode, hashOtpCode } from "./otp-crypto";
import { disallowedPhoneMessage, isPhoneCountryAllowed } from "./sms-country-guard";
import { createSmsSender, otpMessage, SmsProviderUnavailableError } from "./sms";
import { resolveRequestedSlot } from "./slot-check";

/**
 * The write side of `POST /api/site/bookings/otp`: checks whether the requested slot can be booked at all, guards
 * against SMS pumping, rate limits, creates the pending OTP and sends it by SMS. Runs against the staff
 * connection (see the sanctioned-exceptions comment on `getStaffDb` in `./db.ts`): the public role can't read
 * module settings, services, opening hours or existing appointments, all of which this decision needs before it
 * writes anything.
 */

const ONE_MINUTE_SECONDS = 60;
const ONE_HOUR_SECONDS = 60 * ONE_MINUTE_SECONDS;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

/** Per visitor address, scoped to the business: one clinic's flood of traffic never spends another's budget. */
const IP_RULE = { limit: 10, windowSeconds: ONE_HOUR_SECONDS };
/** Per phone number, scoped to the business: two separate budgets (short-burst and daily), each under its own key
 * -- consumeRateLimit deletes windows older than the current one for a key on every call, so sharing one key
 * between two rules with different window lengths would let the shorter-window rule silently wipe the longer
 * one's counter. The daily rule alone can't be flooded by rotating IPs, and the short rule alone can't silently
 * exhaust the whole day's allowance in one burst. */
const PHONE_SHORT_RULE = { limit: 3, windowSeconds: 10 * ONE_MINUTE_SECONDS };
const PHONE_DAY_RULE = { limit: 8, windowSeconds: ONE_DAY_SECONDS };
/** Per phone number, across every business: the per-business daily rule above resets for each clinic the same
 * number ever books through, so this is the backstop that actually caps one phone number's total OTP volume for
 * the day regardless of how many different businesses it is aimed at. Generous relative to a single business's
 * budget, since a patient legitimately booking with several clinics in one day must not be blocked by it. */
const PHONE_GLOBAL_DAY_RULE = { limit: 10, windowSeconds: ONE_DAY_SECONDS };
/** The budget across the whole business: generous, since a busy clinic should never be blocked by its own traffic. */
const BUSINESS_RULE = { limit: 300, windowSeconds: ONE_DAY_SECONDS };

const SERVICE_MESSAGE = "Choose a service from the list.";
const SLOT_MESSAGE = "Choose an available time.";
const PRACTITIONER_MESSAGE = "Choose a doctor from the list.";

export type BookingOtpOutcome =
  | { readonly kind: "otp_sent"; readonly otpId: string; readonly expiresInSeconds: number; readonly phoneHint: string }
  | { readonly kind: "unavailable" }
  | { readonly kind: "paused"; readonly message: string }
  | { readonly kind: "invalid"; readonly field: string; readonly message: string }
  | { readonly kind: "taken" }
  | { readonly kind: "limited" }
  | { readonly kind: "failed" };

/** Requests a booking OTP for `input` against `businessId`. Checks,
 * in order: the OTP secret and SMS provider are configured -- in production, the local outbox does not count as
 * configured (unavailable, see `SmsProviderUnavailableError`); the module is on and accepting (unavailable/paused);
 * the service, if one was requested, exists (invalid); the doctor, if one was picked, is an active practitioner
 * (invalid); the slot exists in that day's generated slots and is free -- with the picked doctor, or with any doctor
 * when none was picked (invalid when past/outside the window/misaligned, taken when someone else holds it); the
 * phone's country is on the SMS-pumping allow-list (invalid); the rate limits, narrowest first (limited); then
 * creates the OTP and sends it by SMS. */
export async function requestBookingOtp(
  businessId: string,
  input: BookingInput,
  clientIp: string,
  now: Date,
): Promise<BookingOtpOutcome> {
  try {
    // Resolved first, before any DB read or rate limit is spent: a misconfigured secret or SMS provider must fail
    // immediately, not after the request has already cost the caller (and the business) part of a rate-limit
    // budget it can never get back.
    const secret = bookingOtpSecret();

    // With the bypass on (see bookingOtpBypassed), nothing is sent, so no SMS provider is needed -- not even in
    // production, where the local outbox is otherwise refused.
    const bypassed = bookingOtpBypassed();
    let smsSender: ReturnType<typeof createSmsSender> | null = null;
    try {
      if (!bypassed) smsSender = createSmsSender();
    } catch (error) {
      if (!(error instanceof SmsProviderUnavailableError)) throw error;
      // A deployment configuration problem, not a transient one -- reported as "unavailable" (403) rather than
      // "failed" (500) so it reads the same as the module being off, and logged with no patient data (the error
      // itself carries none; nothing else about this request is attached to the log line).
      console.error("Booking OTP requested but SMS is not configured for production.", { businessId });
      return { kind: "unavailable" };
    }

    const db = getStaffDb();

    // Opportunistic housekeeping, not a scheduled job (see purgeExpiredBookingData's doc comment for why): fired
    // alongside this request's own reads rather than awaited, so a slow or failing purge never adds latency to,
    // or fails, the visitor's own OTP request. Deleting old OTP/SMS rows a request cycle late is harmless.
    purgeExpiredBookingData(db, now).catch((error: unknown) => {
      console.error("Could not purge expired booking data.", loggableBookingError(businessId, error));
    });

    const [context, facts] = await Promise.all([readBookingContext(db, businessId), readSiteFacts(db, businessId)]);

    if (!context.enabled || context.timeZone === null || context.settings === null) {
      return { kind: "unavailable" };
    }
    if (!context.settings.accepting) {
      return { kind: "paused", message: context.settings.pausedMessage ?? DEFAULT_PAUSED_MESSAGE };
    }

    let serviceName: string | null = null;
    if (input.serviceId !== null) {
      const service = context.services.find((candidate) => candidate.id === input.serviceId);
      if (service === undefined) {
        return { kind: "invalid", field: "serviceId", message: SERVICE_MESSAGE };
      }
      serviceName = service.name;
    }

    const timeZone = context.timeZone;
    const { practitioners, calendars } = await loadClinicCalendars(db, businessId, {
      clinicHours: facts.hours,
      timeZone,
      fromUtc: zonedTimeToUtc(input.date, "00:00", timeZone),
      toUtc: zonedTimeToUtc(addDays(input.date, 1), "00:00", timeZone),
      onlyPractitionerId: input.practitionerId,
    });
    // parseBookingFields only checked the id's shape; an archived doctor, or another clinic's, is refused here
    // rather than read as "no free time", so a client site with a stale doctor list gets a message it can act on.
    if (input.practitionerId !== null && !practitioners.some((practitioner) => practitioner.id === input.practitionerId)) {
      return { kind: "invalid", field: "practitionerId", message: PRACTITIONER_MESSAGE };
    }

    const resolved = resolveRequestedSlot(context, facts, calendars, input.date, input.start, now);
    if (resolved === null || resolved.slot.state === "past") {
      return { kind: "invalid", field: "start", message: SLOT_MESSAGE };
    }
    if (resolved.slot.state === "taken") {
      return { kind: "taken" };
    }
    const { slot } = resolved;

    // The anti SMS-pumping (toll fraud) guard: refuses a destination outside the allow-list before any rate
    // limit is spent, since pumping abuses cheap-to-request traffic rather than any single budget.
    const allowedCountryCodes = smsAllowedCountryCodes();
    if (!isPhoneCountryAllowed(input.phone, allowedCountryCodes)) {
      return { kind: "invalid", field: "phone", message: disallowedPhoneMessage(allowedCountryCodes) };
    }

    // Narrowest budget first: an abusive single IP is stopped before it can spend the shared per-phone or
    // per-business allowance on anyone else's behalf. The two per-business phone rules use distinct keys (see
    // PHONE_SHORT_RULE's doc comment) even though they share a phone number and business, and the global phone
    // rule is keyed on the phone alone, with no businessId, since it is meant to catch the same number spread
    // across many businesses.
    for (const check of [
      { key: `otp:ip:${businessId}:${ipRateLimitKey(clientIp)}`, rule: IP_RULE },
      { key: `otp:phone:10m:${businessId}:${input.phone}`, rule: PHONE_SHORT_RULE },
      { key: `otp:phone:day:${businessId}:${input.phone}`, rule: PHONE_DAY_RULE },
      { key: `otp:phone:any:${input.phone}`, rule: PHONE_GLOBAL_DAY_RULE },
      { key: `otp:business:${businessId}`, rule: BUSINESS_RULE },
    ]) {
      const result = await consumeRateLimit(db, check.key, check.rule, now);
      if (!result.allowed) return { kind: "limited" };
    }

    // zonedTimeToUtc's minutesOfDay accepts "24:00" as end-of-day, so a slot ending exactly at midnight (an "open
    // all day" or midnight-closing range) converts correctly without special-casing it here.
    const startsAt = zonedTimeToUtc(input.date, input.start, timeZone);
    const endsAt = zonedTimeToUtc(input.date, slot.end, timeZone);
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

    // Generated here, in application code, rather than left to the OTP row's own default: the code's hash must be
    // salted with this id (see hashOtpCode's doc comment), so the id has to exist before the insert that writes
    // that hash, not after it.
    const otpId = randomUUID();
    const code = generateOtpCode();
    const codeHash = hashOtpCode(otpId, code, secret);

    const payload: BookingOtpPayload = {
      name: input.name,
      phone: input.phone,
      serviceId: input.serviceId,
      serviceName,
      date: input.date,
      start: input.start,
      end: slot.end,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      // Only the patient's choice, never a doctor picked now: who is free can change before the code is confirmed,
      // so confirmBookingOtp picks among whoever is free then.
      practitionerId: input.practitionerId,
      ...(input.noticeVersion === undefined ? {} : { noticeVersion: input.noticeVersion }),
    };

    await createBookingOtp(db, { id: otpId, businessId, phone: input.phone, codeHash, payload, expiresAt });

    try {
      if (smsSender === null) {
        console.warn("Booking OTP bypass is on: no code was sent and any 6-digit code will confirm.", { businessId });
      } else {
        await smsSender.send({ to: input.phone, body: otpMessage(code), businessId });
      }
    } catch (sendError) {
      await deleteBookingOtp(db, otpId);
      console.error("Could not send a booking OTP.", loggableBookingError(businessId, sendError));
      return { kind: "failed" };
    }

    return { kind: "otp_sent", otpId, expiresInSeconds: OTP_TTL_SECONDS, phoneHint: toPhoneHint(input.phone) };
  } catch (error) {
    console.error("Could not request a booking OTP.", loggableBookingError(businessId, error));
    return { kind: "failed" };
  }
}
