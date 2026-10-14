import "server-only";
import { randomUUID } from "node:crypto";
import {
  claimPrivacyRequestOtpAttempt,
  consumeRateLimit,
  createPrivacyRequestOtp,
  deleteContributionForProvenNumber,
  deletePrivacyRequestOtp,
  findPrivacyRequestOtp,
  listOwnDirectoryContributions,
  purgeExpiredPrivacyRequestOtps,
  receiveVerifiedPrivacyRequest,
  type DirectoryContributionTarget,
  type OwnDirectoryContributions,
  type PrivacyRequestOtpPayload,
  type RateLimitRule,
} from "@firstfold/db";
import { phoneHint as toPhoneHint } from "@firstfold/shared/lib/appointments/booking-form";
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "@firstfold/shared/lib/appointments/otp";
import { requestDeadlines, requestDeadlinesFor } from "@firstfold/shared/lib/privacy-request-deadlines";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";
import { getStaffDb } from "./db";
import { bookingOtpBypassed, bookingOtpSecret, smsAllowedCountryCodes } from "./env";
import { ipRateLimitKey } from "./ip-key";
import { generateOtpCode, hashOtpCode, otpCodeMatches } from "./otp-crypto";
import type { PrivacyRequestInput } from "./privacy-request-fields";
import { notifyNewPrivacyRequest } from "./privacy-request-notify";
import { disallowedPhoneMessage, isPhoneCountryAllowed } from "./sms-country-guard";
import { createSmsSender, otpMessage, SmsProviderUnavailableError } from "./sms";
import { scheduleWebsiteRefresh } from "./website-refresh";

/**
 * The work behind `POST /api/privacy-requests/otp`, `/contribution` and `/confirm`: a rights request or grievance made on the
 * website's public form, or a visitor deleting one of their reviews or comments. The code texted to the number given proves
 * the person controls it; only then is the request carried out or filed in the tracker, with its identity check stamped and
 * a reference to quote. Stored on the staff connection (see `getStaffDb`'s sanctioned exceptions), for the Grievance Officer
 * to read in the console. Nothing is filed for a code that is never confirmed.
 */

const ONE_MINUTE_SECONDS = 60;
const ONE_HOUR_SECONDS = 60 * ONE_MINUTE_SECONDS;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

/** Each code is a paid SMS, so the budgets are tight: a person has no reason to ask for more than a few. */
const IP_RULE: RateLimitRule = { limit: 5, windowSeconds: ONE_HOUR_SECONDS };
const PHONE_SHORT_RULE: RateLimitRule = { limit: 3, windowSeconds: 10 * ONE_MINUTE_SECONDS };
const PHONE_DAY_RULE: RateLimitRule = { limit: 6, windowSeconds: ONE_DAY_SECONDS };
const ALL_DAY_RULE: RateLimitRule = { limit: 300, windowSeconds: ONE_DAY_SECONDS };
const CONFIRM_IP_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_HOUR_SECONDS };

const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Ask for a new code.";
const NO_TRIES_LEFT_MESSAGE = "No tries left. Ask for a new code.";

export type PrivacyRequestOtpOutcome =
  | { readonly kind: "otp_sent"; readonly otpId: string; readonly expiresInSeconds: number; readonly phoneHint: string }
  | { readonly kind: "invalid"; readonly field: "phone"; readonly message: string }
  | { readonly kind: "unavailable" }
  | { readonly kind: "limited" }
  | { readonly kind: "failed" };

export type PrivacyRequestConfirmOutcome =
  | { readonly kind: "received"; readonly reference: string; readonly dueAt: Date }
  | { readonly kind: "erased"; readonly reference: string; readonly reviews: number; readonly comments: number; readonly enquiries: number }
  | { readonly kind: "deleted"; readonly reference: string }
  /** A deletion code for a review or comment the number did not post, or one already gone: nothing was done or filed. */
  | { readonly kind: "not_found" }
  | { readonly kind: "expired" }
  | { readonly kind: "too_many_attempts"; readonly message: string }
  | { readonly kind: "wrong_code"; readonly message: string }
  | { readonly kind: "limited" }
  | { readonly kind: "failed" };

/** Who is asking to delete one of their reviews or comments: a visitor the website already recognises, or a number to text. */
export type ContributionDeletionRequester = { readonly kind: "visitor"; readonly phone: string } | { readonly kind: "number"; readonly phone: string };

export interface ContributionDeletionInput {
  readonly target: DirectoryContributionTarget;
  readonly requester: ContributionDeletionRequester;
  readonly noticeVersion: string | null;
}

export type ContributionDeletionOutcome =
  | PrivacyRequestOtpOutcome
  | { readonly kind: "deleted"; readonly reference: string }
  | { readonly kind: "not_found" };

