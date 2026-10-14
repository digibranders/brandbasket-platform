import "server-only";
import { refreshGeoCatalog } from "@firstfold/shared/lib/directory/geo-catalog-source";
import { createStaffAccess, type GrantedStaff } from "@firstfold/shared/server/staff-access";
import { getStaffDb } from "./db";
import { getSessionUser } from "./session";

export type { GrantedStaff };

const access = createStaffAccess({ getSessionUser, getStaffDb });

/** This app's staff authorisation, over its own session reader and staff connection. */
export const { getStaffAccess } = access;

/**
 * Every staff page and action starts here, so this is also where the places and categories are brought up to date with
 * the geography catalog (a no-op unless GEO_CATALOG_SOURCE=db): the ad and listing forms check against them.
 */
export async function requireStaffAccess(): Promise<GrantedStaff> {
  const granted = await access.requireStaffAccess();
  await refreshGeoCatalog(getStaffDb());
  return granted;
}
