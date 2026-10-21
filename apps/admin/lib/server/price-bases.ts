import type { BillingCurrency } from "@brandbasket/db";
import { addOnTaxRateBasisPoints } from "@brandbasket/shared/lib/billing/add-ons";
import type { PriceBasis } from "@/components/referral-code-form";
import { cheapestServiceListCents } from "./referral-admin";

/**
 * Both currencies' cheapest single service, reduced to what a code's discount is measured against: a code is used on one
 * service, never a package, and the plan row itself costs nothing. The same basis createReferralCodeFor checks a code by.
 */
export function priceBases(): Readonly<Record<BillingCurrency, PriceBasis>> {
  const basis = (currency: BillingCurrency): PriceBasis => ({
    netAmountCents: cheapestServiceListCents(currency),
    taxRateBasisPoints: addOnTaxRateBasisPoints(currency),
  });
  return { USD: basis("USD"), INR: basis("INR") };
}
