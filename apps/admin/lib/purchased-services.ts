import type { AddOnSubscription, BundledAddOn } from "@brandbasket/db";

/**
 * Whether the client has ever had the Managed Website, in any state: staff still run the hosting, the site token and the
 * build for a client whose plan lapsed, was paused or is ending, so only a client who never had a website loses these
 * controls (a Social-only or Search-only client). Pure: the rows come from listBundledAddOnsForBusiness and
 * listAddOnSubscriptionsForBusiness.
 */
export function isWebsiteBoughtFrom(
  bundled: readonly Pick<BundledAddOn, "addOn" | "status" | "endRequestedAt">[],
  subscriptions: readonly Pick<AddOnSubscription, "addOn" | "status">[],
): boolean {
  return bundled.some((row) => row.addOn === "managed-website") || subscriptions.some((row) => row.addOn === "managed-website");
}
