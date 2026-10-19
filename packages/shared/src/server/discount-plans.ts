import "server-only";
import { discountPlanCode, type BillingProvider } from "@brandbasket/billing";
import { findProviderBundlePlan, findProviderDiscountPlan, saveProviderBundlePlan, saveProviderDiscountPlan, type Database, type Plan } from "@brandbasket/db";

/**
 * A discounted provider plan charges one amount every cycle. A base plan whose first payment differs from its monthly
 * price cannot be discounted that way: the first charge would not be what the webhook expects of it. Today every plan
 * charges the same amount each month; this stops a future plan that does not from taking money it cannot match.
 */
export class UnevenPlanDiscountError extends Error {
  constructor(planCode: string) {
    super(`Plan ${planCode} charges a different first payment, so a discount cannot run on a single provider plan.`);
    this.name = "UnevenPlanDiscountError";
  }
}

/**
 * The provider plan a discounted subscription runs on, made the first time a discount is used against a base plan
 * and reused after that (docs/superpowers/specs/2026-10-06-affiliates-coupons-design.md). Undefined when there is
 * nothing to discount, or for a provider that needs no plan of its own (the fake provider simply charges less).
 *
 * The provider is called with no transaction open, like every provider call in checkout. Two checkouts making the
 * same plan at once each create one at the provider; saveProviderDiscountPlan keeps the first and both use it.
 *
 * The plan is priced at the recurring price less the discount, with the plan's tax on top, which is exactly what the
 * webhook expects of every payment on the subscription: chargedAmountCents taxes the same figure either way.
 */
export async function ensureDiscountPlanFor(
  staffDb: Database,
  provider: BillingProvider,
  plan: Plan,
  discountAmountCents: number,
  bundledAddOnNetCents = 0,
): Promise<string | undefined> {
  if (discountAmountCents === 0 && bundledAddOnNetCents === 0) return undefined;
  if (plan.initialAmountCents !== plan.recurringAmountCents) throw new UnevenPlanDiscountError(plan.code);
  if (bundledAddOnNetCents > 0) return ensureBundlePlanFor(staffDb, provider, plan, discountAmountCents, bundledAddOnNetCents);
  const key = { planId: plan.id, discountAmountCents, provider: provider.name };
  const existing = await findProviderDiscountPlan(staffDb, key);
  if (existing !== null) return existing;

  const created = await provider.createPlan({
    currency: plan.currency,
    netMonthlyCents: plan.recurringAmountCents - discountAmountCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    code: discountPlanCode(plan.code, discountAmountCents),
  });
  if (created.providerPlanId === null) return undefined;
  return saveProviderDiscountPlan(staffDb, { ...key, providerPlanId: created.providerPlanId });
}

/**
 * The provider plan a subscription with add-ons runs on: one amount a month, the plan's net price plus the add-ons less
 * the discount, with the plan's tax on top. It is the same figure the webhook expects (the plan's price plus the
 * subscription's frozen add-ons, less its frozen discount, through chargedAmountCents), made once per amount.
 */
async function ensureBundlePlanFor(
  staffDb: Database,
  provider: BillingProvider,
  plan: Plan,
  discountAmountCents: number,
  bundledAddOnNetCents: number,
): Promise<string | undefined> {
  const netMonthlyCents = plan.recurringAmountCents + bundledAddOnNetCents - discountAmountCents;
  const key = { planId: plan.id, netMonthlyCents, provider: provider.name };
  const existing = await findProviderBundlePlan(staffDb, key);
  if (existing !== null) return existing;

  const created = await provider.createPlan({
    currency: plan.currency,
    netMonthlyCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    code: `${plan.code}-with-add-ons-${netMonthlyCents}`,
    itemName: `Brandbasket plan with add-ons (${plan.currency})`,
  });
  if (created.providerPlanId === null) return undefined;
  return saveProviderBundlePlan(staffDb, { ...key, providerPlanId: created.providerPlanId });
}
