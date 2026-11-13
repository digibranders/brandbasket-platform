import "server-only";
import { listAdCampaigns, listMonthlySnapshots, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { unstable_rethrow } from "next/navigation";
import { monthKey, monthName } from "@/lib/overview";
import { adsView, campaignRows, type AdsView, type CampaignRow } from "@/lib/social/ads";
import { getAppDb } from "./db";

export interface AdsData {
  readonly month: string;
  readonly ads: AdsView | null;
  readonly campaigns: readonly CampaignRow[];
  /** True when the figures could not be read: the page says so rather than claiming none were entered. */
  readonly unavailable: boolean;
}

/**
 * The month's ad figures and campaigns that staff entered in the console. Both tables are readable by the customer's own
 * role (bb_app, row-level security on the business), so this runs under withTenantScope and never the staff connection.
 */
export async function loadAds(tenant: TenantContext, currency: MoneyCurrency, now: Date): Promise<AdsData> {
  const month = monthKey(now);
  try {
    const { snapshots, campaigns } = await withTenantScope(getAppDb(), tenant, async (tx) => ({
      snapshots: await listMonthlySnapshots(tx, tenant.businessId, month),
      campaigns: await listAdCampaigns(tx, tenant.businessId, month),
    }));
    return {
      month: monthName(now),
      ads: adsView(snapshots.find((row) => row.service === "social") ?? null, currency),
      campaigns: campaignRows(campaigns, currency),
      unavailable: false,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[ads] could not read the ad figures", errorLogInfo(error));
    return { month: monthName(now), ads: null, campaigns: [], unavailable: true };
  }
}
