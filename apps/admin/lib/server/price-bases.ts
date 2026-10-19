import "server-only";
import { findActivePlan, type BillingCurrency } from "@brandbasket/db";
import type { PriceBasis } from "@/components/referral-code-form";
import { getStaffDb } from "./db";

/** Today's Premium price for a currency, reduced to what a code's discount is measured against. Null with no active plan. */
async function priceBasis(currency: BillingCurrency): Promise<PriceBasis | null> {
  const plan = await findActivePlan(getStaffDb(), currency, "premium");
  return plan === null ? null : { netAmountCents: plan.initialAmountCents, taxRateBasisPoints: plan.taxRateBasisPoints };
}

/** Both currencies' prices, for a code form that shows what the member will pay. */
export async function priceBases(): Promise<Readonly<Record<BillingCurrency, PriceBasis | null>>> {
  const [usd, inr] = await Promise.all([priceBasis("USD"), priceBasis("INR")]);
  return { USD: usd, INR: inr };
}
