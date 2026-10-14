import "server-only";
import { findOpenClosureForUser, listMembershipsForUser } from "@fynix/db";
import { cache } from "react";
import { decideCustomerAccess, type CustomerAccess, type TenantContext } from "@fynix/shared/lib/access";
import { getAppDb, getStaffDb } from "./db";
import { getSessionUser } from "./session";

/**
 * The session and the business it belongs to, read once per request: or that the account is closing (a deletion was
 * asked for), which every page treats as having no dashboard. Reads no billing: pages that show or depend on
 * payment use requireCustomerAccess (./customer-access) instead.
 */
export const getCustomerAccess = cache(async (): Promise<CustomerAccess> => {
  const user = await getSessionUser();
  if (user === null) return decideCustomerAccess(null, []);
  // An account that asked to be deleted is locked, whatever else is true of it, until it is restored or erased.
  const closure = await findOpenClosureForUser(getStaffDb(), user.id);
  if (closure !== null) return { kind: "closing", user, eraseAfter: closure.eraseAfter };
  return decideCustomerAccess(user, await listMembershipsForUser(getAppDb(), user.id));
});

/**
 * The signed-in customer's business, or null for anyone without one: the session and membership only, with no
 * billing read. For the routes that serve or accept a business's own images (media GET and the upload route), which
 * answer a bare status instead of redirecting and whose access does not depend on payment.
 */
export async function getCustomerTenant(): Promise<TenantContext | null> {
  const access = await getCustomerAccess();
  return access.kind === "granted" ? access.tenant : null;
}
