import type { DirectoryAdPlacement } from "@brandbasket/db";
// The subpaths, not the package indexes: this module reaches client components, and the indexes pull in the database.
import { chargedAmountCents, GST_BASIS_POINTS } from "@brandbasket/billing/tax";
import { formatMoney, parseMoney } from "../money";
import { areaName, categoryLabel, cityName } from "./places";

/*
 * Ads on the local directory, as the advertiser's page and the staff console show them (docs/superpowers/specs/
 * 2026-09-30-directory-ads-auction-design.md). The auction's own rules (weeks, second price) live in @brandbasket/db's
 * directory-ad-rules; this is wording, money and form parsing.
 */

/** The GST inside a won spot's price, like every other charge: prices include it. */
export const AD_TAX_BASIS_POINTS = GST_BASIS_POINTS;
/** Bids and prices are whole rupees in this range (the database checks the same). */
export const AD_MIN_RUPEES = 100;
export const AD_MAX_RUPEES = 100_000;
export const AD_TAGLINE_MAX_LENGTH = 80;
/** Shown on every ad, as on the website. */
export const AD_MARKER = "Ad";

/**
 * The places an ad is sold, in the order the Advertise page lists them. The list page's first row (`top`) is no longer
 * sold: its auction rules stay in the database so an ad already won or placed there runs out its week, but nobody can
 * bid for it or have staff place it any more.
 */
export const AD_PLACEMENTS: readonly DirectoryAdPlacement[] = ["home", "side", "profile"];

/** Whether a placement can still be bid for or placed by staff. */
export function isSoldPlacement(placement: DirectoryAdPlacement): boolean {
  return AD_PLACEMENTS.includes(placement);
}

export const AD_PLACEMENT_LABELS: Readonly<Record<DirectoryAdPlacement, string>> = {
  home: "Home page",
  top: "Top of the list",
  side: "Side spot",
  profile: "Business page",
};

/** One line on what each placement is, for choosing between them. */
export const AD_PLACEMENT_HINTS: Readonly<Record<DirectoryAdPlacement, string>> = {
  home: "A picture tile on the home page, seen by everyone in the city. Four tiles.",
  top: "The first result on the page, marked Ad. One per page.",
  side: "A picture card beside the list. Two per page.",
  profile: "A card on every business page in your category and area. One per page.",
};

/** The slug a home page auction keeps where a category and an area would be (HOME_AD_SCOPE_SLUG in @brandbasket/db). */
const HOME_SCOPE_SLUG = "all";

/** What a won spot is charged: its price, which already includes GST. The one helper every charge uses. */
export function adChargedPaise(pricePaise: number): number {
  return chargedAmountCents(pricePaise, 0);
}

/** "₹1,500" or "₹1,770.50". */
export function formatRupees(paise: number): string {
  return formatMoney(paise, "INR");
}

/**
 * "Dentists in Naupada, Thane": a market's name, falling back to the slugs for a place the lists do not know. A city's
 * home page market is just "Thane". A staff ad may be for all categories or all areas ("All categories in Naupada,
 * Thane", "Dentists in all areas of Thane"); for both at once, say it is not the home page with `home: false`.
 */
