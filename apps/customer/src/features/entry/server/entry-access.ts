import "server-only";
import { findAffiliateByUserId, findOpenClosureForUser, listMembershipsForUser } from "@brandbasket/db";
import { AFFILIATE_PATH } from "@brandbasket/shared/lib/affiliate-links";
import { decideCustomerAccess, type CustomerAccess, type SessionUser } from "@brandbasket/shared/lib/access";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { cache } from "react";
import { getAppDb, getStaffDb } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/*
 * Who is on an entry page, for the pages that send a signed-in person elsewhere (/login, /signup, /forgot-password). The
 * same reading as src/lib/guards.ts getCustomerAccess, which is not exported. Staff connection: account_closures and the
 * affiliate tables are staff-only, read for the session's own user id only, writing nothing (the exceptions guards.ts
 * already has, for the same rows).
 */

export const getEntryAccess = cache(async (): Promise<CustomerAccess> => {
  const user = await getSessionUser();
  if (user === null) return decideCustomerAccess(null, []);
  const closure = await findOpenClosureForUser(getStaffDb(), user.id);
  if (closure !== null) return { kind: "closing", user, eraseAfter: closure.eraseAfter };
  return decideCustomerAccess(user, await listMembershipsForUser(getAppDb(), user.id));
});

/** Whether the user is an affiliate. The id comes from the session or a sign-in that just proved it. */
export async function isAffiliate(userId: string): Promise<boolean> {
  return (await findAffiliateByUserId(getStaffDb(), userId)) !== null;
}

/**
 * Where a user who has just signed in lands: their affiliate page when that is all they are, Home otherwise. Ported from
 * apps/platform lib/server/affiliate-access.ts landingForSignedInUser.
 */
export async function landingForSignedInUser(userId: string): Promise<string> {
  if ((await listMembershipsForUser(getAppDb(), userId)).length > 0) return "/";
  return (await isAffiliate(userId)) ? AFFILIATE_PATH : "/";
}

/** What an account is known by on screen: the mobile number it signs in with, or its email (never a placeholder address). */
export function accountLabel(user: Pick<SessionUser, "email" | "phone">): string {
  return user.phone === null ? user.email : displayPhone(user.phone).text;
}

export type SignedInEntry = { readonly kind: "elsewhere"; readonly href: string } | { readonly kind: "no-business"; readonly label: string } | null;

/**
 * Where an entry page sends someone already signed in, or null for someone who is not. A member goes Home, or to checkout
 * when the link names a plan; a closing account goes to restore it; an affiliate with no business to their page; anyone
 * else signed in with no business is told so on the page. Ported from apps/platform app/app-host/login/page.tsx.
 */
export async function signedInEntry(namesPlan: boolean): Promise<SignedInEntry> {
  const access = await getEntryAccess();
  switch (access.kind) {
    case "signed-out":
      return null;
    case "granted":
      return { kind: "elsewhere", href: namesPlan ? "/checkout" : "/" };
    case "closing":
      return { kind: "elsewhere", href: "/restore-account" };
    case "no-business":
      return (await isAffiliate(access.user.id)) ? { kind: "elsewhere", href: AFFILIATE_PATH } : { kind: "no-business", label: accountLabel(access.user) };
    default: {
      const unhandled: never = access;
      throw new Error(`Unhandled customer access: ${JSON.stringify(unhandled)}`);
    }
  }
}