/** Texts a code to the number on a request from the public form. See `sendRequestCode`. */
export function requestPrivacyRequestOtp(input: PrivacyRequestInput, clientIp: string, now: Date): Promise<PrivacyRequestOtpOutcome> {
  return sendRequestCode(input.phone, { kind: input.kind, name: input.name, details: input.details, noticeVersion: input.noticeVersion }, clientIp, now);
}

/**
 * A visitor deleting one of their own reviews or comments (DPDP Act s.12(3), s.6(4)). A visitor the website already
 * recognises has proven their number before, so it is deleted at once. Anyone else is texted a code first, and the deletion
 * happens when it is confirmed (`confirmPrivacyRequestOtp`). Either way, only a review or comment posted with that number is
 * deleted, and the answer for anything else is the same `not_found`, so an id never reveals whose number posted it.
 */
export async function requestContributionDeletion(input: ContributionDeletionInput, clientIp: string, now: Date): Promise<ContributionDeletionOutcome> {
  if (input.requester.kind === "number") {
    return sendRequestCode(
      input.requester.phone,
      { kind: "contribution_deletion", name: null, details: null, noticeVersion: input.noticeVersion, target: input.target },
      clientIp,
      now,
    );
  }
  const phone = input.requester.phone;
  try {
    const db = getStaffDb();
    const deleted = await db.transaction((tx) => deleteContributionForProvenNumber(tx, { phone, target: input.target, now, dueAt: requestDeadlines(now).dueAt }));
    if (deleted === null) return { kind: "not_found" };
    scheduleWebsiteRefresh(deleted.business);
    return { kind: "deleted", reference: deleted.reference };
  } catch (error) {
    console.error("Could not delete a visitor's review or comment.", { kind: input.target.kind, id: input.target.id, ...errorLogInfo(error) });
    return { kind: "failed" };
  }
}

export type OwnContributionsOutcome = ({ readonly kind: "ok" } & OwnDirectoryContributions) | { readonly kind: "failed" };

/** Which of `reviewIds`, and which comments on them, the visitor whose number is `phone` wrote. */
export async function listOwnContributions(phone: string, reviewIds: readonly string[]): Promise<OwnContributionsOutcome> {
  try {
    return { kind: "ok", ...(await listOwnDirectoryContributions(getStaffDb(), { phone, reviewIds })) };
  } catch (error) {
    console.error("Could not list a visitor's own reviews and comments.", errorLogInfo(error));
    return { kind: "failed" };
  }
}

/**
 * Texts a code to `phone`, after the country guard (SMS pumping) and the rate limits, narrowest first. The request waits,
 * hashed code and all, until the code is confirmed. With BOOKING_OTP_BYPASS on, nothing is sent.
 */
async function sendRequestCode(phone: string, payload: PrivacyRequestOtpPayload, clientIp: string, now: Date): Promise<PrivacyRequestOtpOutcome> {
  try {
    // Before any rate limit is spent: a misconfiguration must fail at once, not after costing the person a try.
    const secret = bookingOtpSecret();
    const bypassed = bookingOtpBypassed();
    let smsSender: ReturnType<typeof createSmsSender> | null = null;
    try {
      if (!bypassed) smsSender = createSmsSender();
    } catch (error) {
      if (!(error instanceof SmsProviderUnavailableError)) throw error;
      console.error("A privacy request code was requested but SMS is not configured for production.");
      return { kind: "unavailable" };
    }

    const allowedCountryCodes = smsAllowedCountryCodes();
    if (!isPhoneCountryAllowed(phone, allowedCountryCodes)) {
      return { kind: "invalid", field: "phone", message: disallowedPhoneMessage(allowedCountryCodes) };
    }

    const db = getStaffDb();
    // Opportunistic housekeeping, not awaited: it never slows or fails this request.
    purgeExpiredPrivacyRequestOtps(db, now).catch((error: unknown) => {
      console.error("Could not purge expired privacy request codes.", errorLogInfo(error));
    });

    for (const check of [
      { key: `privacy-otp:ip:${ipRateLimitKey(clientIp)}`, rule: IP_RULE },
      { key: `privacy-otp:phone:10m:${phone}`, rule: PHONE_SHORT_RULE },
      { key: `privacy-otp:phone:day:${phone}`, rule: PHONE_DAY_RULE },
      { key: "privacy-otp:all", rule: ALL_DAY_RULE },
    ]) {
      const result = await consumeRateLimit(db, check.key, check.rule, now);
      if (!result.allowed) return { kind: "limited" };
    }

    // The id salts the code's hash (see hashOtpCode), so it is made here rather than by the insert.
    const otpId = randomUUID();
    const code = generateOtpCode();
    await createPrivacyRequestOtp(db, {
      id: otpId,
      phone,
      codeHash: hashOtpCode(otpId, code, secret),
      payload,
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    });

    try {
      if (smsSender === null) {
        console.warn("Booking OTP bypass is on: no privacy request code was sent and any 6-digit code will confirm.");
      } else {
        await smsSender.send({ to: phone, body: otpMessage(code, "website"), businessId: null });
      }
    } catch (sendError) {
      await deletePrivacyRequestOtp(db, otpId);
      console.error("Could not send a privacy request code.", errorLogInfo(sendError));
      return { kind: "failed" };
    }

    return { kind: "otp_sent", otpId, expiresInSeconds: OTP_TTL_SECONDS, phoneHint: toPhoneHint(phone) };
  } catch (error) {
    // Never the error's message: a failed insert's parameters (name, number, details) would be in it.
    console.error("Could not request a privacy request code.", errorLogInfo(error));
    return { kind: "failed" };
  }
}

