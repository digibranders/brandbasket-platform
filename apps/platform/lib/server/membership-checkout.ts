import "server-only";
import type { Plan } from "@firstfold/db";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";
import type { MembershipTier } from "@/lib/membership";
import { loadBillingDetailsView } from "./billing-details";
import type { GrantedCustomer } from "./customer-access";
import { getMembershipPlan } from "./membership";
import { findLapsedAppliedCode, resolveAppliedDiscount, type AppliedDiscount } from "./referrals";

/** Everything the way to pay for one plan needs, read once for the page that shows it. */
export interface MembershipCheckoutView {
  /** The plan on sale for this tier, or null when none is. */
  readonly plan: Plan | null;
  /** The code in force against this plan, re-validated now, or null. */
  readonly discount: AppliedDiscount | null;
  /** A code that was applied and no longer works against this plan, so the page can say why the price is full. */
  readonly lapsedCode: string | null;
  /** The invoice details form's state: an account buying its membership cannot open Billing, so the form is offered here. */
  readonly billingDetails: BillingDetailsView | null;
}

/**
 * One plan's checkout, as the customer would pay for it right now. This page's own plan, not the account's: a free
 * account may buy either from the same place. Re-validated on every call, so a code retired since it was applied quietly
 * stops discounting rather than showing a price the checkout would refuse to honour.
 */
export async function loadMembershipCheckout(
  customer: Pick<GrantedCustomer, "tenant" | "billing">,
  tier: MembershipTier,
  now: Date,
): Promise<MembershipCheckoutView> {
  const plan = await getMembershipPlan(tier);
  const { businessId } = customer.tenant;
  const [discount, lapsedCode, billingDetails] = await Promise.all([
    plan === null ? null : resolveAppliedDiscount(businessId, plan, now),
    plan === null ? null : findLapsedAppliedCode(businessId, plan, now),
    loadBillingDetailsView(customer),
  ]);
  // A code that still works is not lapsed, whatever the second read says.
  return { plan, discount, lapsedCode: discount === null ? lapsedCode : null, billingDetails };
}
