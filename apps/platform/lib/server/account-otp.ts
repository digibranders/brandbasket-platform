import "server-only";
import { currentBrand } from "./request-brand";
import { randomUUID } from "node:crypto";
import {
  claimAccountOtpAttempt,
  consumeAccountOtp,
  consumeRateLimit,
  createAccountOtp,
  purgeExpiredAccountOtps,
  type RateLimitRule,
} from "@fynix/db";
import type { AccountOtpPurpose } from "@fynix/db";
import { phoneHint as toPhoneHint } from "@fynix/shared/lib/appointments/booking-form";
import { isOtpCode, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "@fynix/shared/lib/appointments/otp";
import { getStaffDb } from "./db";
import { bookingOtpSecret, signupOtpBypassed, smsAllowedCountryCodes, verifyOtpBypassed } from "./env";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { ipRateLimitKey } from "./ip-key";
import { generateOtpCode, hashOtpCode, otpCodeMatches } from "./otp-crypto";
import { disallowedPhoneMessage, isPhoneCountryAllowed } from "./sms-country-guard";
import { createSmsSender, otpMessage, SmsProviderUnavailableError } from "./sms";

/**
 * The code texted to a phone number for an account: to open a free listing account with that number (`signup`), or
 * to choose a new password for the account that signs in with it (`password_reset`). The booking and review code
 * rules: 6 digits, 10 minutes, 5 tries, HMAC with BOOKING_OTP_SECRET, the same SMS sender and country allow-list.
 *
 * A password reset has no bypass switch, unlike a booking or a review: a code that any six digits satisfy would let
 * anyone reset anyone's password. Where production has no SMS provider, asking for that code is `unavailable`.
 *
 * A sign-up has one, SIGNUP_OTP_BYPASS (see signupOtpBypassed in ./env.ts), temporary until an SMS provider is
 * connected: nothing is texted and any six digits confirm. A business verification has VERIFY_OTP_BYPASS the same way
 * (verifyOtpBypassed). The step is still stored, so it still runs out, is used once, keeps its limits, and cannot
 * stand in for a password reset.
 *
 * Runs on the staff connection (a sanctioned exception, see getStaffDb in ./db.ts): whoever asks has no session yet,
 * and account_otps is staff-only (0073).
 */

const ONE_MINUTE_SECONDS = 60;
const ONE_HOUR_SECONDS = 60 * ONE_MINUTE_SECONDS;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

/** Per visitor address. */
const IP_RULE: RateLimitRule = { limit: 10, windowSeconds: ONE_HOUR_SECONDS };
/** Per phone number: a short-burst and a daily budget, each under its own key (a shared key would let the shorter
 * window's rule wipe the longer one's counter, see booking-otp.ts). */
const PHONE_SHORT_RULE: RateLimitRule = { limit: 3, windowSeconds: 10 * ONE_MINUTE_SECONDS };
const PHONE_DAY_RULE: RateLimitRule = { limit: 8, windowSeconds: ONE_DAY_SECONDS };
/** Every account code together: caps the SMS spend if everything else is somehow got around. */
const ALL_DAY_RULE: RateLimitRule = { limit: 1000, windowSeconds: ONE_DAY_SECONDS };
/** Confirm attempts per visitor address, only to slow code guessing (each code also has its own 5 tries). */
const CONFIRM_IP_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_HOUR_SECONDS };

/**
 * The sign-up's code is not texted or checked while SIGNUP_OTP_BYPASS is on, nor a business verification's while
 * VERIFY_OTP_BYPASS is. Never a password reset's.
 */
function isBypassed(purpose: AccountOtpPurpose): boolean {
  if (purpose === "signup") return signupOtpBypassed();
  if (purpose === "verify_business") return verifyOtpBypassed();
  return false;
}

export interface AccountOtpRequest {
  readonly purpose: AccountOtpPurpose;
  /** E.164. */
  readonly phone: string;
  /**
   * False answers exactly as if a code had been sent, and stores a code, but texts nothing: a password reset asked
   * for a number with no account, which a stranger must not be able to tell from one that has. The caller must not
   * act on that code being confirmed (there is no account to act on).
   */
  readonly send: boolean;
}

export interface AccountOtpLimited {
  readonly kind: "limited";
  readonly scope: "network" | "phone" | "global";
  readonly retryAfterSeconds: number;
}

export type AccountOtpRequestOutcome =
  | {
      readonly kind: "sent";
      readonly otpId: string;
      readonly expiresInSeconds: number;
      readonly phoneHint: string;
      /**
       * False only with the sign-up bypass on: no code went anywhere, and the form must not say one did. It is true
       * for a code that was stored but not sent (`send: false`) too, which has to look exactly like one that was.
       */
      readonly texted: boolean;
    }
  /** The number's country is not one we text. */
  | { readonly kind: "invalid"; readonly message: string }
  | AccountOtpLimited
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed" };

/**
 * Texts a code to `request.phone`. Checks, in order: the code secret and an SMS provider are configured (unavailable
 * when production would only reach the local outbox); the number's country is on the SMS allow-list (invalid, before
 * any budget is spent); the rate limits, narrowest first (limited). Then stores the hashed code and texts it.
 */
