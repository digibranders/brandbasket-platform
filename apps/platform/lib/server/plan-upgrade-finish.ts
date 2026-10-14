import "server-only";
import { findPlanUpgradeByCharge } from "@firstfold/db";
import { describeError, logBillingEvent } from "@firstfold/shared/server/billing-log";
import { finishUpgradeAtProvider } from "@firstfold/shared/server/plan-upgrade";
import { getBillingProvider } from "./billing";
import { getStaffDb } from "./db";
import { ensureDiscountPlan } from "./discount-plans";

/*
 * The step after the money for a move up to Premium (lib/server/plan-upgrade.ts). Its own module because the charge
 * payment path calls it, and the upgrade module calls the charge payment path.
 */

/**
 * The step after the money, run once the payment's transaction has committed: the provider is told to bill Premium from
 * the next renewal. Never throws: the customer has paid and is already Premium, and a failure is logged and flagged for
 * staff (finishUpgradeAtProvider), who finish it from the client page.
 */
export async function finishUpgrade(upgradeId: string, now: Date): Promise<void> {
  try {
    await finishUpgradeAtProvider({ staffDb: getStaffDb(), provider: getBillingProvider(), ensureDiscountPlan }, upgradeId, now);
  } catch (error) {
    logBillingEvent("error", "upgrade-provider-failed", {
      businessId: "unknown",
      subscriptionId: null,
      provider: getBillingProvider().name,
      upgradeId,
      ...describeError(error),
    });
  }
}

/** Finishes the move a just-paid charge bought, if it bought one. Safe to call for any charge and any number of times. */
export async function finishUpgradeForCharge(chargeId: string, now: Date): Promise<void> {
  const upgrade = await findPlanUpgradeByCharge(getStaffDb(), chargeId);
  if (upgrade !== null && upgrade.status === "paid") await finishUpgrade(upgrade.id, now);
}
