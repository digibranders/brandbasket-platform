import "server-only";
import { findAffiliateByUserId, listMembershipsForUser, type Affiliate } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { SessionUser } from "@brandbasket/shared/lib/access";
import { AFFILIATE_PATH } from "@brandbasket/shared/lib/affiliate-links";
import { getAppDb, getStaffDb } from "./db";
import { getSessionUser } from "./session";

/**
 * Whether the signed-in user is an affiliate, and which. The affiliate comes from the session's user and nothing else:
 * no page, form or address ever names one, so an affiliate can only ever see their own figures.
 *
 * Runs on the staff connection, against the rule in ./db.ts, because the affiliate tables are staff-only by design
 * (`bb_app` holds no grant on them) and an affiliate has no business to scope a customer connection under.
 */
export type AffiliateAccess =
  | { readonly kind: "none" }
  | { readonly kind: "granted"; readonly user: SessionUser; readonly affiliate: Affiliate };

export const getAffiliateAccess = cache(async (): Promise<AffiliateAccess> => {
  const user = await getSessionUser();
  if (user === null) return { kind: "none" };
  const affiliate = await findAffiliateByUserId(getStaffDb(), user.id);
  return affiliate === null ? { kind: "none" } : { kind: "granted", user, affiliate };
});

/** Call in the affiliate layout and page: anyone who is not an affiliate is sent to sign in. */
export async function requireAffiliateAccess(): Promise<{ readonly user: SessionUser; readonly affiliate: Affiliate }> {
  const access = await getAffiliateAccess();
  if (access.kind !== "granted") redirect("/login");
  return { user: access.user, affiliate: access.affiliate };
}

/** Whether the user also has a business: their affiliate page then opens inside their own dashboard. */
export async function isAlsoCustomer(userId: string): Promise<boolean> {
  return (await listMembershipsForUser(getAppDb(), userId)).length > 0;
}

/**
 * Where a user who has just signed in lands: their affiliate dashboard when that is all they are, and the home page
 * otherwise (a business owner who is also an affiliate lands in their business, and can open /affiliate from the
 * address).
 */
export async function landingForSignedInUser(userId: string): Promise<string> {
  if (await isAlsoCustomer(userId)) return "/";
  return (await findAffiliateByUserId(getStaffDb(), userId)) === null ? "/" : AFFILIATE_PATH;
}
