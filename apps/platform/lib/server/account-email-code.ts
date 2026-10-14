import "server-only";
import { randomUUID } from "node:crypto";
import {
  claimAccountOtpAttempt,
  consumeAccountOtp,
  consumeRateLimit,
  createAccountOtp,
  purgeExpiredAccountOtps,
  type RateLimitRule,
} from "@fynix/db";
import { EmailConfigurationError, signupCodeEmail } from "@fynix/email";
import { isOtpCode, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "@fynix/shared/lib/appointments/otp";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { emailHint } from "@/lib/email-hint";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import { accountCodeSecret, emailCodeBypassed } from "./env";
import { ipRateLimitKey } from "./ip-key";
import { generateOtpCode, hashOtpCode, otpCodeMatches } from "./otp-crypto";
import { getPublicDb } from "./public-db";

/**
 * The code emailed to an address to open an account with it (the Fynix sign-up): the same rules as the code texted to a
 * mobile number (./account-otp.ts) -- 6 digits, 10 minutes, 5 tries, HMAC with ACCOUNT_CODE_SECRET (or BOOKING_OTP_SECRET), used once -- and the
 * same budgets, with the address in the phone number's place. Only a sign-up has one: a forgotten password is a link
 * (./account-recovery.ts), never a code that could be guessed.
 *
 * EMAIL_CODE_BYPASS (see emailCodeBypassed in ./env.ts) is for local development: the code is still emailed, and so is
 * readable in the outbox, but any six digits confirm. It is never on where real customers can reach the app.
 *
 * Runs on the staff connection (a sanctioned exception, see getStaffDb in ./db.ts): whoever asks has no session yet, and
 * account_otps is staff-only (0073). The email itself is written through the intake connection, which may only add
 * outbox messages, like every email sent for someone who is not signed in.
 */

const ONE_MINUTE_SECONDS = 60;
const ONE_HOUR_SECONDS = 60 * ONE_MINUTE_SECONDS;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

/** Per visitor address. */
const IP_RULE: RateLimitRule = { limit: 10, windowSeconds: ONE_HOUR_SECONDS };
/** Per email address: a short-burst and a daily budget, each under its own key (see booking-otp.ts). */
const EMAIL_SHORT_RULE: RateLimitRule = { limit: 3, windowSeconds: 10 * ONE_MINUTE_SECONDS };
const EMAIL_DAY_RULE: RateLimitRule = { limit: 8, windowSeconds: ONE_DAY_SECONDS };
/** Every emailed account code together: caps what is sent if everything else is somehow got around. */
const ALL_DAY_RULE: RateLimitRule = { limit: 1000, windowSeconds: ONE_DAY_SECONDS };
/** Confirm attempts per visitor address, only to slow code guessing (each code also has its own 5 tries). */
const CONFIRM_IP_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_HOUR_SECONDS };

export interface AccountEmailCodeRequest {
  /** Trimmed and lowercased, as accounts are stored. */
  readonly email: string;
}

export interface AccountEmailCodeLimited {
  readonly kind: "limited";
  readonly scope: "network" | "email" | "global";
  readonly retryAfterSeconds: number;
}

export type AccountEmailCodeRequestOutcome =
  | {
      readonly kind: "sent";
      readonly otpId: string;
      readonly expiresInSeconds: number;
      /** "m•••@example.com": where the code went, with most of it hidden. */
      readonly emailHint: string;
      /** False only with the local bypass on: the code was emailed all the same, but any six digits will do. */
      readonly confirmRequired: boolean;
    }
  | AccountEmailCodeLimited
  /** Real customers can reach the app and no email provider is configured: a code could never arrive. */
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed" };

/**
 * Emails a sign-up code to `request.email`. Checks, in order: the code secret is configured and an email provider is
 * (unavailable when production would only reach the local outbox); the rate limits, narrowest first (limited). Then
 * stores the hashed code and emails it, under the name of the brand the request came in on.
 */
