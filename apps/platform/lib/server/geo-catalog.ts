import "server-only";
import { refreshGeoCatalog } from "@fynix/shared/lib/directory/geo-catalog-source";
import { getAppDb } from "@/lib/server/db";

/**
 * Brings the places and categories in this process up to date with the geography catalog when GEO_CATALOG_SOURCE=db
 * (a no-op otherwise). Call it before reading the lists in @fynix/shared/lib/directory/places or checking a
 * district against OPENED_DISTRICTS: the layouts of the signed-in pages and the actions that take a place or a
 * category do. The customer connection reads it: the catalog tables have no row-level security (migration 0113).
 */
export async function ensureGeoCatalog(): Promise<void> {
  await refreshGeoCatalog(getAppDb());
}
