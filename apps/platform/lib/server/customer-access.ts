import "server-only";
import { findBillingState, findBusinessEntry, withTenantScope, type BusinessEntry, type BusinessKind } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { SessionUser, TenantContext } from "@brandbasket/shared/lib/access";
import { summariseBilling, type CustomerBilling } from "@brandbasket/shared/lib/billing/status";
import { RESTORE_ACCOUNT_PATH } from "@/lib/account-settings-form";
import { membershipPathFor, membershipTierForChoice, type MembershipTier } from "@/lib/membership";
import { getCustomerAccess } from "./customer-tenant";
import { getAppDb } from "./db";

export { getCustomerAccess } from "./customer-tenant";

/** The signed-in customer's business could not be read back, which membership should make impossible. */
export class CustomerBusinessMissingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} is not visible to its own member.`);
    this.name = "CustomerBusinessMissingError";
  }
}

/**
 * The business's billing, read once per request through the tenant-scoped app connection: the layout, the banner
 * and the page all share this result. Keyed on the ids so React's cache can reuse it. Exported (not just used via
 * `requireCustomerAccess`/`requireBillingAccess`) for route handlers that need the same "does this business have
 * an active plan" check without `requireCustomerAccess`'s `redirect("/login")` — a redirect response is useless to
 * a `fetch()` caller (see app/api/content-media-uploads/route.ts, which calls this directly).
 */
export const getCustomerBilling = cache(async (userId: string, businessId: string): Promise<CustomerBilling> => {
  const state = await withTenantScope(getAppDb(), { userId, businessId }, (tx) => findBillingState(tx, businessId));
  if (state === null) throw new CustomerBusinessMissingError(businessId);
  return summariseBilling(state, new Date());
});

export interface GrantedCustomer {
  readonly user: SessionUser;
  readonly tenant: TenantContext;
  /**
   * Whether the business has paid, and the plan to price things from. Read for display: a write action that needs
   * payment must call requireBillingAccess (lib/server/billing.ts) rather than trust a page's earlier reading.
   */
  readonly billing: CustomerBilling;
}

/** The business's kind and what its owner chose at sign-up, read once per request through row-level security. */
export const getCustomerBusinessEntry = cache(async (userId: string, businessId: string): Promise<BusinessEntry> => {
  const entry = await withTenantScope(getAppDb(), { userId, businessId }, (tx) => findBusinessEntry(tx, businessId));
  if (entry === null) throw new CustomerBusinessMissingError(businessId);
  return entry;
});

/** The business's kind: a website client, or a free listing account. */
export async function getCustomerBusinessKind(userId: string, businessId: string): Promise<BusinessKind> {
  return (await getCustomerBusinessEntry(userId, businessId)).kind;
}

/** The page a free listing account is sent to: the Business profile (hours, holidays, announcement). */
export const LISTING_PAGE_PATH = "/details";

/**
 * Where a free listing account lands: its Business profile, the first of the only customer pages it has (Business
 * profile, Advertise, Billing, Premium and Settings).
 */
export const LISTING_ACCOUNT_HOME = LISTING_PAGE_PATH;

/** A free listing account's Advertise page: the weekly ad auction. */
export const ADVERTISE_PATH = "/advertise";

/**
 * The plan a free listing account's owner chose at sign-up and has not paid for yet, or null for an account that is not
 * waiting on one. Such an account has no dashboard until it pays: only that plan's page.
 */
export function awaitedMembershipTier(entry: BusinessEntry): MembershipTier | null {
  return entry.kind === "listing" ? membershipTierForChoice(entry.signupChoice) : null;
}

/** A free listing account whose owner chose Care or Premium and has not paid yet: it has no dashboard until it does. */
export function isAwaitingMembership(entry: BusinessEntry): boolean {
  return awaitedMembershipTier(entry) !== null;
}

export interface CustomerAccessOptions {
  /**
   * `allow` opens the page to free listing accounts (businesses of kind `listing`). Closed by default: every other
   * page is about a website client's plan, project or site, so a listing account is sent to LISTING_ACCOUNT_HOME.
   */
  readonly listingAccount?: "allow";
  /**
   * `allow` opens the page to an account that is awaiting its membership (isAwaitingMembership). Closed by default,
   * even on a page free listing accounts may open: such an account is sent to its plan's page, the one page it has.
   * Only that page, its actions, the layout around it and the payment pages pass this.
   */
  readonly membershipCheckout?: "allow";
}

/** Where the business is sent instead of the page it asked for, or null when the page is its to open. */
export function accessRedirect(entry: BusinessEntry, options: CustomerAccessOptions): string | null {
  const awaited = awaitedMembershipTier(entry);
  if (awaited !== null) return options.membershipCheckout === "allow" ? null : membershipPathFor(awaited);
  if (entry.kind === "listing" && options.listingAccount !== "allow") return LISTING_ACCOUNT_HOME;
  return null;
}

/**
 * Call in every customer page and layout: layouts and pages render independently, so a layout check alone
 * does not protect a page. Anyone without access is sent to /login, which explains why.
 */
export async function requireCustomerAccess(options: CustomerAccessOptions = {}): Promise<GrantedCustomer> {
  const access = await getCustomerAccess();
  if (access.kind === "closing") redirect(RESTORE_ACCOUNT_PATH);
  if (access.kind !== "granted") redirect("/login");
  const entry = await getCustomerBusinessEntry(access.tenant.userId, access.tenant.businessId);
  // Nothing about money is read for an account that is sent away.
  const elsewhere = accessRedirect(entry, options);
  if (elsewhere !== null) redirect(elsewhere);
  const billing = await getCustomerBilling(access.tenant.userId, access.tenant.businessId);
  return { user: access.user, tenant: access.tenant, billing };
}

/**
 * requireCustomerAccess for the website's own pages (onboarding, project, domain, OyeChats, content, details): a paid
 * client without the Managed Website service (Social-only, SEO-only, or a dropped website whose month has ended) is sent
 * Home. An unpaid client passes, because the first payment is taken on these pages, and so does a lapsed one.
 */
export async function requireWebsiteClient(): Promise<GrantedCustomer> {
  const customer = await requireCustomerAccess();
  if (customer.billing.hasAccess && !customer.billing.hasWebsite) redirect("/");
  return customer;
}