function wrongCodeMessage(triesLeft: number): string {
  return `That code is not right. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`;
}

/**
 * Checks the code and files the request it was holding. An attempt is claimed before the code is compared, so the ceiling
 * holds however many confirms race. The due date counts from this moment: the day the person proved the number is the day
 * the request is received.
 */
export async function confirmPrivacyRequestOtp(otpId: string, code: string, clientIp: string, now: Date): Promise<PrivacyRequestConfirmOutcome> {
  try {
    const secret = bookingOtpSecret();
    const db = getStaffDb();

    const rateLimit = await consumeRateLimit(db, `privacy-confirm:ip:${ipRateLimitKey(clientIp)}`, CONFIRM_IP_RULE, now);
    if (!rateLimit.allowed) return { kind: "limited" };

    const otp = await findPrivacyRequestOtp(db, otpId);
    if (otp === null || otp.verifiedAt !== null || otp.expiresAt.getTime() <= now.getTime()) return { kind: "expired" };
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return { kind: "too_many_attempts", message: TOO_MANY_ATTEMPTS_MESSAGE };

    const claim = await claimPrivacyRequestOtpAttempt(db, { otpId, maxAttempts: OTP_MAX_ATTEMPTS, now });
    if (claim === null) {
      // Lost a race since the read above: tell an expiry from an attempt ceiling reached meanwhile.
      const fresh = await findPrivacyRequestOtp(db, otpId);
      if (fresh === null || fresh.verifiedAt !== null || fresh.expiresAt.getTime() <= now.getTime()) return { kind: "expired" };
      return { kind: "too_many_attempts", message: TOO_MANY_ATTEMPTS_MESSAGE };
    }

    const matches = bookingOtpBypassed() || otpCodeMatches(otp.codeHash, otp.id, code, secret);
    if (!matches) {
      const triesLeft = Math.max(OTP_MAX_ATTEMPTS - claim.attempts, 0);
      if (triesLeft === 0) return { kind: "too_many_attempts", message: NO_TRIES_LEFT_MESSAGE };
      return { kind: "wrong_code", message: wrongCodeMessage(triesLeft) };
    }

    const received = await receiveVerifiedPrivacyRequest(db, { otpId, maxAttempts: OTP_MAX_ATTEMPTS, now, dueAt: requestDeadlinesFor(otp.payload.kind, now).dueAt });
    // Null only when another confirm used the code, or it expired, between the claim and here.
    if (received === null) return { kind: "expired" };
    switch (received.outcome) {
      // An erasure or deletion is already done and closed: nothing for staff to pick up, so no alert. The pages that
      // showed what went are told to stop showing it.
      case "erased":
        for (const business of received.erased.businesses) scheduleWebsiteRefresh(business);
        return { kind: "erased", reference: received.reference, reviews: received.erased.reviews, comments: received.erased.comments, enquiries: received.erased.enquiries };
      case "deleted":
        scheduleWebsiteRefresh(received.business);
        return { kind: "deleted", reference: received.reference };
      case "not_found":
        return { kind: "not_found" };
      case "filed":
        // Not awaited: the person is waiting for their reference, and the alert never fails the request.
        void notifyNewPrivacyRequest({ reference: received.reference, kind: otp.payload.kind, dueAt: received.dueAt });
        return { kind: "received", reference: received.reference, dueAt: received.dueAt };
      default: {
        const unhandled: never = received;
        throw new Error(`Unhandled privacy request outcome: ${JSON.stringify(unhandled)}`);
      }
    }
  } catch (error) {
    console.error("Could not confirm a privacy request code.", errorLogInfo(error));
    return { kind: "failed" };
  }
}
