import "server-only";
import { latestMonthlyReport, listConnectedAccounts, listDeliverablesForBusiness, listMonthlySnapshots, listWaitingPosts, withTenantScope } from "@brandbasket/db";
import { getAppDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { accountRows, adsView, monthKey, monthName, postViews, postWindow, reportHref, type AccountRow, type AdsView, type PostView } from "./rules";

type Reader = Pick<CustomerContext, "tenant" | "businessId">;

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

/** The latest monthly report's link (staff paste it; https only), or null. */
export async function loadReportLink(customer: Reader, service: "social" | "search"): Promise<string | null> {
  const report = await withTenantScope(getAppDb(), customer.tenant, (tx) => latestMonthlyReport(tx, customer.businessId, service));
  return reportHref(report?.url);
}

export async function loadAccounts(customer: Pick<CustomerContext, "tenant">): Promise<readonly AccountRow[]> {
  return accountRows(await withTenantScope(getAppDb(), customer.tenant, (tx) => listConnectedAccounts(tx)));
}
