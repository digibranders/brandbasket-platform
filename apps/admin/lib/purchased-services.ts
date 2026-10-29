import type { AddOnSubscription, BundledAddOn } from "@brandbasket/db";

/** Subscription statuses that mean the client pays for an add-on bought after the plan. Same list as the rule behind Social & Ads and Search. */
const PAID_SUBSCRIPTION_STATUSES: readonly string[] = ["active", "scheduled", "past_due"];

/**
 * Whether the client pays for the Managed Website now. A plan line counts while it is pending or active and no end is
 * requested; a later add counts while its subscription is paid. Mirrors boughtSetupServicesFrom in packages/db, which
 * covers Social & Ads and Search. Pure: the rows come from listBundledAddOnsForBusiness and listAddOnSubscriptionsForBusiness.
 */
export function isWebsiteBoughtFrom(
  bundled: readonly Pick<BundledAddOn, "addOn" | "status" | "endRequestedAt">[],
  subscriptions: readonly Pick<AddOnSubscription, "addOn" | "status">[],
): boolean {
  const inPlan = bundled.some(
    (row) => row.addOn === "managed-website" && (row.status === "pending" || row.status === "active") && row.endRequestedAt === null,
  );
  const bought = subscriptions.some((row) => row.addOn === "managed-website" && PAID_SUBSCRIPTION_STATUSES.includes(row.status));
  return inPlan || bought;
}
