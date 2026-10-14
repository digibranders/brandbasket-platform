/**
 * The districts the directory has opened, and the listing key's city part for a business outside them. The
 * implementation lives in @fynix/db (shared depends on db, so db cannot import it from here); it is re-exported
 * from the @fynix/db/opened-districts subpath, not the barrel, so importing it never pulls in drizzle or pg.
 */
export {
  OPENED_DISTRICTS,
  elsewhereCitySlug,
  hasOpenedDistrict,
  isElsewhereCitySlug,
  isOpenedDistrict,
  type OpenedDistrict,
} from "@fynix/db/opened-districts";
