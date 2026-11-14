import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { JoinCodeStep } from "../rules/join-form";
import { accountCodeSecret } from "./env";

/**
 * Manages the pending sign-up state stored in an encrypted cookie so the sign-up code step survives a browser refresh.
 * Uses AES-256-GCM encryption with ACCOUNT_CODE_SECRET.
 * Valid for 10 minutes, matching the OTP TTL.
 */

export const PENDING_SIGNUP_COOKIE = "bb_signup_step";

const IV_BYTES = 12;
const TAG_BYTES = 16;
export const SIGNUP_STEP_TTL_SECONDS = 600; // 10 minutes

export interface PendingSignupInput {
  readonly businessName: string;
  readonly name: string;
  readonly email: string;
  readonly country: string;
  readonly stateCode: string;
  readonly phoneCountry: string;
  readonly phone: string;
  readonly password: string;
  readonly agreed: boolean;
  readonly choice: string;
  readonly services: readonly string[];
  readonly startToken: string | null;
  readonly next: string | null;
}

export interface PendingSignupPayload {
  readonly otp: JoinCodeStep;
  readonly input: PendingSignupInput;
  readonly exp: number;
}

const keyFor = (secret: string): Buffer =>
  createHash("sha256").update(`brandbasket-signup-step-v1:${secret}`).digest();

export function sealPendingSignup(
  payload: Omit<PendingSignupPayload, "exp">,
  secret: string,
  now: number = Date.now(),
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const exp = now + SIGNUP_STEP_TTL_SECONDS * 1000;
  const body = Buffer.concat([
    cipher.update(JSON.stringify({ ...payload, exp }), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openPendingSignup(
  token: string,
  secret: string,
  now: number = Date.now(),
): PendingSignupPayload | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
    const data: unknown = JSON.parse(plain);
    if (typeof data !== "object" || data === null) return null;
    const { otp, input, exp } = data as Record<string, unknown>;
    if (typeof exp !== "number" || exp < now) return null;
    if (typeof otp !== "object" || otp === null) return null;
    if (typeof input !== "object" || input === null) return null;
    return { otp, input, exp } as PendingSignupPayload;
  } catch {
    return null;
  }
}

export async function setPendingSignupCookie(
  payload: Omit<PendingSignupPayload, "exp">,
): Promise<void> {
  const secret = accountCodeSecret();
  const token = sealPendingSignup(payload, secret);
  const cookieJar = await cookies();
  cookieJar.set(PENDING_SIGNUP_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/signup",
    maxAge: SIGNUP_STEP_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getPendingSignupCookie(): Promise<PendingSignupPayload | null> {
  try {
    const cookieJar = await cookies();
    const token = cookieJar.get(PENDING_SIGNUP_COOKIE)?.value;
    if (!token) return null;
    const secret = accountCodeSecret();
    return openPendingSignup(token, secret);
  } catch {
    return null;
  }
}

export async function clearPendingSignupCookie(): Promise<void> {
  try {
    const cookieJar = await cookies();
    cookieJar.delete(PENDING_SIGNUP_COOKIE);
  } catch {
    // If not in a context that can modify cookies
  }
}
