import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * What the ad landing page hands to the app's sign-up page so it opens already filled in: the visitor's name, email and
 * mobile number, and the ad that brought them (plan 59), sealed with AES-256-GCM under a key made from LEADS_API_TOKEN (the secret both servers already share) and
 * good for an hour. The address carries an opaque string, never the details themselves.
 *
 * brandbasket-platform keeps an identical copy (apps/platform/lib/start-token.ts). Change both together.
 */

/** The sign-up address's query parameter that carries the token. */
export const START_PARAM = "start";

const TTL_MS = 60 * 60 * 1000;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Every attribution value the token may carry, with the longest it may be. Anything else is dropped. */
export const ATTRIBUTION_CAPS = {
  utm_source: 120,
  utm_medium: 120,
  utm_campaign: 120,
  utm_term: 120,
  utm_content: 120,
  gclid: 120,
  fbclid: 120,
  fbp: 60,
  fbc: 120,
  ga_client_id: 40,
  ga_session_id: 20,
  landing_path: 200,
  referrer_host: 100,
} as const;
export type AttributionKey = keyof typeof ATTRIBUTION_CAPS;

/** The ad a visitor came from, and which tracking they had agreed to when the ids were read (plan 59). */
export interface Attribution {
  readonly values: Readonly<Partial<Record<AttributionKey, string>>>;
  readonly consentMeasurement: boolean;
  readonly consentAdvertising: boolean;
}

/** The attribution in `raw` with only the known, short, single-line text values kept; null when none is left. Never throws. */
export function cleanAttribution(raw: unknown): Attribution | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { values, consentMeasurement, consentAdvertising } = raw as Record<string, unknown>;
  if (typeof values !== "object" || values === null || Array.isArray(values)) return null;
  const kept: Partial<Record<AttributionKey, string>> = {};
  for (const key of Object.keys(ATTRIBUTION_CAPS) as AttributionKey[]) {
    const value = (values as Record<string, unknown>)[key];
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text !== "" && text.length <= ATTRIBUTION_CAPS[key] && !/\p{Cc}/u.test(text)) kept[key] = text;
  }
  if (Object.keys(kept).length === 0) return null;
  return { values: kept, consentMeasurement: consentMeasurement === true, consentAdvertising: consentAdvertising === true };
}

export interface StartPrefill {
  readonly name: string;
  readonly email: string;
  /** Ten digits, an Indian mobile number without its country code; empty when the visitor is not in India. */
  readonly phone: string;
  /** The ad the visitor came from, when there was one. */
  readonly attr?: Attribution;
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
    const { name, email, phone, exp, attr } = data as Record<string, unknown>;
    if (typeof name !== "string" || typeof email !== "string" || typeof phone !== "string" || typeof exp !== "number") return null;
    if (exp < now) return null;
    // A bad attribution costs the ad link, never the prefill.
    const cleaned = cleanAttribution(attr);
    return cleaned === null ? { name, email, phone } : { name, email, phone, attr: cleaned };
  } catch {
    return null;
  }
}
