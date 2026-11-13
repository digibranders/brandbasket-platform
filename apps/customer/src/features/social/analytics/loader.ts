import "server-only";
import type { CustomerContext } from "@/lib/guards";
import { brandOf } from "../brand";
import { fetchAnalytics } from "./client";
import { utcToday, windowsOf, type Analytics, type Range } from "./rules";

export interface AnalyticsData {
  readonly range: Range;
  /** Today as a UTC day, the last day of the range. */
  readonly today: string;
  /** Null when the posting service has nothing for this business yet: the screen then says numbers start tomorrow. */
  readonly analytics: Analytics | null;
}

/**
 * How the business's posts and accounts did over the range and the range before it, in one read. A failed read throws, and
 * the screen turns that into this panel's error state: never zeros that would read as true.
 */
export async function loadAnalytics(customer: Pick<CustomerContext, "businessId" | "businessName">, now: Date, range: Range): Promise<AnalyticsData> {
  const today = utcToday(now);
  const windows = windowsOf(range, today);
  return { range, today, analytics: await fetchAnalytics((await brandOf(customer)).externalId, { from: windows.from, to: today }) };
}
