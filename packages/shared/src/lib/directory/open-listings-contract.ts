/*
 * GET /api/directory/open-listings/version and GET /api/directory/open-listings?after=<place id>&limit=<n>: the
 * directory's open-data and surveyed businesses (directory_open_listings), for the marketing website's server, with
 * LEADS_API_TOKEN. This file is copied verbatim into the website repo (lib/open-listings-contract.ts), like
 * feed-contract.ts. Additive only: never reorder or remove a tuple field; append optional ones at the end.
 */

export const OPEN_LISTINGS_PATH = "/api/directory/open-listings";
export const OPEN_LISTINGS_VERSION_PATH = "/api/directory/open-listings/version";
export const OPEN_LISTINGS_CONTRACT_VERSION = 1;
/** Most rows one page may ask for: about 1.6 MB of JSON. */
export const OPEN_LISTINGS_MAX_PAGE = 5000;

/**
 * One business. The first twelve fields are the same as a row of the website's thane-listings.json, so the website
 * reads both the same way: name, category, city, area, address, lat, lon, website, source, id, urlCity, urlSlug.
 * Then the shown phone, or four nulls/false: e164, foundOn (page URL or "call"), checkedOn (YYYY-MM-DD), whatsapp.
 */
export type OpenListingTuple = readonly [
  name: string,
  category: string,
  city: string,
  area: string,
  address: string,
  lat: number,
  lon: number,
  website: string,
  source: "osm" | "overture" | "survey",
  id: string,
  urlCity: string,
  urlSlug: string,
  phone: string | null,
  phoneFoundOn: string | null,
  phoneCheckedOn: string | null,
  phoneWhatsapp: boolean,
];

export interface OpenListingsVersion {
  readonly contract: typeof OPEN_LISTINGS_CONTRACT_VERSION;
  /** Changes whenever any visible listing does; compare before re-reading. */
  readonly version: string;
}

export interface OpenListingsPage {
  readonly contract: typeof OPEN_LISTINGS_CONTRACT_VERSION;
  /** The version this page was read at; a snapshot whose pages disagree is read again. */
  readonly version: string;
  readonly listings: readonly OpenListingTuple[];
  /** The `after` for the next page, or null on the last. */
  readonly next: string | null;
}
