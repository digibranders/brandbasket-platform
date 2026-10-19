import "server-only";
import { settleDirectoryAds, type AdChargePricing } from "@brandbasket/db";
import { AD_TAX_BASIS_POINTS, adChargeDescription, adChargedPaise } from "@brandbasket/shared/lib/directory/ads";
import { getStaffDb } from "./db";

/** The same wording and tax the platform uses for a won spot's charge (apps/platform/lib/server/directory-ads.ts). */
const AD_CHARGE_PRICING: AdChargePricing = {
  taxRateBasisPoints: AD_TAX_BASIS_POINTS,
  chargedPaise: adChargedPaise,
  describe: adChargeDescription,
};

/**
 * Settles every ad auction and lapse that is due before the staff console shows them, so staff never see an auction
 * that has closed as still open. A failure is logged and the page shows what was settled before.
 */
export async function settleDueAdsForStaff(now: Date): Promise<void> {
  try {
    await settleDirectoryAds(getStaffDb(), now, AD_CHARGE_PRICING);
  } catch (error) {
    console.error("Could not settle directory ad auctions.", error instanceof Error ? error.name : "unknown error");
  }
}
