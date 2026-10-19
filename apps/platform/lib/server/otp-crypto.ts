import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { OTP_LENGTH } from "@brandbasket/shared/lib/appointments/otp";

const OTP_CEILING = 10 ** OTP_LENGTH; // 1_000_000 for OTP_LENGTH = 6

/** A fresh `OTP_LENGTH`-digit code from node:crypto's CSPRNG (never `Math.random`), zero-padded so every code is
 * exactly `OTP_LENGTH` digits, e.g. "004821". */
export function generateOtpCode(): string {
  return randomInt(0, OTP_CEILING).toString().padStart(OTP_LENGTH, "0");
}

/**
 * HMAC-SHA256(secret, otpId + ":" + code), hex. The code itself is never stored — only this hash, salted with the
 * OTP row's own id so the same code hashes differently across two OTP rows.
 *
 * The id is generated in application code (`crypto.randomUUID()` in lib/server/booking-otp.ts), not left to
 * `createBookingOtp`'s (packages/db) own `$defaultFn`, specifically so it is known *before* the insert that needs
 * this hash — `NewBookingOtp.id` is optional exactly to let a caller supply it up front for this reason.
 */
export function hashOtpCode(otpId: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`${otpId}:${code}`).digest("hex");
}

/** Constant-time check of `candidateCode` against `storedHash`, so a wrong guess's timing never leaks how much of
 * it matched. A length mismatch (a corrupt or foreign hash) is treated as no match, not a mismatch. */
export function otpCodeMatches(storedHash: string, otpId: string, candidateCode: string, secret: string): boolean {
  const candidate = Buffer.from(hashOtpCode(otpId, candidateCode, secret), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}