export async function requestAccountEmailCode(
  request: AccountEmailCodeRequest,
  clientIp: string,
  now: Date,
): Promise<AccountEmailCodeRequestOutcome> {
  // Before any budget is spent: a misconfiguration must fail at once, not after costing the visitor a try.
  const secret = accountCodeSecret();
  let transport: ReturnType<typeof customerEmailTransport>;
  try {
    transport = customerEmailTransport(getPublicDb());
  } catch (error) {
    if (!(error instanceof EmailConfigurationError)) throw error;
    console.error("An account code was requested but email is not configured for production.");
    return { kind: "unavailable" };
  }

  const db = getStaffDb();
  // Opportunistic housekeeping, like the other codes: not awaited, so it never slows or fails this.
  purgeExpiredAccountOtps(db, now).catch((error: unknown) => {
    console.error("Could not purge expired account codes.", errorLogInfo(error));
  });

  for (const check of [
    { key: `account-email-code:ip:${ipRateLimitKey(clientIp)}`, rule: IP_RULE, scope: "network" },
    { key: `account-email-code:email:10m:${request.email}`, rule: EMAIL_SHORT_RULE, scope: "email" },
    { key: `account-email-code:email:day:${request.email}`, rule: EMAIL_DAY_RULE, scope: "email" },
    { key: "account-email-code:all", rule: ALL_DAY_RULE, scope: "global" },
  ] as const) {
    const result = await consumeRateLimit(db, check.key, check.rule, now);
    if (!result.allowed) return { kind: "limited", scope: check.scope, retryAfterSeconds: result.retryAfterSeconds };
  }

  // The id salts the code's hash (see hashOtpCode), so it is made here rather than by the insert.
  const otpId = randomUUID();
  const code = generateOtpCode();
  await createAccountOtp(db, {
    id: otpId,
    purpose: "signup",
    email: request.email,
    codeHash: hashOtpCode(otpId, code, secret),
    expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
  });

  const bypassed = emailCodeBypassed();
  if (bypassed) console.warn("The email code bypass is on: any 6-digit code will confirm an email sign-up. The code is in the outbox.");
  try {
    await transport.send(
      signupCodeEmail({ to: request.email, code, expiresInMinutes: OTP_TTL_SECONDS / 60 }),
    );
  } catch (error) {
    // A code nobody received is no use to anyone: use it up so it cannot be guessed at.
    console.error("An account code could not be emailed.", errorLogInfo(error));
    await consumeAccountOtp(db, otpId);
    return { kind: "failed" };
  }
  return { kind: "sent", otpId, expiresInSeconds: OTP_TTL_SECONDS, emailHint: emailHint(request.email), confirmRequired: !bypassed };
}

export interface AccountEmailCodeConfirmation {
  readonly otpId: string;
  readonly code: string;
  /** The address the account is about to be opened with: it must be the one the code was sent to. */
  readonly email: string;
}

export type AccountEmailCodeConfirmOutcome =
  | { readonly kind: "confirmed" }
  /** `triesLeft` is null when the code was not six digits, which costs no try. */
  | { readonly kind: "wrong_code"; readonly triesLeft: number | null }
  /** Ran out, used, never existed, or out of tries: a new code is needed. */
  | { readonly kind: "expired" }
  | { readonly kind: "limited"; readonly scope: "network"; readonly retryAfterSeconds: number };

/**
 * Checks the code and, when it is right, uses it up: `confirmed` is returned to exactly one caller, who then acts on it.
 * A code for another address, or one that is not a sign-up's, counts as a wrong code and costs a try like one.
 */
export async function confirmAccountEmailCode(
  input: AccountEmailCodeConfirmation,
  clientIp: string,
  now: Date,
): Promise<AccountEmailCodeConfirmOutcome> {
  if (!isOtpCode(input.code)) return { kind: "wrong_code", triesLeft: null };
  const secret = accountCodeSecret();
  const db = getStaffDb();

  const budget = await consumeRateLimit(db, `account-email-code-confirm:ip:${ipRateLimitKey(clientIp)}`, CONFIRM_IP_RULE, now);
  if (!budget.allowed) return { kind: "limited", scope: "network", retryAfterSeconds: budget.retryAfterSeconds };

  const attempt = await claimAccountOtpAttempt(db, { otpId: input.otpId, maxAttempts: OTP_MAX_ATTEMPTS, now });
  if (attempt === null) return { kind: "expired" };

  // With the local bypass on any six digits match; the attempt was still claimed above, so the step keeps its expiry and
  // its tries, and still has to be this address's and a sign-up's own.
  const matches =
    attempt.purpose === "signup" &&
    attempt.email === input.email &&
    (emailCodeBypassed() || otpCodeMatches(attempt.codeHash, input.otpId, input.code, secret));
  if (!matches) {
    const triesLeft = OTP_MAX_ATTEMPTS - attempt.attempts;
    return triesLeft > 0 ? { kind: "wrong_code", triesLeft } : { kind: "expired" };
  }
  return (await consumeAccountOtp(db, input.otpId)) ? { kind: "confirmed" } : { kind: "expired" };
}
