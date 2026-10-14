import { createHmac, randomBytes } from "node:crypto";

/**
 * A directory business's permanent id, and the code its URL carries instead: /in/mh/business/<name>/<code>. Seven
 * characters with no look-alikes (no 0 o 1 l i), so it survives being read out on a call or typed from a poster, and
 * always with a digit, so it never spells a word. Open-data ids (issued by the dataset build from the row's
 * Overture/OSM id) start with a letter; ids made here start with a digit, so the two sources can never collide.
 *
 * Lives in @firstfold/db rather than @firstfold/shared because shared depends on db (not the other way round) and
 * the registry queries in db need it. Apps and the website import it through
 * @firstfold/shared/lib/directory/place-id, which re-exports this module via the @firstfold/db/place-id subpath.
 */
export const PLACE_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const PLACE_ID_LENGTH = 7;
const DIGITS = "23456789";
const ID_PATTERN = new RegExp(`^[${PLACE_ID_ALPHABET}]{${PLACE_ID_LENGTH}}$`);
const POOL_BYTES = 64;
/** 248 is a multiple of both 8 and 31, so taking a byte below it modulo either alphabet length is unbiased. */
const UNBIASED_LIMIT = 248;

export function isPlaceId(value: string): boolean {
  return ID_PATTERN.test(value) && /[2-9]/.test(value);
}

export function isPlatformPlaceId(value: string): boolean {
  return isPlaceId(value) && /^[2-9]/.test(value);
}

/** The URL's name part is cut to this many characters, so a business URL stays readable. */
export const PLACE_URL_SLUG_MAX = 70;
/** A staff URL change must say why, in a sentence that fits the staff console's audit list. */
export const PLACE_URL_CHANGE_REASON_MIN = 3;
export const PLACE_URL_CHANGE_REASON_MAX = 300;
const KEBAB_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The URL's {city} part: kebab-case, as directory_places_city_slug_check requires. */
export function isPlaceCitySlug(value: string): boolean {
  return KEBAB_PATTERN.test(value);
}

/** The URL's {name} part: kebab-case and at most PLACE_URL_SLUG_MAX long, as directory_places_url_slug_check requires. */
export function isPlaceUrlSlug(value: string): boolean {
  return value.length <= PLACE_URL_SLUG_MAX && KEBAB_PATTERN.test(value);
}

/**
 * 3 to 300 characters (directory_place_url_changes_reason_check), and more than blank space. Counted in code points,
 * as Postgres char_length counts them, not UTF-16 units, so an emoji is one character here as it is there.
 */
export function isPlaceUrlChangeReason(value: string): boolean {
  return (
    [...value].length <= PLACE_URL_CHANGE_REASON_MAX && [...value.trim()].length >= PLACE_URL_CHANGE_REASON_MIN
  );
}

/**
 * A listing's slug (kebab-case, up to 80 characters) as the URL's name part: cut to PLACE_URL_SLUG_MAX characters, with
 * no hyphen left dangling at the cut.
 */
export function toPlaceUrlSlug(slug: string): string {
  return slug.slice(0, PLACE_URL_SLUG_MAX).replace(/-+$/, "");
}

/**
 * A business's URL carries this code, not its id: the id is shown only to the signed-in owner. The code is HMAC-SHA256
 * of the id under DIRECTORY_URL_KEY, written in the place-id alphabet. The website builds the same code
 * (website-listing lib/business-url-code.ts); the shared test vector keeps the two equal. The key can never change
 * once URLs are public, or every business URL changes.
 */
export const BUSINESS_URL_CODE_LENGTH = 10;
/** Shortest DIRECTORY_URL_KEY accepted, as on the website. */
export const DIRECTORY_URL_KEY_MIN_LENGTH = 32;
/**
 * The key business URL codes are built with while DIRECTORY_URL_KEY is not set: the website's own interim key
 * (website-listing lib/server/env.ts INTERIM_DIRECTORY_URL_KEY, user, 2026-10-05), so both build the same URLs until
 * the real key is set in both, together.
 */
