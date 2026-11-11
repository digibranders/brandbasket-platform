/** Google's caps on one account, and the point where the console starts saying so (plan 62, step 5). */
export const SEARCH_CONSOLE_SITE_LIMIT = 1000;
export const ANALYTICS_PROPERTY_LIMIT = 2000;
/** From this many Search Console sites the Settings page asks staff to prepare the second account. */
export const SEARCH_CONSOLE_WARN_AT = 800;

export function isNearSearchConsoleLimit(sites: number): boolean {
  return sites >= SEARCH_CONSOLE_WARN_AT;
}

/** How full the meter is, 0 to 100, never past the end. */
export function searchConsoleFillPercent(sites: number): number {
  return Math.min(100, Math.max(0, (sites / SEARCH_CONSOLE_SITE_LIMIT) * 100));
}

const group = (count: number): string => count.toLocaleString("en-IN");

export const searchConsoleCountLine = (sites: number): string => `${group(sites)} of ${group(SEARCH_CONSOLE_SITE_LIMIT)}`;
export const analyticsCountLine = (properties: number): string => `${group(properties)} of ${group(ANALYTICS_PROPERTY_LIMIT)}`;

/** The amber sentence. It never says anything stops: nothing does. */
export function searchConsoleLimitText(sites: number): string {
  return `This account holds ${group(sites)} Search Console sites, close to Google's limit of ${group(SEARCH_CONSOLE_SITE_LIMIT)}. Create the second Google account and set google_slot to 2 for new sites. Nothing stops working at ${group(sites)}.`;
}