export async function requestAccountOtp(request: AccountOtpRequest, clientIp: string, now: Date): Promise<AccountOtpRequestOutcome> {
  // Before any budget is spent: a misconfiguration must fail at once, not after costing the visitor a try.
  const secret = bookingOtpSecret();
  // With the bypass on nothing is sent for a sign-up, so no SMS provider is needed, not even in production.
  const bypassed = isBypassed(request.purpose);
  let smsSender: ReturnType<typeof createSmsSender> | null = null;
  try {
    if (!bypassed) smsSender = createSmsSender();
  } catch (error) {
    if (!(error instanceof SmsProviderUnavailableError)) throw error;
    console.error("An account code was requested but SMS is not configured for production.", { purpose: request.purpose });
    return { kind: "unavailable" };
  }

  const allowedCountryCodes = smsAllowedCountryCodes();
  if (!isPhoneCountryAllowed(request.phone, allowedCountryCodes)) {
    return { kind: "invalid", message: disallowedPhoneMessage(allowedCountryCodes) };
  }

  const db = getStaffDb();
  // Opportunistic housekeeping, like the booking and review codes: not awaited, so it never slows or fails this.
  purgeExpiredAccountOtps(db, now).catch((error: unknown) => {
    console.error("Could not purge expired account codes.", errorLogInfo(error));
  });

  for (const check of [
    { key: `account-otp:ip:${ipRateLimitKey(clientIp)}`, rule: IP_RULE, scope: "network" },
    { key: `account-otp:phone:10m:${request.phone}`, rule: PHONE_SHORT_RULE, scope: "phone" },
    { key: `account-otp:phone:day:${request.phone}`, rule: PHONE_DAY_RULE, scope: "phone" },
    { key: "account-otp:all", rule: ALL_DAY_RULE, scope: "global" },
  ] as const) {
    const result = await consumeRateLimit(db, check.key, check.rule, now);
    if (!result.allowed) return { kind: "limited", scope: check.scope, retryAfterSeconds: result.retryAfterSeconds };
  }

  // The id salts the code's hash (see hashOtpCode), so it is made here rather than by the insert.
  const otpId = randomUUID();
  const sent: AccountOtpRequestOutcome = {
    kind: "sent",
    otpId,
    expiresInSeconds: OTP_TTL_SECONDS,
    phoneHint: toPhoneHint(request.phone),
    texted: !bypassed,
  };

  // Stored even when nothing is sent: guesses at a code nobody received then answer ("not right, 4 tries left",
  // then "run out") exactly as they would for a number that has an account, so the two cannot be told apart.
  const code = generateOtpCode();
  await createAccountOtp(db, {
    id: otpId,
    purpose: request.purpose,
    phone: request.phone,
    codeHash: hashOtpCode(otpId, code, secret),
    expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
  });
  if (smsSender === null) {
    console.warn(`The ${request.purpose} code bypass is on: no code was sent and any 6-digit code will confirm.`);
    return sent;
  }
  if (!request.send) return sent;
  try {
    await smsSender.send({ to: request.phone, body: otpMessage(code, "app", (await currentBrand()).shortName), businessId: null });
  } catch (error) {
    // A code nobody received is no use to anyone: use it up so it cannot be guessed at.
    console.error("An account code could not be texted.", errorLogInfo(error));
    await consumeAccountOtp(db, otpId);
    return { kind: "failed" };
  }
  return sent;
}

export interface AccountOtpConfirmation {
  readonly otpId: string;
  readonly code: string;
  /** What the caller is about to do on the code's strength, and for which number: both must be the code's own. */
  readonly purpose: AccountOtpPurpose;
  readonly phone: string;
}

export type AccountOtpConfirmOutcome =
  | { readonly kind: "confirmed" }
  /** `triesLeft` is null when the code was not six digits, which costs no try. */
  | { readonly kind: "wrong_code"; readonly triesLeft: number | null }
  /** Ran out, used, never existed, or out of tries: a new code is needed. */
  | { readonly kind: "expired" }
  | AccountOtpLimited;

/**
 * Checks the code and, when it is right, uses it up: `confirmed` is returned to exactly one caller, who then acts on
 * it. A code for another number or another purpose counts as a wrong code, and costs a try like one.
 */
export async function confirmAccountOtp(input: AccountOtpConfirmation, clientIp: string, now: Date): Promise<AccountOtpConfirmOutcome> {
  if (!isOtpCode(input.code)) return { kind: "wrong_code", triesLeft: null };
  const secret = bookingOtpSecret();
  const db = getStaffDb();

  const budget = await consumeRateLimit(db, `account-otp-confirm:ip:${ipRateLimitKey(clientIp)}`, CONFIRM_IP_RULE, now);
  if (!budget.allowed) return { kind: "limited", scope: "network", retryAfterSeconds: budget.retryAfterSeconds };

  const attempt = await claimAccountOtpAttempt(db, { otpId: input.otpId, maxAttempts: OTP_MAX_ATTEMPTS, now });
  if (attempt === null) return { kind: "expired" };

  // With the bypass on no code was sent for a sign-up, so any six digits match; the attempt was still claimed above,
  // so the step keeps its expiry and its tries, and still has to be this number's and a sign-up's own.
  const matches =
    attempt.purpose === input.purpose &&
    attempt.phone === input.phone &&
    (isBypassed(attempt.purpose) || otpCodeMatches(attempt.codeHash, input.otpId, input.code, secret));
  if (!matches) {
    const triesLeft = OTP_MAX_ATTEMPTS - attempt.attempts;
    return triesLeft > 0 ? { kind: "wrong_code", triesLeft } : { kind: "expired" };
  }
  return (await consumeAccountOtp(db, input.otpId)) ? { kind: "confirmed" } : { kind: "expired" };
}