export const INTERIM_DIRECTORY_URL_KEY = "firstfold-interim-business-url-key-2026-10-05";
const BUSINESS_URL_CODE_PATTERN = new RegExp(`^[${PLACE_ID_ALPHABET}]{${BUSINESS_URL_CODE_LENGTH}}$`);

/**
 * DIRECTORY_URL_KEY from `env`, or the interim key while it is unset or blank. A key that is set but short is a
 * configuration mistake and throws: every business URL built with the wrong key would be a different, broken URL.
 */
export function directoryUrlKeyFrom(env: Readonly<Record<string, string | undefined>>): string {
  const key = env.DIRECTORY_URL_KEY?.trim() ?? "";
  if (key === "") return INTERIM_DIRECTORY_URL_KEY;
  if (key.length < DIRECTORY_URL_KEY_MIN_LENGTH) {
    throw new Error(`DIRECTORY_URL_KEY is shorter than ${String(DIRECTORY_URL_KEY_MIN_LENGTH)} characters: business URLs can't be built`);
  }
  return key;
}

/** The URL code of `placeId` under `key`, rejection-sampled from the HMAC digest so every character is equally likely. */
export function businessUrlCodeWith(key: string, placeId: string): string {
  const digest = createHmac("sha256", key).update(placeId).digest();
  let code = "";
  for (let index = 0; code.length < BUSINESS_URL_CODE_LENGTH; index += 1) {
    const byte = digest[index];
    if (byte === undefined) throw new Error("business URL code: digest too short");
    if (byte < UNBIASED_LIMIT) code += PLACE_ID_ALPHABET.charAt(byte % PLACE_ID_ALPHABET.length);
  }
  return code;
}

/** The URL code of `placeId` under this process's DIRECTORY_URL_KEY. */
export function businessUrlCode(placeId: string): string {
  return businessUrlCodeWith(directoryUrlKeyFrom(process.env), placeId);
}

export function isBusinessUrlCode(value: string): boolean {
  return BUSINESS_URL_CODE_PATTERN.test(value);
}

/** A business's page on the website: /in/<state>/business/<name>/<code>. The code finds it; the name is a label. */
export function placeUrlPath(place: { readonly id: string; readonly stateCode: string; readonly urlSlug: string }): string {
  return `/in/${place.stateCode}/business/${place.urlSlug}/${businessUrlCode(place.id)}`;
}

/** The name and code of a business page's path, /in/<state>/business/<name>/<code>; null for any other path. */
export function businessPagePathParts(path: string): { readonly urlSlug: string; readonly code: string } | null {
  const [prefix, state, business, urlSlug, code, ...rest] = path.replace(/^\/+|\/+$/g, "").split("/");
  if (prefix !== "in" || business !== "business" || rest.length > 0) return null;
  if (state === undefined || !/^[a-z]{2}$/.test(state) || urlSlug === undefined || code === undefined) return null;
  if (!isPlaceUrlSlug(urlSlug) || !isBusinessUrlCode(code)) return null;
  return { urlSlug, code };
}

/** One unbiased pick from `alphabet`; bytes at or above UNBIASED_LIMIT are re-drawn. */
function pick(alphabet: string, take: () => number): string {
  for (;;) {
    const byte = take();
    if (byte < UNBIASED_LIMIT) return alphabet.charAt(byte % alphabet.length);
  }
}

/** A fresh id for a business created on the platform (a client's listing, an owner-added business). */
export function newPlatformPlaceId(): string {
  const pool = randomBytes(POOL_BYTES);
  let at = 0;
  const take = (): number => {
    if (at >= pool.length) {
      pool.set(randomBytes(POOL_BYTES));
      at = 0;
    }
    const byte = pool[at];
    at += 1;
    if (byte === undefined) throw new Error("randomBytes returned a short buffer");
    return byte;
  };
  let id = pick(DIGITS, take);
  while (id.length < PLACE_ID_LENGTH) id += pick(PLACE_ID_ALPHABET, take);
  return id;
}
