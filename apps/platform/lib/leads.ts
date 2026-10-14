/**
 * The Leads page's arithmetic (app/app-host/(protected)/leads/page.tsx): which page of a business's enquiries to show,
 * and the links on each one. A free listing has no limit on its leads, so the page shows every one, a page at a time.
 */

import type { BusinessKind, DirectoryClaim, DirectoryRef } from "@fynix/db";

/** Where an owner reads their leads, and where the enquiry email links to. */
export const LEADS_PATH = "/leads";

/** How many leads one page lists, newest first. */
export const LEADS_PER_PAGE = 25;

/** How far back the page counts enquiries: "8 enquiries in the last 30 days". */
export const LEADS_WINDOW_DAYS = 30;
const WINDOW_MS = LEADS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
/** A page number as typed in the address: digits only, no sign, no leading zero. */
const PAGE_NUMBER = /^[1-9]\d*$/;
/** Fewer digits than any real number with its country code. */
const MIN_PHONE_DIGITS = 8;

/** A listing's place in the directory, as staff set up a website client's listing. */
export interface ListingPlacement {
  readonly categorySlug: string;
  readonly citySlug: string;
  readonly areaSlug: string;
  readonly slug: string;
  /** The business's permanent directory id; null until it has one. */
  readonly placeId: string | null;
}

/** The listing key a placement's enquiries are saved under: `category/city/area/slug`. */
export function placementListingKey(placement: ListingPlacement): string {
  return `${placement.categorySlug}/${placement.citySlug}/${placement.areaSlug}/${placement.slug}`;
}

/**
 * The business enquiries are saved under: its permanent place id where it has one, else its listing key (the same
 * reference listListingEnquiries reads by).
 */
export function businessRef(placeId: string | null, listingKey: string): DirectoryRef {
  return placeId === null ? { placeId: null, listingKey } : { placeId, listingKey };
}

/** What the Leads page knows about the business before reading any leads. */
export interface LeadsSourceInput {
  readonly kind: BusinessKind;
  /** A website client's own directory listing, as staff placed it; null when it has none. */
  readonly ownListing: ListingPlacement | null;
  /** The business's claim on a directory listing, made as a free listing account; null when it made none. */
  readonly claim: Pick<DirectoryClaim, "status" | "listingKey" | "placeId"> | null;
}

/**
 * Whose leads the page shows. A website client's own listing comes first; otherwise a claim we have confirmed, which
 * is a free listing's business, or a member's that it brought with it when it moved up to Premium. Until there is one,
 * a free account is told where its business stands; a website client with no listing has no leads page.
 */
export type LeadsSource =
  | { readonly state: "open"; readonly business: DirectoryRef }
  | { readonly state: "no-business" | "pending" | "rejected" | "none" };

export function leadsSource({ kind, ownListing, claim }: LeadsSourceInput): LeadsSource {
  if (ownListing !== null) return { state: "open", business: businessRef(ownListing.placeId, placementListingKey(ownListing)) };
  if (claim?.status === "approved") return { state: "open", business: businessRef(claim.placeId, claim.listingKey) };
  if (kind !== "listing") return { state: "none" };
  return claim === null ? { state: "no-business" } : { state: claim.status };
}

/** The page asked for in `?page=`, or the first for anything that isn't a whole number from 1 up. */
export function requestedLeadsPage(raw: string | readonly string[] | undefined): number {
  const value = typeof raw === "string" ? raw : raw?.[0];
  if (value === undefined || !PAGE_NUMBER.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

export interface LeadsPaging {
  /** The page shown: the one asked for, or the last there is. */
  readonly page: number;
  readonly pageCount: number;
  /** How many leads come before this page's first. */
  readonly offset: number;
  /** The page with the leads just after this page's, or null on the first page. */
  readonly newerPage: number | null;
  /** The page with the leads just before this page's, or null on the last page. */
  readonly olderPage: number | null;
}

/** Where `page` sits among `total` leads shown `perPage` at a time. A page past the end shows the last one. */
export function leadsPaging(total: number, page: number, perPage: number): LeadsPaging {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const shown = Math.min(Math.max(1, page), pageCount);
  return {
    page: shown,
    pageCount,
    offset: (shown - 1) * perPage,
    newerPage: shown > 1 ? shown - 1 : null,
    olderPage: shown < pageCount ? shown + 1 : null,
  };
}

/** A lead's serial number in the whole list, newest first: the `index`th on a page that starts after `offset` leads. */
export function leadSerialNumber(offset: number, index: number): number {
  return offset + index + 1;
}

/** A WhatsApp chat with the visitor, from the number they left (stored with its country code), or null if it can't be one. */
export function leadWhatsAppUrl(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length < MIN_PHONE_DIGITS ? null : `https://wa.me/${digits}`;
}

/** The start of the counting window, for the page's "in the last 30 days" count. */
export function leadsWindowStart(now: Date): Date {
  return new Date(now.getTime() - WINDOW_MS);
}

/** The tabs over the list: every enquiry, the ones not yet replied to, and the ones replied to. */
export type LeadsTab = "all" | "new" | "replied";

/** The tab named in `?tab=`, or "all" for anything else. */
export function requestedLeadsTab(raw: string | readonly string[] | undefined): LeadsTab {
  const value = typeof raw === "string" ? raw : raw?.[0];
  return value === "new" || value === "replied" ? value : "all";
}

/** A tab's address, with the category filter kept; the default tab and no category are left off. */
export function leadsTabHref(tab: LeadsTab, category: string | null): string {
  const query = new URLSearchParams();
  if (category !== null) query.set("category", category);
  if (tab !== "all") query.set("tab", tab);
  const text = query.toString();
  return text === "" ? LEADS_PATH : `${LEADS_PATH}?${text}`;
}

/** The line under the page's title: "4 new · 8 enquiries in the last 30 days". */
export function leadsLede({ newCount, windowCount }: { readonly newCount: number; readonly windowCount: number }): string {
  if (windowCount === 0 && newCount === 0) return `No enquiries in the last ${String(LEADS_WINDOW_DAYS)} days`;
  const fresh = newCount === 0 ? "Nothing new" : `${String(newCount)} new`;
  return `${fresh} · ${String(windowCount)} ${windowCount === 1 ? "enquiry" : "enquiries"} in the last ${String(LEADS_WINDOW_DAYS)} days`;
}
