// packages/billing/scripts/create-razorpay-plans.ts
//
// One-off: creates the two Razorpay Plans (USD and INR) this app charges against, and prints their ids so they can
// be written into plans.provider_plan_id (see docs/superpowers/plans/2026-09-18-razorpay-billing-provider.md, Task
// 2). Last run for the 2026-09 prices, $69 and ₹2,999 plus GST. Run once per Razorpay account (test mode, then again in live mode before going live). Re-running it creates
// duplicate plans at Razorpay rather than reusing existing ones, because the Plans API has no "find by name": check
// the dashboard first if you are not sure whether this has already been run.
//
// Usage: RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... pnpm --filter @fynix/billing exec tsx scripts/create-razorpay-plans.ts

import Razorpay from "razorpay";
import { chargedAmountCents, GST_BASIS_POINTS, NO_TAX } from "../src/tax";

interface PlanToCreate {
  readonly code: string;
  readonly currency: "USD" | "INR";
  /** The net monthly price in minor units. Must match plans.recurring_amount_cents in the database. */
  readonly netAmountCents: number;
  /** Must match plans.tax_rate_basis_points. */
  readonly taxRateBasisPoints: number;
}

// Kept in sync with packages/db/migrations/0039_plans_69_and_2999.sql. Both plans are monthly from the first payment,
// so a Razorpay Plan's amount is the one price for the first charge and every renewal. That amount is the TAXED
// figure, worked out by chargedAmountCents, because it is what Razorpay takes: the INR plan is ₹2,999 plus 18% GST.
const PLANS_TO_CREATE: readonly PlanToCreate[] = [
  { code: "care-usd-2026-09", currency: "USD", netAmountCents: 6_900, taxRateBasisPoints: NO_TAX },
  { code: "care-inr-2026-09", currency: "INR", netAmountCents: 299_900, taxRateBasisPoints: GST_BASIS_POINTS },
];

async function main(): Promise<void> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (keyId === undefined || keySecret === undefined) {
    throw new Error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before running this script.");
  }
  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });

  for (const plan of PLANS_TO_CREATE) {
    const amount = chargedAmountCents(plan.netAmountCents, 0, plan.taxRateBasisPoints);
    const created = await client.plans.create({
      period: "monthly",
      interval: 1,
      item: {
        name: `Subscription plan (${plan.currency})`,
        amount,
        currency: plan.currency,
      },
      notes: { fynixPlanCode: plan.code },
    });
    console.log(`${plan.code}: ${created.id} (${amount} minor units)`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
