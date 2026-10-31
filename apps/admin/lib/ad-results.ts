/** The windows the ad results page offers, in days. */
export const AD_RESULTS_WINDOWS = [7, 30, 90, 365] as const;
export type AdResultsDays = (typeof AD_RESULTS_WINDOWS)[number];

const DEFAULT_DAYS: AdResultsDays = 30;

/** The window `?days=` names, or 30 for anything else. */
export function readAdResultsDays(params: Readonly<Record<string, string | string[] | undefined>>): AdResultsDays {
  const value = params.days;
  return AD_RESULTS_WINDOWS.find((days) => String(days) === value) ?? DEFAULT_DAYS;
}

/** From that many days before `now` up to `now`. */
export function adResultsWindow(now: Date, days: number): { readonly from: Date; readonly to: Date } {
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now };
}

/** The page's address for a window; the default window has none. */
export function adResultsHref(days: number): string {
  return days === DEFAULT_DAYS ? "/ad-results" : `/ad-results?days=${String(days)}`;
}
