import "server-only";
import {
  findAffiliateByUserId,
  findBillingState,
  findOpenClosureForUser,
  listBoughtSetupServices,
  listMembershipsForUser,
  withTenantScope,
  type Affiliate,
  type BillingCurrency,
} from "@brandbasket/db";
import { decideCustomerAccess, type CustomerAccess, type SessionUser, type TenantContext } from "@brandbasket/shared/lib/access";
import { summariseBilling, type CustomerBilling } from "@brandbasket/shared/lib/billing/status";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAppDb, getStaffDb } from "./db";
import { accessRedirect, GUARD_PATHS, requirementRedirect, servicesFrom, signInHref, type Requirement, type Service } from "./guard-rules";
import { getSessionUser } from "./session";

/*
 * Every page, route handler and server action calls one of these itself: layouts render independently, so a layout's
 * check never protects a page. Each returns a typed context or redirects (Next's redirect works from actions too). The
 * business always comes from the session, never from a parameter or a form.
 */

export type { Service } from "./guard-rules";

export interface SignedInContext {
  readonly user: SessionUser;
}

export interface CustomerContext {
  readonly user: SessionUser;
  /** Pass to withTenantScope and to shared server functions that take a TenantContext. */
  readonly tenant: TenantContext;
  readonly businessId: string;
  readonly businessName: string;
  readonly role: TenantContext["role"];
  /** Whether and how the business has paid, from the shared billing summary. Read for display; writes use a `live` guard. */
  readonly billing: CustomerBilling;
  /** The services on the plan, in catalogue order. */
  readonly services: readonly Service[];
  /** INR prices include GST; USD prices never mention it. */
  readonly currency: BillingCurrency;
}

export interface AffiliateContext {
  readonly user: SessionUser;
  readonly affiliate: Affiliate;
}

/** For a write action: also demand a paid period running now (unpaid goes to checkout, lapsed to Plan & billing). */
export interface GuardOptions {
  readonly write?: boolean;
}

/** The signed-in customer's business could not be read back, which membership should make impossible. */
export class CustomerBusinessMissingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} is not visible to its own member.`);
    this.name = "CustomerBusinessMissingError";
  }
}

/** The session and the business it belongs to, read once per request. A closing account counts as having no workspace. */
const getCustomerAccess = cache(async (): Promise<CustomerAccess> => {
  const user = await getSessionUser();
  if (user === null) return decideCustomerAccess(null, []);
  // Staff connection: account_closures is staff-only. Sanctioned in ./db.ts.
  const closure = await findOpenClosureForUser(getStaffDb(), user.id);
  if (closure !== null) return { kind: "closing", user, eraseAfter: closure.eraseAfter };
  return decideCustomerAccess(user, await listMembershipsForUser(getAppDb(), user.id));
});

/** Billing and services for one business, read once per request through row-level security. */
const loadCustomerContext = cache(async (user: SessionUser, tenant: TenantContext): Promise<CustomerContext> => {
  const { state, setupServices } = await withTenantScope(getAppDb(), tenant, async (tx) => ({
    state: await findBillingState(tx, tenant.businessId),
    setupServices: await listBoughtSetupServices(tx, tenant.businessId),
  }));
  if (state === null) throw new CustomerBusinessMissingError(tenant.businessId);
  return {
    user,
    tenant,
    businessId: tenant.businessId,
    businessName: tenant.businessName,
    role: tenant.role,
    billing: summariseBilling(state, new Date()),
    services: servicesFrom(state.addOns, setupServices),
    currency: state.currency,
  };
});

async function currentRequestPath(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-pathname");
  } catch {
    return null;
  }
}

async function requireCustomerWith(requirement: Requirement): Promise<CustomerContext> {
  const access = await getCustomerAccess();
  const path = await currentRequestPath();
  const away = accessRedirect(access, path);
  if (away !== null || access.kind !== "granted") redirect(away ?? GUARD_PATHS.signIn);
  const context = await loadCustomerContext(access.user, access.tenant);
  const elsewhere = requirementRedirect(context, requirement);
  if (elsewhere !== null) redirect(elsewhere);
  return context;
}

const paid = (options: GuardOptions): Requirement["paid"] => (options.write === true ? "live" : "ever");

/** Anyone signed in, with or without a business: the entry screens before payment. */
export async function requireSignedIn(): Promise<SignedInContext> {
  const user = await getSessionUser();
  if (user === null) {
    const path = await currentRequestPath();
    redirect(signInHref(path));
  }
  return { user };
}

/** A member of a business, whatever its billing: Home, Requests, Plan & billing, Settings, Help. */
export async function requireCustomer(): Promise<CustomerContext> {
  return requireCustomerWith({});
}

/** The business has paid at least once (lapsed keeps reading). With `write`, a paid period must be running now. */
export async function requirePaid(options: GuardOptions = {}): Promise<CustomerContext> {
  return requireCustomerWith({ paid: paid(options) });
}

/** A paid period is running now: the guard for every write that needs the plan. Same as requirePaid({ write: true }). */
export async function requireBilling(): Promise<CustomerContext> {
  return requireCustomerWith({ paid: "live" });
}

/** The business's owner (not an editor): receipts, team, closing the account. Others are sent Home. */
export async function requireOwner(options: GuardOptions = {}): Promise<CustomerContext> {
  return requireCustomerWith({ owner: true, ...(options.write === true ? { paid: "live" } : {}) });
}

/** The Managed Website is bought: the Website pages. Others are sent Home. With `write`, billing's own website rule. */
export async function requireWebsite(options: GuardOptions = {}): Promise<CustomerContext> {
  return requireCustomerWith({ paid: paid(options), service: "website" });
}

/**
 * The service is bought. For actions inside a service: Social & Ads and Local SEO + AEO pages show "Not bought" instead
 * of redirecting, so those pages use requirePaid and read `services`.
 */
export async function requireService(service: Service, options: GuardOptions = {}): Promise<CustomerContext> {
  return requireCustomerWith({ paid: paid(options), service });
}

/** The signed-in user is an affiliate. The affiliate comes from the session's user and nothing else. */
export async function requireAffiliate(): Promise<AffiliateContext> {
  const user = await getSessionUser();
  if (user === null) {
    const path = await currentRequestPath();
    redirect(signInHref(path));
  }
  // Staff connection: the affiliate tables are staff-only. Sanctioned in ./db.ts.
  const affiliate = await findAffiliateByUserId(getStaffDb(), user.id);
  if (affiliate === null) redirect(GUARD_PATHS.signIn);
  return { user, affiliate };
}
