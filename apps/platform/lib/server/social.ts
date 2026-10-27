import "server-only";
import { latestMonthlyReport, listBoughtSetupServices, listDeliverablesForBusiness, listMonthlySnapshots, listWaitingPosts, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import type { CustomerBilling } from "@brandbasket/shared/lib/billing/status";
import { monthKey, monthName } from "@/lib/overview";
import { adsPanel, type AdsPanel } from "@/lib/social/ads";
import { monthLine, needsOkBy, postWindow, type PostView } from "@/lib/social/week";
import { getAppDb } from "./db";
import { quietly } from "./quietly";

export interface SocialData {
  readonly posts: readonly PostView[];
  readonly monthLine: string | null;
  readonly ads: AdsPanel | null;
  /** The address of the latest monthly report, when staff have added one. */
  readonly report: string | null;
  /** The month's name, for the headings ("November"). */
  readonly month: string;
}

type DeliverableRow = Awaited<ReturnType<typeof listWaitingPosts>>[number];

/** A post row as the page reads it. A row with no day is left out: the database requires one for a post, so none should exist. */
function postViews(rows: readonly DeliverableRow[]): PostView[] {
  return rows.flatMap((row): PostView[] =>
    row.kind !== "post" || row.dueOn === null
      ? []
      : [{ id: row.id, title: row.title, caption: row.caption, dueOn: row.dueOn, status: row.status, hasImage: row.imageKey !== null, linkUrl: row.linkUrl }],
  );
}

/**
 * Everything the Social & Ads page shows, or null when the business has not bought Social & Ads. Posts are this month's
 * plus the rest of the current week, and any post waiting for the customer's OK whatever its day. Each read is its own
 * failure: one that fails leaves that part out and the page still draws.
 */
export async function loadSocial(tenant: TenantContext, billing: CustomerBilling, now: Date): Promise<SocialData | null> {
  const db = getAppDb();
  const bought = await withTenantScope(db, tenant, (tx) => listBoughtSetupServices(tx, tenant.businessId));
  if (!bought.includes("social")) return null;
  const window = postWindow(now);
  const [rows, snapshots, report] = await Promise.all([
    quietly("social", "the posts", [] as DeliverableRow[], () =>
      withTenantScope(db, tenant, (tx) => listDeliverablesForBusiness(tx, tenant.businessId, { service: "social", from: window.from, to: window.to })),
    ),
    quietly("social", "the ads numbers", [], () => withTenantScope(db, tenant, (tx) => listMonthlySnapshots(tx, tenant.businessId, monthKey(now)))),
    quietly("social", "the monthly report", null, () => withTenantScope(db, tenant, (tx) => latestMonthlyReport(tx, tenant.businessId, "social"))),
  ]);
  const posts = postViews(rows);
  return {
    posts,
    monthLine: monthLine(posts, now),
    ads: adsPanel({ snapshot: snapshots.find((row) => row.service === "social") ?? null, adCreditCents: billing.subscription?.adCreditCents ?? 0 }),
    report: report?.url ?? null,
    month: monthName(now),
  };
}

/** How many posts wait for the customer's OK and the earliest day among them, for Overview. Call it through quietly. */
export async function loadWaitingPostCount(tenant: TenantContext): Promise<{ count: number; by: string | null }> {
  const rows = await withTenantScope(getAppDb(), tenant, (tx) => listWaitingPosts(tx, tenant.businessId));
  const waiting = postViews(rows);
  return { count: waiting.length, by: needsOkBy(waiting) };
}
