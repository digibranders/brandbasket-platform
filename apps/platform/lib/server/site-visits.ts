import "server-only";
import { findAnalyticsConnection, listVisitDays, listVisitLists, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { isCustomerVisitsEnabled } from "@brandbasket/shared/lib/launch-flags";
import { getAppDb } from "./db";
import { listMonths, pickVisits, visitLists, visitsSummary, visitWindow, type VisitLists, type VisitsSummary } from "@/lib/website/visits";

/** What the Website page draws for visits: the 30 days' total, and the month's pages and channels when they were pulled. */
export interface VisitsData {
  readonly summary: VisitsSummary;
  readonly lists: VisitLists | null;
}

/**
 * Website visits (gate G1). Null while CUSTOMER_VISITS_ENABLED is off, before any database read. The customer's Google
 * Analytics numbers win when connected and a day was counted; otherwise our own script's. Null too when neither has a day
 * in the window, so no number is made up. Customer connection, tenant scoped; the tables have a read-only tenant policy.
 */
export async function loadVisits(tenant: TenantContext, now: Date): Promise<VisitsData | null> {
  if (!isCustomerVisitsEnabled()) return null;
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const window = visitWindow(now);
    const connection = await findAnalyticsConnection(tx);
    const analytics = connection?.status === "connected" ? visitsSummary("ga4", await listVisitDays(tx, "ga4", window.previousFrom, window.to), window, now) : null;
    const own = analytics === null ? visitsSummary("own", await listVisitDays(tx, "own", window.previousFrom, window.to), window, now) : null;
    const summary = pickVisits(analytics, own);
    if (summary === null) return null;
    const months = listMonths(now);
    const lists =
      visitLists(months.current, await listVisitLists(tx, summary.source, months.current)) ??
      visitLists(months.previous, await listVisitLists(tx, summary.source, months.previous));
    return { summary, lists };
  });
}
