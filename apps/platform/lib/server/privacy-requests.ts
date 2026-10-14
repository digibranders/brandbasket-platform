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
} from "@fynix/db";
import { EmailConfigurationError, privacyRequestCodeEmail } from "@fynix/email";
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "@fynix/shared/lib/appointments/otp";
import { requestDeadlines, requestDeadlinesFor } from "@fynix/shared/lib/privacy-request-deadlines";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { emailHint } from "@/lib/email-hint";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import { accountCodeSecret, emailCodeBypassed } from "./env";
import { ipRateLimitKey } from "./ip-key";
import { generateOtpCode, hashOtpCode, otpCodeMatches } from "./otp-crypto";
import type { PrivacyRequestInput } from "./privacy-request-fields";
import { notifyNewPrivacyRequest } from "./privacy-request-notify";
import { getPublicDb } from "./public-db";
import { scheduleWebsiteRefresh } from "./website-refresh";

/**
 * The work behind `POST /api/privacy-requests/otp`, `/contribution` and `/confirm`: a rights request or grievance made on the
 * website's public form, or a visitor deleting one of their reviews or comments. The code emailed to the address given proves
 * the person controls it; only then is the request filed in the tracker, with its identity check stamped and a reference to
 * quote. Stored on the staff connection (see `getStaffDb`'s sanctioned exceptions), for the Grievance Officer to read in the
 * console; the email itself goes through the intake connection, like every email sent to someone who is not signed in. Nothing
 * is filed for a code that is never confirmed.
 */

const ONE_MINUTE_SECONDS = 60;
const ONE_HOUR_SECONDS = 60 * ONE_MINUTE_SECONDS;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

/** Each code is an email from our sender, so the budgets are tight: a person has no reason to ask for more than a few. */
const IP_RULE: RateLimitRule = { limit: 5, windowSeconds: ONE_HOUR_SECONDS };
const EMAIL_SHORT_RULE: RateLimitRule = { limit: 3, windowSeconds: 10 * ONE_MINUTE_SECONDS };
const EMAIL_DAY_RULE: RateLimitRule = { limit: 6, windowSeconds: ONE_DAY_SECONDS };
const ALL_DAY_RULE: RateLimitRule = { limit: 300, windowSeconds: ONE_DAY_SECONDS };
const CONFIRM_IP_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_HOUR_SECONDS };

const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Ask for a new code.";
const NO_TRIES_LEFT_MESSAGE = "No tries left. Ask for a new code.";

export type PrivacyRequestOtpOutcome =
  | { readonly kind: "otp_sent"; readonly otpId: string; readonly expiresInSeconds: number; readonly emailHint: string }
  | { readonly kind: "unavailable" }
  | { readonly kind: "limited" }
  | { readonly kind: "failed" };

export type PrivacyRequestConfirmOutcome =
  | { readonly kind: "received"; readonly reference: string; readonly dueAt: Date }
  | { readonly kind: "expired" }
  | { readonly kind: "too_many_attempts"; readonly message: string }
  | { readonly kind: "wrong_code"; readonly message: string }
  | { readonly kind: "limited" }
  | { readonly kind: "failed" };

/** A visitor the website already recognises, deleting one of their reviews or comments: their number is already proven. */
export interface ContributionDeletionInput {
  readonly target: DirectoryContributionTarget;
  readonly phone: string;
  readonly noticeVersion: string | null;
}

export type ContributionDeletionOutcome =
  | { readonly kind: "deleted"; readonly reference: string }
  | { readonly kind: "not_found" }
  | { readonly kind: "failed" };

/** Emails a code to the address on a request from the public form. See `sendRequestCode`. */
export function requestPrivacyRequestOtp(input: PrivacyRequestInput, clientIp: string, now: Date): Promise<PrivacyRequestOtpOutcome> {
  return sendRequestCode(input.email, { kind: input.kind, name: input.name, details: input.details, noticeVersion: input.noticeVersion }, clientIp, now);
}

/**
 * A visitor deleting one of their own reviews or comments (DPDP Act s.12(3), s.6(4)). The website already recognises the
 * visitor, so their number has been proven before and it is deleted at once. Only a review or comment posted with that number
 * is deleted, and the answer for anything else is the same `not_found`, so an id never reveals whose number posted it.
 */
