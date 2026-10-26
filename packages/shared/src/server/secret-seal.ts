import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/*
 * Keeps a short secret, such as a webhook address, in the database without storing it in the clear. AES-256-GCM with a key
 * derived from the auth secret, so a copy of the database alone does not give the address away. Changing the auth secret
 * makes every sealed value unreadable, which openSecret reports as null and the console shows as "paste it again".
 */

const VERSION = "v1";
const KEY_INFO = "brandbasket sealed setting v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFrom(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), KEY_INFO, 32));
}

export function sealSecret(secret: string, plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString("base64url")}`;
}

/** The plain text, or null when the value was not sealed with this secret or has been changed. */
export function openSecret(secret: string, sealed: string): string | null {
  const [version, payload] = sealed.split(".");
  if (version !== VERSION || payload === undefined) return null;
  const raw = Buffer.from(payload, "base64url");
  if (raw.length < IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
