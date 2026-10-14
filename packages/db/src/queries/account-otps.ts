import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { accountOtps, users, type AccountOtpPurpose } from "../schema";
import { isUuid } from "./tenant";

/*
 * The codes emailed to an address to open an account (schema/account-otps.ts), and the lookups of the account an address
 * or a phone number signs in to. The codes are written and read on the staff connection only: whoever asks for one has
 * no session yet.
 */

/** A code is kept this long after it runs out, so a late confirm is told "expired" rather than "no such code". */
const PURGE_AFTER_EXPIRY_MS = 60 * 60 * 1000;

interface NewAccountOtpBase {
  /** Supplied by the caller because the code's hash is salted with it before the insert (see hashOtpCode). */
  readonly id: string;
  readonly purpose: AccountOtpPurpose;
  readonly codeHash: string;
  readonly expiresAt: Date;
}

/** A code is addressed to an email address (trimmed, lowercase). */
export interface NewAccountOtp extends NewAccountOtpBase {
  readonly email: string;
}

export async function createAccountOtp(db: Database, input: NewAccountOtp): Promise<string> {
  const rows = await db.insert(accountOtps).values(input).returning({ id: accountOtps.id });
  const row = rows[0];
  if (row === undefined) throw new Error("Account OTP insert returned no row");
  return row.id;
}

export interface AccountOtpAttempt {
  /** Tries used, this one included. */
  readonly attempts: number;
  readonly purpose: AccountOtpPurpose;
  /** The address the code was emailed to. */
  readonly email: string;
  readonly codeHash: string;
}

/**
 * Atomically claims one of the code's `maxAttempts` tries and returns what the code is for, or null when there was
 * none to claim (no such code, used, expired, or out of tries). Every condition is in the one UPDATE's WHERE, so two
 * confirms racing for the last try can never both get it. Callers compare the submitted code, and that the purpose
 * and address are the ones they expect, only after a successful claim.
 */
export async function claimAccountOtpAttempt(
  db: Database,
  input: { readonly otpId: string; readonly maxAttempts: number; readonly now: Date },
): Promise<AccountOtpAttempt | null> {
  if (!isUuid(input.otpId)) return null;
  const rows = await db
    .update(accountOtps)
    .set({ attempts: sql`${accountOtps.attempts} + 1` })
    .where(and(eq(accountOtps.id, input.otpId), lt(accountOtps.attempts, input.maxAttempts), gt(accountOtps.expiresAt, input.now)))
    .returning({
      attempts: accountOtps.attempts,
      purpose: accountOtps.purpose,
      email: accountOtps.email,
      codeHash: accountOtps.codeHash,
    });
  return rows[0] ?? null;
}

/**
 * Uses the code up: true for exactly one caller, false for anyone after (a double submit, a second tab). Called once
 * the submitted code has matched, before anything is done on its strength.
 */
export async function consumeAccountOtp(db: Database, otpId: string): Promise<boolean> {
  if (!isUuid(otpId)) return false;
  const rows = await db.delete(accountOtps).where(eq(accountOtps.id, otpId)).returning({ id: accountOtps.id });
  return rows.length > 0;
}

/** Deletes codes that ran out more than an hour ago; returns how many. */
export async function purgeExpiredAccountOtps(db: Database, now: Date): Promise<number> {
  const rows = await db
    .delete(accountOtps)
    .where(lt(accountOtps.expiresAt, new Date(now.getTime() - PURGE_AFTER_EXPIRY_MS)))
    .returning({ id: accountOtps.id });
  return rows.length;
}

export interface PhoneAccount {
  readonly id: string;
  readonly name: string;
  /** What Better Auth signs the account in by: a real address, or the number's placeholder. */
  readonly email: string;
}

/** The account that signs in with `phone` (E.164), or null. A number nobody has proven is theirs signs nobody in. */
export async function findUserByPhone(db: Database, phone: string): Promise<PhoneAccount | null> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.phoneNumber, phone), eq(users.phoneNumberVerified, true)))
    .limit(1);
  return rows[0] ?? null;
}

/** The account that signs in with `email`, or null; the address is compared in lowercase, as accounts are stored. */
export async function findUserByEmail(db: Database, email: string): Promise<PhoneAccount | null> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}
