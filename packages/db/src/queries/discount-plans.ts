import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { providerDiscountPlans, type BillingProviderName } from "../schema";
import { isUuid } from "./tenant";

type Runner = Database | ScopedTransaction;

/** A base plan with a discount taken off, at one provider. */
export interface DiscountPlanKey {
  readonly planId: string;
  /** Off the base plan's net monthly price, in its minor units. Greater than 0. */
  readonly discountAmountCents: number;
  readonly provider: BillingProviderName;
}

/** The provider's plan already made for this base plan and discount, or null. Staff connection only. */
export async function findProviderDiscountPlan(db: Runner, key: DiscountPlanKey): Promise<string | null> {
  if (!isUuid(key.planId)) return null;
  const rows = await db
    .select({ providerPlanId: providerDiscountPlans.providerPlanId })
    .from(providerDiscountPlans)
    .where(
      and(
        eq(providerDiscountPlans.planId, key.planId),
        eq(providerDiscountPlans.discountAmountCents, key.discountAmountCents),
        eq(providerDiscountPlans.provider, key.provider),
      ),
    )
    .limit(1);
  return rows[0]?.providerPlanId ?? null;
}

/**
 * Remembers the provider's plan made for this base plan and discount, and returns the one to use. Two checkouts
 * making the same plan at once both reach here: the first insert wins, the second writes nothing, and both get the
 * winner's id back, so every member on this discount ends up on one provider plan. The loser's provider plan is
 * simply never used.
 */
export async function saveProviderDiscountPlan(
  db: Runner,
  key: DiscountPlanKey & { readonly providerPlanId: string },
): Promise<string> {
  await db.insert(providerDiscountPlans).values(key).onConflictDoNothing();
  const saved = await findProviderDiscountPlan(db, key);
  if (saved === null) throw new Error(`Provider discount plan for ${key.planId} less ${key.discountAmountCents} was not saved`);
  return saved;
}
