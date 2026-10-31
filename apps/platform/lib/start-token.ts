import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * What the ad landing page hands to the app's sign-up page so it opens already filled in: the visitor's name, email and
 * mobile number, sealed with AES-256-GCM under a key made from LEADS_API_TOKEN (the secret both servers already share) and
 * good for an hour. The address carries an opaque string, never the details themselves.
 *
 * brandbasket-platform keeps an identical copy (apps/platform/lib/start-token.ts). Change both together.
 */

/** The sign-up address's query parameter that carries the token. */
export const START_PARAM = "start";

const TTL_MS = 60 * 60 * 1000;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface StartPrefill {
  readonly name: string;
  readonly email: string;
  /** Ten digits, an Indian mobile number without its country code; empty when the visitor is not in India. */
  readonly phone: string;
}

const keyFor = (secret: string): Buffer => createHash("sha256").update(`brandbasket-start-v1:${secret}`).digest();

export function sealStart(prefill: StartPrefill, secret: string, now: number = Date.now()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...prefill, exp: now + TTL_MS }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The details a token carries, or null for anything that is not a fresh token made with this secret. Never throws. */
export function openStart(token: string, secret: string, now: number = Date.now()): StartPrefill | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
    const data: unknown = JSON.parse(plain);
    if (typeof data !== "object" || data === null) return null;
    const { name, email, phone, exp } = data as Record<string, unknown>;
    if (typeof name !== "string" || typeof email !== "string" || typeof phone !== "string" || typeof exp !== "number") return null;
    return exp < now ? null : { name, email, phone };
  } catch {
    return null;
  }
}
