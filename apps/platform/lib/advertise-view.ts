import { firstPayBy, weekStartOf, type DirectoryAdMarket, type DirectoryAdPlacement, type DirectoryAdWin } from "@brandbasket/db";
import { formatAdDeadline, formatAdLastDay, formatAdWeek } from "@brandbasket/shared/lib/directory/ads";
import { directoryCategoryPath } from "@brandbasket/shared/lib/directory/places";
import type { AdvertisePage } from "@/lib/server/directory-ads";

/*
 * What the Advertise page shows, worked out from what the server read (lib/server/directory-ads.ts): pure, so the
 * wording and the rules for "what should this owner see first" are tested without a database. The page is built
 * around one question at a time: is there something to pay, is an ad showing, is a bid in, or is it time to pick a
 * spot.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "Next week", "Week after next": how an owner names a week, from how far ahead it is. */
export function weekLabel(weekStart: string, now: Date): string {
  const ahead = Math.round((Date.parse(`${weekStart}T00:00:00.000Z`) - Date.parse(`${weekStartOf(now)}T00:00:00.000Z`)) / WEEK_MS);
  if (ahead === 0) return "This week";
  if (ahead === 1) return "Next week";
  if (ahead === 2) return "Week after next";
  return `In ${ahead} weeks`;
}

/**
 * The market's own page on the website, e.g. `/in/mh/thane/naupada/dentists`, under `siteOrigin`. The market's city
 * is its internal key only; the address has the area alone.
 */
export function marketPageHref(market: DirectoryAdMarket, siteOrigin: string): string {
  return new URL(directoryCategoryPath(market.areaSlug, market.categorySlug), siteOrigin).toString();
}

/**
 * Where an owner can see a placement on the website, or null where there is no one page to point at (a business page
 * is every business's): the home page, or the market's own list page for the top and side spots.
 */
export function placementPageHref(placement: DirectoryAdPlacement, market: DirectoryAdMarket, siteOrigin: string): string | null {
  if (placement === "home") return new URL("/", siteOrigin).toString();
  if (placement === "profile") return null;
  return marketPageHref(market, siteOrigin);
}

/** One spot in one week, as the bid panel offers it. Plain data: it crosses to a client component. */
export interface BidPanelOffer {
  readonly placement: DirectoryAdPlacement;
  /** The lowest bid, or null while staff have not opened the placement: it is shown but cannot be bid on. */
  readonly reservePaise: number | null;
  /** How many spots the placement has. */
  readonly totalSpots: number;
  readonly bidders: number;
  readonly myBidPaise: number | null;
  /** 0 when staff-placed ads hold every spot: nothing to bid for. */
  readonly openSpots: number;
  /** What it took to win this placement in the last settled week, or null when nobody has won it yet. */
  readonly lastPaise: number | null;
  /** "Sun 14 Dec": the last day staff have the placement booked, while they hold every spot of it; null while a spot is free. */
  readonly bookedUntil: string | null;
}

export interface BidPanelWeek {
  readonly weekStart: string;
  /** "Next week". */
  readonly label: string;
  /** "5 – 11 Oct". */
  readonly range: string;
  /** "Sat 3 Oct, 8:00 pm": when bidding closes and the result is known. */
  readonly closes: string;
  /** When a winner must have paid by. */
  readonly payBy: string;
  /** Until when a bid may be lowered or withdrawn. */
  readonly lowerUntil: string;
  /** Whether that moment is still ahead. */
  readonly canLower: boolean;
  readonly offers: readonly BidPanelOffer[];
}

/**
 * The price to beat for a placement, from the last settled week: the cheapest of the prices its spots went for (a bid
 * above it would have won a spot). For the one-spot placements that is simply the price paid.
 */
function lastPriceFor(lastPrices: AdvertisePage["lastPrices"], placement: DirectoryAdPlacement): number | null {
  if (lastPrices === null) return null;
  const prices = lastPrices[placement];
  return prices.length === 0 ? null : Math.min(...prices);
}

/** The weeks taking bids, ready for the bid panel. */
export function bidPanelWeeks(page: Pick<AdvertisePage, "weeks" | "lastPrices">, now: Date): BidPanelWeek[] {
  return page.weeks.map((week) => ({
    weekStart: week.weekStart,
    label: weekLabel(week.weekStart, now),
    range: formatAdWeek(week.weekStart),
    closes: formatAdDeadline(week.closesAt),
    payBy: formatAdDeadline(firstPayBy(week.weekStart)),
    lowerUntil: formatAdDeadline(week.lowerUntil),
    canLower: now.getTime() < week.lowerUntil.getTime(),
    offers: week.offers.map((offer) => ({
      ...offer,
      lastPaise: lastPriceFor(page.lastPrices, offer.placement),
      bookedUntil: offer.bookedUntil === null ? null : formatAdLastDay(offer.bookedUntil),
    })),
  }));
}

/** A spot that was bid for and not won, with the reason an owner would otherwise have to guess. */
export interface MissedSpot {
  readonly id: string;
  readonly placement: DirectoryAdPlacement;
  readonly weekStart: string;
  /**
   * `outbid`: another business bid more. `holds-top`: this business won the top spot that week, and one business
   * holds one spot per page. `not-paid`: it won and did not pay in time.
   */
  readonly reason: "outbid" | "holds-top" | "not-paid";
}

export interface AdOutcomes {
  /** Won and waiting for payment, soonest deadline first: the most urgent thing on the page. */
  readonly toPay: readonly DirectoryAdWin[];
  /** Paid and showing this week. */
  readonly live: readonly DirectoryAdWin[];
  /** Paid for a week that has not started. */
  readonly upcoming: readonly DirectoryAdWin[];
  readonly missed: readonly MissedSpot[];
  /** The soonest open week this business has a bid in, or null. */
  readonly bidWeek: string | null;
}

/** Sorts the business's wins and lost bids into what to show first. */
export function adOutcomes(page: Pick<AdvertisePage, "wins" | "settledBids" | "weeks">, now: Date): AdOutcomes {
  const current = weekStartOf(now);
  const toPay = page.wins.filter((win) => win.status === "awaiting_payment").sort((a, b) => a.payBy.getTime() - b.payBy.getTime());
  const paid = page.wins.filter((win) => win.status === "paid");
  const holdsTop = new Set(page.wins.filter((win) => win.placement === "top" && win.status !== "lapsed").map((win) => win.weekStart));
  const missed: MissedSpot[] = [
    ...page.wins
      .filter((win) => win.status === "lapsed")
      .map((win) => ({ id: win.id, placement: win.placement, weekStart: win.weekStart, reason: "not-paid" as const })),
    ...page.settledBids.map((bid) => ({
      id: bid.id,
      placement: bid.placement,
      weekStart: bid.weekStart,
      reason: bid.placement === "side" && holdsTop.has(bid.weekStart) ? ("holds-top" as const) : ("outbid" as const),
    })),
  ];
  const bidWeek = page.weeks.find((week) => week.offers.some((offer) => offer.myBidPaise !== null))?.weekStart ?? null;
  return {
    toPay,
    live: paid.filter((win) => win.weekStart === current),
    upcoming: paid.filter((win) => win.weekStart > current),
    missed,
    bidWeek,
  };
}

export const MISSED_REASONS: Readonly<Record<MissedSpot["reason"], string>> = {
  outbid: "Another business bid more",
  "holds-top": "You already hold the top spot",
  "not-paid": "Not paid in time",
};
