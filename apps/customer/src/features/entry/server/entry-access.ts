import "server-only";
import { findAffiliateByUserId, findBillingState, findBusinessEntry, findClientIntake, findOpenClosureForUser, listMembershipsForUser, withTenantScope } from "@brandbasket/db";
import { AFFILIATE_PATH } from "@brandbasket/shared/lib/affiliate-links";
import { ACTIVE_BUSINESS_COOKIE, decideCustomerAccess, type CustomerAccess, type SessionUser } from "@brandbasket/shared/lib/access";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { summariseBilling } from "@brandbasket/shared/lib/billing/status";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { cookies } from "next/headers";
import { cache } from "react";
import { getAppDb, getStaffDb } from "@/lib/db";
import { isAwaitingFirstPayment } from "@/features/checkout/server/entry";
import { getSessionUser } from "@/lib/session";

/*
 * Who is on an entry page, for the pages that send a signed-in person elsewhere (/login, /signup, /forgot-password). The
 * same reading as src/lib/guards.ts getCustomerAccess, which is not exported. Staff connection: account_closures and the
 * affiliate tables are staff-only, read for the session's own user id only, writing nothing (the exceptions guards.ts
 * already has, for the same rows).
 */

async function readActiveBusinessCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(ACTIVE_BUSINESS_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

export const getEntryAccess = cache(async (): Promise<CustomerAccess> => {
  const user = await getSessionUser();
  if (user === null) return decideCustomerAccess(null, []);
  const closure = await findOpenClosureForUser(getStaffDb(), user.id);
  if (closure !== null) return { kind: "closing", user, eraseAfter: closure.eraseAfter };
  const activeBusinessId = await readActiveBusinessCookie();
  return decideCustomerAccess(user, await listMembershipsForUser(getAppDb(), user.id), activeBusinessId);
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
export async function signedInEntry(namesPlan: boolean, next?: string | null): Promise<SignedInEntry> {
  const access = await getEntryAccess();
  switch (access.kind) {
    case "signed-out":
      return null;
    case "granted":
      return { kind: "elsewhere", href: next ?? (namesPlan ? "/checkout" : "/") };
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

/** A signed-in owner whose sign-up has not paid: what /signup needs to show them the Pay screen instead of sending them away. */
export interface UnpaidSignupOwner {
  /** The currency the business is billed in, which prices the screen (never the visitor's header). */
  readonly currency: MoneyCurrency;
  /** The basket the questions were last asked for, catalogue ids, when one was saved. */
  readonly savedServices: readonly string[];
}

/**
 * The signed-in owner of a sign-up account that chose Managed Website and has not paid, or null for anyone else (a paid or
 * lapsed member, a team member, a client invited by staff, nobody signed in). Reads through row-level security for the session's
 * own business.
 */
export async function unpaidSignupOwner(): Promise<UnpaidSignupOwner | null> {
  const access = await getEntryAccess();
  if (access.kind !== "granted" || access.tenant.role !== "owner") return null;
  const { tenant } = access;
  const { entry, state, intake } = await withTenantScope(getAppDb(), tenant, async (tx) => ({
    entry: await findBusinessEntry(tx, tenant.businessId),
    state: await findBillingState(tx, tenant.businessId),
    intake: await findClientIntake(tx, tenant.businessId),
  }));
  if (entry === null || state === null || !isAwaitingFirstPayment(entry)) return null;
  if (summariseBilling(state, new Date()).status !== "unpaid") return null;
  return { currency: state.currency, savedServices: intake?.askedForServices ?? [] };
}
