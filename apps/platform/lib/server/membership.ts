import "server-only";
import { findActivePlan, setListingSignupChoice, type BillingCurrency, type Plan } from "@brandbasket/db";
import type { MembershipTier } from "@/lib/membership";
import { cache } from "react";
import type { GrantedCustomer } from "./customer-access";
import { getStaffDb } from "./db";

/*
 * The Care plan and the Premium membership, server side (docs/superpowers/specs/2026-09-30-single-entry-premium-
 * design.md, 2026-10-07-care-plan-design.md). Paying for one is lib/server/checkout.ts (startMembershipCheckoutFor);
 * what the payment then does is activateFirstPayment.
 */

/**
 * The plan on sale in one currency for one tier: what the entry page shows someone who has no account yet, and what a
 * business is offered in the currency it is billed in (rupees in India, dollars elsewhere). On the staff connection,
 * like the public prices (app/api/pricing): a price on sale is published on the website anyway, and this reads nothing
 * about any customer. Null when no plan of that tier is on sale in that currency.
 */
export const getMembershipPlan = cache(
  async (tier: MembershipTier, currency: BillingCurrency): Promise<Plan | null> =>
    findActivePlan(getStaffDb(), currency, tier),
);

/**
 * An owner who chose Care or Premium at sign-up decides to carry on with the free listing instead: their business stops being
 * held on the membership page. False for anything that is not a free listing account. On the staff connection, for the
 * signed-in customer's own business only: customers write nothing to `businesses`.
 */
export async function continueWithFreeListing(customer: Pick<GrantedCustomer, "tenant">): Promise<boolean> {
  return setListingSignupChoice(getStaffDb(), customer.tenant.businessId, "listing_only");
}