export async function requestContributionDeletion(input: ContributionDeletionInput, now: Date): Promise<ContributionDeletionOutcome> {
  try {
    const db = getStaffDb();
    const deleted = await db.transaction((tx) =>
      deleteContributionForProvenNumber(tx, { phone: input.phone, target: input.target, now, dueAt: requestDeadlines(now).dueAt }),
    );
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
 * Emails a code to `email`, after the rate limits, narrowest first. The request waits, hashed code and all, until the code is
 * confirmed. With the local bypass on (EMAIL_CODE_BYPASS) the code is still emailed (to the outbox), but any 6 digits confirm.
 */
async function sendRequestCode(email: string, payload: PrivacyRequestOtpPayload, clientIp: string, now: Date): Promise<PrivacyRequestOtpOutcome> {
  try {
    // Before any rate limit is spent: a misconfiguration must fail at once, not after costing the person a try.
    const secret = accountCodeSecret();
    let transport: ReturnType<typeof customerEmailTransport>;
    try {
      transport = customerEmailTransport(getPublicDb());
    } catch (error) {
      if (!(error instanceof EmailConfigurationError)) throw error;
      console.error("A privacy request code was requested but email is not configured for production.");
      return { kind: "unavailable" };
    }

    const db = getStaffDb();
    // Opportunistic housekeeping, not awaited: it never slows or fails this request.
    purgeExpiredPrivacyRequestOtps(db, now).catch((error: unknown) => {
      console.error("Could not purge expired privacy request codes.", errorLogInfo(error));
    });

    for (const check of [
      { key: `privacy-otp:ip:${ipRateLimitKey(clientIp)}`, rule: IP_RULE },
      { key: `privacy-otp:email:10m:${email}`, rule: EMAIL_SHORT_RULE },
      { key: `privacy-otp:email:day:${email}`, rule: EMAIL_DAY_RULE },
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
      email,
      codeHash: hashOtpCode(otpId, code, secret),
      payload,
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    });

    if (emailCodeBypassed()) {
      console.warn("The email code bypass is on: any 6-digit code will confirm a privacy request. The code is in the outbox.");
    }
    try {
      await transport.send(privacyRequestCodeEmail({ to: email, code, expiresInMinutes: OTP_TTL_SECONDS / 60 }));
    } catch (sendError) {
      await deletePrivacyRequestOtp(db, otpId);
      console.error("Could not email a privacy request code.", errorLogInfo(sendError));
      return { kind: "failed" };
    }

    return { kind: "otp_sent", otpId, expiresInSeconds: OTP_TTL_SECONDS, emailHint: emailHint(email) };
  } catch (error) {
    // Never the error's message: a failed insert's parameters (name, address, details) would be in it.
    console.error("Could not request a privacy request code.", errorLogInfo(error));
    return { kind: "failed" };
  }
}

function wrongCodeMessage(triesLeft: number): string {
  return `That code is not right. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`;
}

/**
 * Checks the code and files the request it was holding. An attempt is claimed before the code is compared, so the ceiling
 * holds however many confirms race. The due date counts from this moment: the day the person proved the address is the day
 * the request is received.
 */
export async function confirmPrivacyRequestOtp(otpId: string, code: string, clientIp: string, now: Date): Promise<PrivacyRequestConfirmOutcome> {
  try {
    const secret = accountCodeSecret();
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

    const matches = emailCodeBypassed() || otpCodeMatches(otp.codeHash, otp.id, code, secret);
    if (!matches) {
      const triesLeft = Math.max(OTP_MAX_ATTEMPTS - claim.attempts, 0);
      if (triesLeft === 0) return { kind: "too_many_attempts", message: NO_TRIES_LEFT_MESSAGE };
      return { kind: "wrong_code", message: wrongCodeMessage(triesLeft) };
    }

    const received = await receiveVerifiedPrivacyRequest(db, { otpId, maxAttempts: OTP_MAX_ATTEMPTS, now, dueAt: requestDeadlinesFor(otp.payload.kind, now).dueAt });
    // Null only when another confirm used the code, or it expired, between the claim and here.
    if (received === null) return { kind: "expired" };
    // Not awaited: the person is waiting for their reference, and the alert never fails the request.
    void notifyNewPrivacyRequest({ reference: received.reference, kind: otp.payload.kind, dueAt: received.dueAt });
    return { kind: "received", reference: received.reference, dueAt: received.dueAt };
  } catch (error) {
    console.error("Could not confirm a privacy request code.", errorLogInfo(error));
    return { kind: "failed" };
  }
}
