import "server-only";
import { findPlaceByUrlCode, listLegacyKeysByPlace, type DirectoryPlace } from "@brandbasket/db";
import { businessPagePathParts } from "@brandbasket/shared/lib/directory/place-id";
import { getStaffDb } from "./db";

/*
 * What staff paste into a form may be a business's page on the website as it is now, /in/mh/business/<name>/<code>.
 * The code is a keyed hash of the business id, so only the database can say which business it is. These turn such an
 * address into what the forms already read (a listing key, a business id) before the forms parse it; any other text
 * passes through unchanged, for the form's own checks and messages.
 */

/** Longest text read as an address; the forms refuse anything longer themselves. */
const MAX_ADDRESS_LENGTH = 500;

/** The business a pasted address names (a full URL on any host, or a bare path), or null when it names none. */
export async function placeOfBusinessAddress(raw: string): Promise<DirectoryPlace | null> {
  const text = raw.trim().toLowerCase();
  if (text === "" || text.length > MAX_ADDRESS_LENGTH) return null;
  const isUrl = /^https?:\/\//.test(text);
  if (isUrl && !URL.canParse(text)) return null;
  const path = isUrl ? new URL(text).pathname : (text.split(/[?#]/, 1)[0] ?? "");
  const parts = businessPagePathParts(path);
  return parts === null ? null : findPlaceByUrlCode(getStaffDb(), parts);
}

/**
 * For a form that takes a listing key: a business address becomes one of the business's listing keys (every key of a
 * place names the same business); anything else, or an address of a business with no key, is returned as typed.
 */
export async function listingKeyForAddress(raw: string): Promise<string> {
  return (await resolveListingAddress(raw)).listing;
}

/**
 * `listingKeyForAddress` with one more answer: whether `raw` is the page of a business that has no listing key at all
 * (a business added after the old addresses), which a form needing a key can say plainly rather than call it "not a
 * business page". `listing` is the key when there is one, else what was typed.
 */
export async function resolveListingAddress(raw: string): Promise<{ readonly listing: string; readonly keyless: boolean }> {
  const place = await placeOfBusinessAddress(raw);
  if (place === null) return { listing: raw, keyless: false };
  const keys = (await listLegacyKeysByPlace(getStaffDb(), [place.id])).get(place.id) ?? [];
  const key = keys[0];
  return key === undefined ? { listing: raw, keyless: true } : { listing: key, keyless: false };
}

/** For a form that takes a business id: a business address becomes its id; anything else is returned as typed. */
export async function placeIdForAddress(raw: string): Promise<string> {
  return (await placeOfBusinessAddress(raw))?.id ?? raw;
}
