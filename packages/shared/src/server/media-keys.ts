/*
 * The names under which media is stored, and the checks every storage adapter makes before it touches a key. Kept
 * apart from the adapters (media-storage.ts for local disk, r2-media-storage.ts for the bucket) so both refuse exactly
 * the same keys and content types.
 */

/** A storage key that is malformed or would resolve outside the storage root. */
export class InvalidMediaKeyError extends Error {
  constructor(reason: string) {
    super(`Refusing media storage key: ${reason}.`);
    this.name = "InvalidMediaKeyError";
  }
}

/** `display` is a picture, as stored; `w320` and `w640` are its smaller copies. */
export const MEDIA_VARIANTS = ["display", "w320", "w640"] as const;
export type MediaVariant = (typeof MEDIA_VARIANTS)[number];

/**
 * The smaller copies made of a picture when it is uploaded, by their width in pixels. `display` stays the full picture;
 * a copy exists only for a picture wider than it (a 640 px photo has a 320 px copy, not a 640 px one).
 */
export const PICTURE_COPY_WIDTHS = [320, 640] as const;
export type PictureCopyWidth = (typeof PICTURE_COPY_WIDTHS)[number];

/** Whether `value` is one of the widths a picture is copied to. */
export function isPictureCopyWidth(value: number): value is PictureCopyWidth {
  return (PICTURE_COPY_WIDTHS as readonly number[]).includes(value);
}

const DISPLAY_SUFFIX = "/display";

/** The key of a picture's copy at `width`, or null when `displayKey` is not a picture's `display` key. */
export function pictureCopyKey(displayKey: string, width: PictureCopyWidth): string | null {
  if (!displayKey.endsWith(DISPLAY_SUFFIX)) return null;
  return `${displayKey.slice(0, -DISPLAY_SUFFIX.length)}/w${String(width)}`;
}

/**
 * Every key that belongs to the picture a `display` key names: that key and all its possible copies. Any other key
 * (a video, a poster, a copy itself) is returned alone. Deleting a picture goes through this, so its copies never
 * outlive it, whether or not they were ever made.
 */
export function keysOfPicture(key: string): readonly string[] {
  if (!key.endsWith(DISPLAY_SUFFIX)) return [key];
  const copies = PICTURE_COPY_WIDTHS.map((width) => pictureCopyKey(key, width)).filter((copy): copy is string => copy !== null);
  return [key, ...copies];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Slash-separated segments of letters, digits, `_` and `-`. No dots at all, so no `..` and no file extensions. */
const KEY_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const CONTENT_TYPE_PATTERN = /^[a-z]+\/[a-z0-9.+-]+$/;
const MAX_KEY_LENGTH = 512;

/**
 * `t/{businessId}/{mediaId}/{variant}`. Built only from ids the server generated or read from the database; a
 * filename or anything else the customer typed never reaches a key.
 */
export function mediaStorageKey(businessId: string, mediaId: string, variant: MediaVariant): string {
  if (!UUID_PATTERN.test(businessId)) throw new InvalidMediaKeyError("the business id is not a lowercase UUID");
  if (!UUID_PATTERN.test(mediaId)) throw new InvalidMediaKeyError("the media id is not a lowercase UUID");
  if (!MEDIA_VARIANTS.includes(variant)) throw new InvalidMediaKeyError(`unknown variant "${String(variant)}"`);
  return `t/${businessId}/${mediaId}/${variant}`;
}

/**
 * `staff-ads/{pictureId}/display`: where the picture staff uploaded for a staff-placed ad is stored. Built only from the
 * id the server generated; the database holds the same rule as a check on directory_staff_ad_pictures.
 */
export function staffAdPictureKey(pictureId: string): string {
  if (!UUID_PATTERN.test(pictureId)) throw new InvalidMediaKeyError("the picture id is not a lowercase UUID");
  return `staff-ads/${pictureId}/display`;
}

/** Throws unless `key` has the shape of a key mediaStorageKey (or its tests' shorter ones) builds. */
export function validateMediaKey(key: string): void {
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) throw new InvalidMediaKeyError("wrong length");
  if (!KEY_PATTERN.test(key)) throw new InvalidMediaKeyError("unexpected characters");
}

/** Throws unless `contentType` is a plain `type/subtype`, so it can never carry a second header with it. */
export function validateContentType(contentType: string): void {
  if (!CONTENT_TYPE_PATTERN.test(contentType)) {
    throw new Error(`Refusing to store media with content type "${contentType}".`);
  }
}
