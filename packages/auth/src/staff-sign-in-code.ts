import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import {
  claimAccountOtpAttempt,
  consumeAccountOtp,
  consumeRateLimit,
  createAccountOtp,
  purgeExpiredAccountOtps,
  type Database,
  type RateLimitRule,
} from "@brandbasket/db";

/**
 * The second factor of a console sign-in: a 6-digit code emailed to the address the password belongs to, once the
 * password was right. It lives 5 minutes, allows 5 tries, works once, and is stored only as an HMAC salted with its row
 * id. Issuing and checking are limited per network, per address and overall. Sending the email is the caller's job.
 */
export const STAFF_SIGN_IN_CODE_TTL_SECONDS = 5 * 60;
export const STAFF_SIGN_IN_CODE_MAX_ATTEMPTS = 5;
const CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[0-9]{${CODE_LENGTH}}$`);

const ONE_HOUR_SECONDS = 60 * 60;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

const CLIENT_RULE: RateLimitRule = { limit: 10, windowSeconds: ONE_HOUR_SECONDS };
const ADDRESS_SHORT_RULE: RateLimitRule = { limit: 3, windowSeconds: 10 * 60 };
const ADDRESS_DAY_RULE: RateLimitRule = { limit: 10, windowSeconds: ONE_DAY_SECONDS };
const ALL_DAY_RULE: RateLimitRule = { limit: 500, windowSeconds: ONE_DAY_SECONDS };
/** Checks per network; each code also has its own tries. */
const CONFIRM_CLIENT_RULE: RateLimitRule = { limit: 30, windowSeconds: ONE_HOUR_SECONDS };

/** The rate-limit keys that belong to one address, so the recovery command can clear them. */
export function staffSignInCodeAddressKeys(email: string): { readonly short: string; readonly day: string } {
  return { short: `staff-sign-in-code:email:10m:${email}`, day: `staff-sign-in-code:email:day:${email}` };
}

function hashCode(otpId: string, code: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`staff-sign-in-code:${otpId}:${code}`).digest();
}

function codeMatches(storedHash: string, otpId: string, code: string, secret: string): boolean {
  const stored = Buffer.from(storedHash, "hex");
  const candidate = hashCode(otpId, code, secret);
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

export type IssueStaffSignInCodeOutcome =
  | { readonly kind: "issued"; readonly otpId: string; readonly code: string; readonly expiresInSeconds: number }
  | { readonly kind: "limited"; readonly retryAfterSeconds: number };

export interface IssueStaffSignInCode {
  /** Trimmed and lowercased, as accounts are stored. */
  readonly email: string;
  readonly clientIp: string;
  /** The key the code is hashed with. */
  readonly secret: string;
  readonly now: Date;
}

/** Spends the rate limits, then stores a fresh code for the address. The plain code is returned once, to be emailed. */
export async function issueStaffSignInCode(db: Database, input: IssueStaffSignInCode): Promise<IssueStaffSignInCodeOutcome> {
  const addressKeys = staffSignInCodeAddressKeys(input.email);
  const checks: readonly (readonly [string, RateLimitRule])[] = [
    [`staff-sign-in-code:client:${input.clientIp}`, CLIENT_RULE],
    [addressKeys.short, ADDRESS_SHORT_RULE],
    [addressKeys.day, ADDRESS_DAY_RULE],
    ["staff-sign-in-code:all", ALL_DAY_RULE],
  ];
  for (const [key, rule] of checks) {
    const result = await consumeRateLimit(db, key, rule, input.now);
    if (!result.allowed) return { kind: "limited", retryAfterSeconds: result.retryAfterSeconds };
  }

  // Housekeeping that must never slow or fail a sign-in, so it is not awaited.
  purgeExpiredAccountOtps(db, input.now).catch((error: unknown) => {
    console.error("Could not purge expired sign-in codes.", error instanceof Error ? error.name : "unknown error");
  });

  // The id salts the hash, so it is made here and not by the insert.
  const otpId = randomUUID();
  const code = randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
  await createAccountOtp(db, {
    id: otpId,
    purpose: "staff_sign_in",
    email: input.email,
    codeHash: hashCode(otpId, code, input.secret).toString("hex"),
    expiresAt: new Date(input.now.getTime() + STAFF_SIGN_IN_CODE_TTL_SECONDS * 1000),
  });
  return { kind: "issued", otpId, code, expiresInSeconds: STAFF_SIGN_IN_CODE_TTL_SECONDS };
}

/** Uses a code up, for the case where it could not be emailed: a code nobody received must not stay guessable. */
export async function withdrawStaffSignInCode(db: Database, otpId: string): Promise<void> {
  await consumeAccountOtp(db, otpId);
}

export type VerifyStaffSignInCodeOutcome =
  | { readonly kind: "verified"; readonly email: string }
  /** `triesLeft` is null when the input was not six digits, which costs no try. */
  | { readonly kind: "wrong_code"; readonly triesLeft: number | null; readonly email: string | null }
  /** Ran out, used, never existed, or out of tries. `email` is known only when a try was spent on a real code. */
  | { readonly kind: "expired"; readonly email: string | null }
  | { readonly kind: "limited"; readonly retryAfterSeconds: number };

export interface VerifyStaffSignInCode {
  readonly otpId: string;
  readonly code: string;
  readonly clientIp: string;
  readonly secret: string;
  readonly now: Date;
  /** Local development only (EMAIL_CODE_BYPASS): any six digits match. The try is still spent and the code still expires. */
  readonly acceptAnySixDigits: boolean;
}

/**
 * Checks a submitted code and, when right, uses it up: `verified` goes to exactly one caller. A wrong code costs one of
 * its five tries; the fifth wrong one ends it.
 */
export async function verifyStaffSignInCode(db: Database, input: VerifyStaffSignInCode): Promise<VerifyStaffSignInCodeOutcome> {
  if (!CODE_PATTERN.test(input.code)) return { kind: "wrong_code", triesLeft: null, email: null };

  const budget = await consumeRateLimit(db, `staff-sign-in-code-confirm:client:${input.clientIp}`, CONFIRM_CLIENT_RULE, input.now);
  if (!budget.allowed) return { kind: "limited", retryAfterSeconds: budget.retryAfterSeconds };

  const attempt = await claimAccountOtpAttempt(db, {
    otpId: input.otpId,
    purpose: "staff_sign_in",
    maxAttempts: STAFF_SIGN_IN_CODE_MAX_ATTEMPTS,
    now: input.now,
  });
  if (attempt === null) return { kind: "expired", email: null };

  if (!input.acceptAnySixDigits && !codeMatches(attempt.codeHash, input.otpId, input.code, input.secret)) {
    const triesLeft = STAFF_SIGN_IN_CODE_MAX_ATTEMPTS - attempt.attempts;
    return triesLeft > 0 ? { kind: "wrong_code", triesLeft, email: attempt.email } : { kind: "expired", email: attempt.email };
  }
  return (await consumeAccountOtp(db, input.otpId)) ? { kind: "verified", email: attempt.email } : { kind: "expired", email: null };
}
