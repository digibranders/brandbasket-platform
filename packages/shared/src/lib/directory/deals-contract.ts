/**
 * GET /api/directory/deals: the offers on show today, for the website's home page, business pages and list cards.
 *
 * Like feed-contract.ts, this file is copied verbatim into the website repo, and the contract is additive-only: never
 * rename or remove a field; add optional ones.
 */
export const DIRECTORY_DEALS_VERSION = 1;

/** Where the platform serves the deals, and the website calls. */
export const DIRECTORY_DEALS_PATH = "/api/directory/deals";

/** The time zone "today" and a deal's first and last day are counted in: every opened market is in India. */
export const DIRECTORY_DEALS_TIME_ZONE = "Asia/Kolkata";

export interface DirectoryDealEntry {
  readonly id: string;
  /** The business's permanent directory id; null for one the place registry does not know yet (then `listingKey` names it). */
  readonly placeId: string | null;
  /** `category/city/area/slug`: the business's address before ids, always present. */
  readonly listingKey: string;
  readonly businessName: string;
  readonly title: string;
  /** The short stamp, e.g. "20% off". */
  readonly badge: string;
  /** The small print, e.g. "Weekdays before 5 pm". */
  readonly terms: string;
  /** First and last day it is on show, as ISO dates. */
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface DirectoryDealsFeed {
  readonly version: typeof DIRECTORY_DEALS_VERSION;
  readonly generatedAt: string;
  /** The day the feed was worked out for, as an ISO date in DIRECTORY_DEALS_TIME_ZONE. */
  readonly today: string;
  /** Newest first. */
  readonly deals: readonly DirectoryDealEntry[];
}
