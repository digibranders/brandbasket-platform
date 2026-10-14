import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { z } from "zod";

/*
 * What an import from Google Business Profile found, carried from the OAuth callback to the Details tab in one
 * short-lived httpOnly cookie (docs/superpowers/specs/2026-10-01-business-profile-design.md). Nothing is saved until
 * the owner presses Save, and Google's token is never kept: only these trimmed details are. The cookie is compressed,
 * encrypted and authenticated (AES-256-GCM, key derived from the auth secret) and bound to the business it was made
 * for and to an expiry, so it can be neither read, changed, replayed on another account, nor kept past ten minutes.
 */

const VERSION = 1;
const KEY_INFO = "firstfold google-business-import v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Browsers keep cookies up to about 4 KB with their name; the value stays well under that. */
export const SEALED_IMPORT_MAX_LENGTH = 3_600;
export const IMPORT_LIFETIME_MS = 10 * 60 * 1000;

const hoursSchema = z.discriminatedUnion("mode", [
  z.object({ dayOfWeek: z.number().int().min(0).max(6), mode: z.literal("closed") }),
  z.object({ dayOfWeek: z.number().int().min(0).max(6), mode: z.literal("all-day") }),
  z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    mode: z.literal("open"),
    opensAt: z.string().regex(/^\d{2}:\d{2}$/),
    closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  }),
]);

export const importedLocationSchema = z.object({
  /** Google's resource name, "locations/123": tells the owner's locations apart. */
  id: z.string().max(200),
  name: z.string().max(200),
  address: z.string().max(200),
  phone: z.string().max(40),
  website: z.string().max(300),
  mapsUrl: z.string().max(500),
  about: z.string().max(500),
  hours: z.array(hoursSchema).max(7),
});

export type ImportedLocation = z.output<typeof importedLocationSchema>;

const payloadSchema = z.object({
  v: z.literal(VERSION),
  businessId: z.string(),
  expiresAt: z.number(),
  locations: z.array(importedLocationSchema).min(1),
});

function keyFrom(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), KEY_INFO, 32));
}

function encrypt(secret: string, plain: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/**
 * Seals the locations for `businessId`, keeping as many as fit in a cookie (the first ones). Null when not even one
 * fits, which only an unusually long profile could cause.
 */
export function sealGoogleImport(
  secret: string,
  input: { readonly businessId: string; readonly locations: readonly ImportedLocation[]; readonly now: Date },
): string | null {
  for (let count = input.locations.length; count > 0; count -= 1) {
    const payload = { v: VERSION, businessId: input.businessId, expiresAt: input.now.getTime() + IMPORT_LIFETIME_MS, locations: input.locations.slice(0, count) };
    const sealed = encrypt(secret, deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8")));
    if (sealed.length <= SEALED_IMPORT_MAX_LENGTH) return sealed;
  }
  return null;
}

/** The locations sealed for `businessId`, or null for anything forged, changed, expired, or made for another business. */
export function openGoogleImport(
  secret: string,
  input: { readonly sealed: string; readonly businessId: string; readonly now: Date },
): readonly ImportedLocation[] | null {
  if (input.sealed.length > SEALED_IMPORT_MAX_LENGTH) return null;
  const raw = Buffer.from(input.sealed, "base64url");
  if (raw.length <= IV_BYTES + TAG_BYTES) return null;
  let plain: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    plain = inflateRawSync(Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]));
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(plain.toString("utf8"));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  if (parsed.data.businessId !== input.businessId || parsed.data.expiresAt <= input.now.getTime()) return null;
  return parsed.data.locations;
}
