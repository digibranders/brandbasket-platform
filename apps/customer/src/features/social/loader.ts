import "server-only";
import {
  latestMonthlyReport,
  latestSocialReach,
  listAdCampaigns,
  listConnectedAccounts,
  listDeliverablesForBusiness,
  listMonthlySnapshots,
  listWaitingPosts,
  withTenantScope,
} from "@brandbasket/db";
import { getAppDb } from "@/lib/db";
import { loadLiveAccounts } from "./accounts/loader";
import { postingServiceSettings, type Platform } from "./analytics/rules";
import type { CustomerContext } from "@/lib/guards";
import {
  accountRows,
  adsView,
  campaignRows,
  monthKey,
  monthName,
  postViews,
  postWindow,
  reachView,
  reportHref,
  type AccountRow,
  type AdsView,
  type CampaignRow,
  type PostView,
  type ReachView,
} from "./rules";

type Reader = Pick<CustomerContext, "tenant" | "businessId" | "businessName">;

/*
 * One function per panel. Each throws when its read fails; the screen wraps it in `load`, so a failed read becomes that
 * panel's error state and never an empty list (the old app's quietly() turned a failed read into "No posts are waiting").
 */

export interface PostsView {
  /** This month's posts plus the rest of the current week, and any post waiting for the customer whatever its day. */
  readonly posts: readonly PostView[];
  readonly month: string;
}

export async function loadPosts(customer: Reader, now: Date): Promise<PostsView> {
  const window = postWindow(now);
  const rows = await withTenantScope(getAppDb(), customer.tenant, (tx) =>
    listDeliverablesForBusiness(tx, customer.businessId, { service: "social", from: window.from, to: window.to }),
  );
  return { posts: postViews(rows), month: monthName(now) };
}

/** How many posts wait for the customer's OK and the earliest day among them: the tab count here, and Home's "Needs you" row. */
export async function loadWaitingPostCount(customer: Reader): Promise<{ readonly count: number; readonly byDueOn: string | null }> {
  const waiting = postViews(await withTenantScope(getAppDb(), customer.tenant, (tx) => listWaitingPosts(tx, customer.businessId)));
  return { count: waiting.length, byDueOn: waiting.map((post) => post.dueOn).sort()[0] ?? null };
}

export interface AdsData {
  readonly ads: AdsView | null;
  readonly month: string;
}

/** The month's ad figures staff entered in `monthly_snapshots`, and the ad money on the subscription. Null `ads` when none is known. */
export async function loadAds(customer: Reader & Pick<CustomerContext, "billing" | "currency">, now: Date): Promise<AdsData> {
  const snapshots = await withTenantScope(getAppDb(), customer.tenant, (tx) => listMonthlySnapshots(tx, customer.businessId, monthKey(now)));
  return {
    ads: adsView({
      snapshot: snapshots.find((row) => row.service === "social") ?? null,
      adCreditCents: customer.billing.subscription?.adCreditCents ?? 0,
      currency: customer.currency,
    }),
    month: monthName(now),
  };
}

export interface CampaignsData {
  readonly campaigns: readonly CampaignRow[];
  readonly month: string;
}

/** The month's ad campaigns staff entered in `ad_campaign_snapshots`; an empty list when there are none. */
export async function loadCampaigns(customer: Reader & Pick<CustomerContext, "currency">, now: Date): Promise<CampaignsData> {
  const rows = await withTenantScope(getAppDb(), customer.tenant, (tx) => listAdCampaigns(tx, customer.businessId, monthKey(now)));
  return { campaigns: campaignRows(rows, customer.currency), month: monthName(now) };
}

/** The newest month with social reach figures staff entered in `monthly_snapshots`, or null when there are none. */
export async function loadReach(customer: Reader, now: Date): Promise<ReachView | null> {
  const row = await withTenantScope(getAppDb(), customer.tenant, (tx) => latestSocialReach(tx, customer.businessId));
  return reachView(row, now);
}

/** The latest monthly report's link (staff paste it; https only), or null. */
export async function loadReportLink(customer: Reader, service: "social" | "search"): Promise<string | null> {
  const report = await withTenantScope(getAppDb(), customer.tenant, (tx) => latestMonthlyReport(tx, customer.businessId, service));
  return reportHref(report?.url);
}

export async function loadAccounts(customer: Pick<CustomerContext, "tenant">): Promise<readonly AccountRow[]> {
  return accountRows(await withTenantScope(getAppDb(), customer.tenant, (tx) => listConnectedAccounts(tx)));
}

export interface ChannelsColumnRow {
  readonly id: string;
  readonly platform: Platform;
  readonly account: string;
  /** "Ends in 5 days" when the connection ends soon or has, else null. Only a live connection has an end. */
  readonly ending: string | null;
  readonly paused: boolean;
}

export interface ChannelsColumnData {
  readonly rows: readonly ChannelsColumnRow[];
  /** The networks with no account yet, which get a Connect button. Empty without a posting service. */
  readonly missing: readonly Platform[];
  /** True when the rows come from the posting service, so the person can connect and reconnect here. */
  readonly live: boolean;
}

/**
 * The accounts down the side of the Social media pages. With a posting service on this server they are the accounts posts
 * really go to, and the person can connect more; without one, the accounts staff keep in the database, read only.
 */
export async function loadChannelsColumn(customer: Reader, now: Date): Promise<ChannelsColumnData> {
  if (postingServiceSettings(process.env) !== null) {
    const live = await loadLiveAccounts(customer, now);
    return { rows: live.rows.map((row) => ({ id: row.id, platform: row.platform, account: row.account, ending: row.ending, paused: row.paused })), missing: live.missing, live: true };
  }
  const rows = await loadAccounts(customer);
  const shown = rows.flatMap((row): ChannelsColumnRow[] => {
    const platform = row.platform === "google_business" ? "google" : row.platform;
    return platform === "instagram" || platform === "facebook" || platform === "linkedin" || platform === "google" ? [{ id: row.platform, platform, account: row.handle ?? row.label, ending: null, paused: false }] : [];
  });
  return { rows: shown, missing: [], live: false };
}
