import { deploymentBrandShortName } from "../lib/deployment-brand";
import "server-only";
import type { BillingProvider } from "@fynix/billing";
import { findAddOnProviderPlan, saveAddOnProviderPlan, type Database } from "@fynix/db";
import { isMonthlyAddOnId, type AddOn, type AddOnPrice } from "../lib/billing/add-ons";

/**
 * The provider plan a monthly add-on subscription runs on, made the first time an add-on is sold at an amount and
 * reused after that. Each amount needs its own plan because Razorpay charges a plan's amount every cycle: a Premium
 * member's price and the list price are two plans. Null for a provider that needs no plan of its own (the fake
 * provider), in which case nothing is stored.
 *
 * Like ensureDiscountPlanFor, the provider is called with no transaction open. Two checkouts making the same plan at
 * once each create one at the provider; saveAddOnProviderPlan keeps the first and both use it.
 *
 * The plan is priced at the net amount with GST on top, which is what Razorpay takes (AddOnPrice.chargedCents).
 */
export async function ensureAddOnPlan(
  staffDb: Database,
  provider: BillingProvider,
  { addOn, price }: { readonly addOn: AddOn; readonly price: AddOnPrice },
): Promise<string | null> {
  if (!isMonthlyAddOnId(addOn.id)) throw new Error(`Add-on ${addOn.id} is not monthly, so it has no provider plan.`);
  const key = {
    addOn: addOn.id,
    netAmountCents: price.netCents,
    taxRateBasisPoints: price.taxRateBasisPoints,
    currency: "INR",
    provider: provider.name,
  } as const;
  const existing = await findAddOnProviderPlan(staffDb, key);
  if (existing !== null) return existing;

  const created = await provider.createPlan({
    currency: key.currency,
    netMonthlyCents: price.netCents,
    taxRateBasisPoints: price.taxRateBasisPoints,
    code: `addon-${addOn.id}-${price.netCents}`,
    itemName: `${deploymentBrandShortName()} ${addOn.title}`,
  });
  if (created.providerPlanId === null) return null;
  return saveAddOnProviderPlan(staffDb, { ...key, providerPlanId: created.providerPlanId });
}
