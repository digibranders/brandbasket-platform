import "server-only";
import type { BillingProvider } from "@firstfold/billing";
import type { BillingProviderName } from "@firstfold/db";
import { describeError, logBillingEvent } from "./billing-log";

export interface ProviderSubscriptionToCancel {
  readonly businessId: string;
  /** Our subscription row, when there is one (an orphaned checkout has none). */
  readonly subscriptionId: string | null;
  readonly provider: BillingProviderName;
  readonly providerSubscriptionId: string;
}

/**
 * Cancels a subscription at the provider after our own database change has committed, so a checkout we replaced (or
 * never managed to record) can no longer take money. It never throws: our database is already right, and a failure
 * here is logged for staff to finish at the provider by hand.
 *
 * A subscription opened at a provider other than the current one (a fake checkout left over after switching to
 * Razorpay, say) cannot be cancelled from here, and is logged the same way. A manual subscription has nothing at any
 * provider to cancel.
 */
export async function cancelAtProvider(provider: BillingProvider, target: ProviderSubscriptionToCancel): Promise<void> {
  if (target.provider === "manual") return;
  const fields = {
    businessId: target.businessId,
    subscriptionId: target.subscriptionId,
    provider: target.provider,
    providerSubscriptionId: target.providerSubscriptionId,
  };
  if (target.provider !== provider.name) {
    logBillingEvent("error", "provider-cancel-failed", {
      ...fields,
      errorName: "ProviderNotConfigured",
      errorMessage: `The subscription belongs to ${target.provider}, but ${provider.name} is configured.`,
    });
    return;
  }
  try {
    await provider.cancelSubscription(target.providerSubscriptionId);
  } catch (error) {
    logBillingEvent("error", "provider-cancel-failed", { ...fields, ...describeError(error) });
  }
}