export function marketLabel(market: { readonly categorySlug: string; readonly citySlug: string; readonly areaSlug: string }, options: { readonly home?: boolean } = {}): string {
  const city = cityName(market.citySlug) ?? market.citySlug;
  const allCategories = market.categorySlug === HOME_SCOPE_SLUG;
  const allAreas = market.areaSlug === HOME_SCOPE_SLUG;
  if (allCategories && allAreas && options.home !== false) return city;
  const category = allCategories ? "All categories" : (categoryLabel(market.categorySlug) ?? market.categorySlug);
  if (allAreas) return `${category} in all areas of ${city}`;
  const area = areaName(market.citySlug, market.areaSlug) ?? market.areaSlug;
  return `${category} in ${area}, ${city}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });

/** "5 – 11 Oct" (or "28 Sep – 4 Oct"): the Monday-to-Sunday a `YYYY-MM-DD` week start covers. */
export function formatAdWeek(weekStart: string): string {
  const start = Date.parse(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(start)) throw new RangeError(`"${weekStart}" is not a date`);
  const end = new Date(start + 6 * DAY_MS);
  const sameMonth = new Date(start).getUTCMonth() === end.getUTCMonth();
  return `${(sameMonth ? dayOnly : dayMonth).format(start)} – ${dayMonth.format(end)}`;
}

const lastDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** "Sun 11 Oct": the last day an ad booked for a week shows, from that week's end (the next Monday's first instant). */
export function formatAdLastDay(weekEndsAt: Date): string {
  if (Number.isNaN(weekEndsAt.getTime())) throw new RangeError("A week's end must be a valid Date");
  return lastDay.format(new Date(weekEndsAt.getTime() - 1));
}

const moment = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

/** "Sat 3 Oct, 8:00 pm": a deadline, in Indian time whatever the reader's zone. */
export function formatAdDeadline(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("A deadline must be a valid Date");
  return moment.format(date);
}

/** The charge's description on Billing and the receipt: "Ad, top of the list: Dentists in Naupada, Thane, 5 – 11 Oct", or "Ad, home page tile 2: Thane, 5 – 11 Oct". */
export function adChargeDescription(win: {
  readonly placement: DirectoryAdPlacement;
  readonly spot: number;
  readonly weekStart: string;
  readonly categorySlug: string;
  readonly citySlug: string;
  readonly areaSlug: string;
}): string {
  const where = {
    top: "top of the list",
    side: `side spot ${win.spot}`,
    profile: "business pages",
    home: `home page tile ${win.spot}`,
  }[win.placement];
  const text = `Ad, ${where}: ${marketLabel(win)}, ${formatAdWeek(win.weekStart)}`;
  // The charges table allows 200 characters.
  return text.length <= 200 ? text : `${text.slice(0, 199).trimEnd()}…`;
}

export function parseAdPlacement(value: FormDataEntryValue | null): DirectoryAdPlacement | null {
  return value === "top" || value === "side" || value === "profile" || value === "home" ? value : null;
}

/** A bid or price typed in rupees ("1,500"): whole rupees in range, as paise, or null. */
export function parseAdRupees(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const paise = parseMoney(value.replace(/^\s*₹\s*/, ""));
  if (paise === null || paise % 100 !== 0) return null;
  return paise >= AD_MIN_RUPEES * 100 && paise <= AD_MAX_RUPEES * 100 ? paise : null;
}

/** The longest web address a link ad may lead to (the platform's contract and the database check say the same). */
export const AD_LINK_MAX_LENGTH = 500;

export type AdLinkParse = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly message: string };

/**
 * Where a link ad leads, as staff typed it: a web address, with https:// assumed when no scheme is typed. Only http and
 * https, a real host (a dot in it), no sign-in details in the address, at most AD_LINK_MAX_LENGTH characters. Returned
 * as the browser would write it, so what is stored is what a visitor is sent to.
 */
export function parseAdLink(value: string): AdLinkParse {
  const typed = value.trim();
  if (typed === "") return { ok: false, message: "Enter the address the ad should open, like https://example.com/offer." };
  if (/\s/.test(typed)) return { ok: false, message: "An address has no spaces in it." };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, message: "That doesn't look like a web address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, message: "Use an address that starts with https:// or http://." };
  if (url.username !== "" || url.password !== "") return { ok: false, message: "Leave sign-in details out of the address." };
  if (!url.hostname.includes(".")) return { ok: false, message: "That doesn't look like a web address." };
  if (url.href.length > AD_LINK_MAX_LENGTH) return { ok: false, message: `Keep the address to ${AD_LINK_MAX_LENGTH} characters.` };
  return { ok: true, url: url.href };
}

export type TaglineParse = { readonly ok: true; readonly tagline: string | null } | { readonly ok: false; readonly message: string };

/** The ad's one line: trimmed, on one line, at most AD_TAGLINE_MAX_LENGTH characters; empty clears it. */
export function parseAdTagline(value: FormDataEntryValue | null): TaglineParse {
  if (typeof value !== "string") return { ok: true, tagline: null };
  const tagline = value.replace(/\s+/g, " ").trim();
  if (tagline === "") return { ok: true, tagline: null };
  if (tagline.length > AD_TAGLINE_MAX_LENGTH) {
    return { ok: false, message: `Keep it to ${AD_TAGLINE_MAX_LENGTH} characters.` };
  }
  return { ok: true, tagline };
}
