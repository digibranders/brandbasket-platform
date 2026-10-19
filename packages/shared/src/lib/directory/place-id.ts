/**
 * The permanent directory business id format. Server-only (node:crypto). The implementation lives in @brandbasket/db
 * (shared depends on db, so db cannot import it from here); it is re-exported from the @brandbasket/db/place-id
 * subpath, not the barrel, so importing it never pulls in drizzle or pg.
 */
export {
  PLACE_ID_ALPHABET,
  PLACE_ID_LENGTH,
  PLACE_URL_CHANGE_REASON_MAX,
  PLACE_URL_CHANGE_REASON_MIN,
  PLACE_URL_SLUG_MAX,
  isPlaceCitySlug,
  isPlaceId,
  isPlaceUrlChangeReason,
  isPlaceUrlSlug,
  isPlatformPlaceId,
  newPlatformPlaceId,
  businessPagePathParts,
  businessUrlCode,
  businessUrlCodeWith,
  directoryUrlKeyFrom,
  isBusinessUrlCode,
  placeUrlPath,
  toPlaceUrlSlug,
} from "@brandbasket/db/place-id";
