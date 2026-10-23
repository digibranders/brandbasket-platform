import "server-only";
import { findBillingState, isPackageOfferForfeited, type Plan } from "@brandbasket/db";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import type { MembershipTier } from "@/lib/membership";
import { loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";
import { loadBillingDetailsView } from "./billing-details";
import type { GrantedCustomer } from "./customer-access";
import { getStaffDb } from "./db";
import { getMembershipPlan } from "./membership";
import { codeBasisFor, findLapsedAppliedCode, resolveAppliedDiscount, type AppliedDiscount } from "./referrals";

/** Everything the way to pay for one plan needs, read once for the page that shows it. */
export interface MembershipCheckoutView {
  /** The plan on sale for this tier, or null when none is. */
  readonly plan: Plan | null;
  /**
   * The services this checkout is for, the whole subscription: what the page's address names, or the basket a business that
   * has paid before lapsed with (loadReactivationBasket), the same rule the checkout applies.
   */
  readonly services: readonly MonthlyAddOnId[];
  /** The code in force against the basket's package net, re-validated now, or null. */
  readonly discount: AppliedDiscount | null;
  /** A code that was applied and no longer works against the basket, so the page can say why the price is full. */
  readonly lapsedCode: string | null;
  /** The business has given the package offer up for good: every line is at list, with no ad credit. */
  readonly forfeited: boolean;
  /** The business has paid before: it earns no ad credit. */
  readonly hasEverPaid: boolean;
  /** The invoice details form's state: an account buying its membership cannot open Billing, so the form is offered here. */
  readonly billingDetails: BillingDetailsView | null;
  /**
   * The services offered: `available` to show the package card before the first payment, none after. They are all lines
   * of the one subscription (lib/billing/packages.ts); the plan row itself costs nothing.
   */
  readonly offer: MembershipOffer;
}

export type MembershipOffer =
  | { readonly kind: "none" }
  | { readonly kind: "available" };

/**
 * One plan's checkout for a basket of services, as the customer would pay for it right now. This page's own plan, not
 * the account's: a free account may buy either from the same place. Re-validated on every call, so a code retired since
 * it was applied quietly stops discounting rather than showing a price the checkout would refuse to honour.
 */
export async function loadMembershipCheckout(
  customer: Pick<GrantedCustomer, "tenant" | "billing">,
  tier: MembershipTier,
  requested: readonly MonthlyAddOnId[],
  now: Date,
): Promise<MembershipCheckoutView> {
  const { businessId } = customer.tenant;
  const staffDb = getStaffDb();
  // The plan the business is billed in, as startMembershipCheckoutFor will charge it; rupees when it has no billing state yet.
  const state = await findBillingState(staffDb, businessId);
  const plan = await getMembershipPlan(tier, state?.currency ?? "INR");
  const hasEverPaid = state?.hasEverPaid ?? true;
  const reactivation = hasEverPaid ? await loadReactivationBasket(staffDb, businessId) : null;
  const services = reactivation?.services ?? requested;
  // A reactivation takes no code, so none is looked for against its basket.
  const basis = plan === null || hasEverPaid ? null : codeBasisFor(services, plan.currency);
  const [discount, lapsedCode, forfeited, billingDetails] = await Promise.all([
    basis === null ? null : resolveAppliedDiscount(businessId, basis, now),
    basis === null ? null : findLapsedAppliedCode(businessId, basis, now),
    reactivation?.forfeited ?? isPackageOfferForfeited(staffDb, businessId),
    loadBillingDetailsView(customer),
  ]);
  const offer: MembershipOffer = !hasEverPaid && plan !== null ? { kind: "available" } : { kind: "none" };
  // A code that still works is not lapsed, whatever the second read says.
  return { plan, services, discount, lapsedCode: discount === null ? lapsedCode : null, forfeited, hasEverPaid, billingDetails, offer };
}
