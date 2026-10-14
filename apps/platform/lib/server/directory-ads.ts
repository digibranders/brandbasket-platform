import "server-only";
import {
  auctionScope,
  biddingClosesAt,
  countMarketBidders,
  countOpenAuctionSpots,
  DIRECTORY_AD_SPOTS,
  directoryRefOf,
  findClaimForBusiness,
  homeMarket,
  lastWinningPrices,
  listBidsForBusiness,
  listWinsForBusiness,
  listPlaceBookings,
  listStaffHeldSpots,
  lowerDeadline,
  marketOfListing,
  openBiddingWeeks,
  placementReserve,
  readAdDailyCounts,
  readLiveDirectoryAds,
  readLiveDirectoryPictures,
  readLiveSpotRows,
  saveDirectoryAdBid,
  setClaimTagline,
  settleDirectoryAds,
  sumListingInterest,
  addWeeks,
  weekEndsAt,
  weekStartOf,
  withTenantScope,
  type AdChargePricing,
  type BidOutcome,
  type DirectoryAdBid,
  type DirectoryAdMarket,
  type DirectoryAdPlacement,
  type DirectoryAdWin,
  type DirectoryClaim,
  type DirectoryEventKind,
} from "@fynix/db";
import { AD_PLACEMENTS, AD_TAX_BASIS_POINTS, adChargeDescription, adChargedPaise, isSoldPlacement } from "@fynix/shared/lib/directory/ads";
import type { AdsResponse } from "@/lib/directory-api";
import { buildAdResults, type AdResults } from "@/lib/advertise-results";
import { placementHeldThrough } from "@/lib/advertise-booking";
import { spotsNow, type AdSpotNow } from "@/lib/advertise-spots-now";
import { adPictureLookup, adsWithPictures } from "@/lib/directory-pictures-feed";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { directoryDay } from "./directory-signals";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";

/*
 * The platform's side of the ad auction (docs/superpowers/specs/2026-09-30-directory-ads-auction-design.md). The
 * auction settles lazily: every read of ads (the website's request, the Advertise page, the staff console) first
 * settles whatever is due, which is idempotent and cheap when nothing is.
 */

/** How a won spot's charge is worded and taxed: GST through the one tax helper, described for Billing and receipts. */
export const AD_CHARGE_PRICING: AdChargePricing = {
  taxRateBasisPoints: AD_TAX_BASIS_POINTS,
  chargedPaise: adChargedPaise,
  describe: adChargeDescription,
};

/** How far back the Advertise page's results look. */
const RESULTS_DAYS = 28;
/** How many weeks back an owner can pick an ad to see its results. */
const RESULT_WEEKS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Settles every auction and lapse that is due. A failure is logged and swallowed: a reader still gets what was
 * settled before, and the next read tries again.
 */
export async function settleDueAds(now: Date): Promise<void> {
  try {
    await settleDirectoryAds(getStaffDb(), now, AD_CHARGE_PRICING);
  } catch (error) {
    console.error("Could not settle directory ad auctions.", errorLogInfo(error));
  }
}

/** The last `count` Asia/Kolkata days up to and including today, oldest first, as `YYYY-MM-DD`. */
function lastDays(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => directoryDay(new Date(now.getTime() - (count - 1 - index) * DAY_MS)));
}

function parseMarket(market: string): DirectoryAdMarket {
  const [categorySlug, citySlug, areaSlug] = market.split("/");
  if (categorySlug === undefined || citySlug === undefined || areaSlug === undefined) {
    throw new RangeError(`"${market}" is not a market`);
  }
  return { categorySlug, citySlug, areaSlug };
}

/**
 * `GET /api/directory/ads`: this week's paid ads in `market` (already checked against the contract's pattern), each
 * with its advertiser's approved pictures.
 */
export async function readAdsForWebsite(market: string, now: Date): Promise<AdsResponse> {
  await settleDueAds(now);
  const db = getStaffDb();
  const ads = await readLiveDirectoryAds(db, parseMarket(market), now);
  return adsWithPictures(ads, await readLiveDirectoryPictures(db, adPictureLookup(ads)));
}

/** One placement in one open week, as the Advertise page offers it. */
export interface AdOffer {
  readonly placement: DirectoryAdPlacement;
  /** The lowest bid: the placement's price. Null while staff have not opened it. */
  readonly reservePaise: number | null;
  /** How many spots the placement has: one, two for the side column, four on the home page. */
  readonly totalSpots: number;
  /** How many businesses have bid, this one included. */
  readonly bidders: number;
  /** This business's active bid, or null. */
  readonly myBidPaise: number | null;
  /** Spots this week's auction can sell; 0 when staff-placed ads hold them all, so there is nothing to bid for. */
  readonly openSpots: number;
  /**
   * When the placement opens to bidders again, while staff-placed ads hold every spot: the end of the whole run of
   * weeks staff booked, which can be a month or two. Null while a spot is free.
   */
  readonly bookedUntil: Date | null;
}

export interface AdWeek {
  readonly weekStart: string;
  readonly closesAt: Date;
  /** After this a bid may only rise. */
  readonly lowerUntil: Date;
  readonly offers: readonly AdOffer[];
}

export interface AdvertisePage {
  readonly claim: DirectoryClaim | null;
  readonly market: DirectoryAdMarket | null;
  /** The lowest bid per placement, null where staff have not opened it yet; null itself before the claim is approved. */
  readonly reserves: Readonly<Record<DirectoryAdPlacement, number | null>> | null;
  /** The weeks taking bids, soonest first; empty unless the claim is approved. A placement staff have not opened has no reserve. */
  readonly weeks: readonly AdWeek[];
  /** What each placement is showing this week: who holds its spots and until when. Empty before the claim is approved. */
  readonly spots: readonly AdSpotNow[];
  /** Who saw and clicked this business's ads over the last RESULTS_DAYS days; null when it has no place id to count by. */
  readonly results: AdResults | null;
  /** Wins for the running week and later: to pay, paid, or lapsed. */
  readonly wins: readonly DirectoryAdWin[];
  /** Bids for weeks already closed that did not win, for "you were outbid". */
  readonly settledBids: readonly DirectoryAdBid[];
  /** Last settled week's prices per placement, highest first. */
  readonly lastPrices: { readonly weekStart: string } & Readonly<Record<DirectoryAdPlacement, readonly number[]>> | null;
  /** Visitors to the listing over the last RESULTS_DAYS days, by what they did. */
  readonly interest: Readonly<Record<DirectoryEventKind, number>> | null;
  readonly resultsDays: number;
}

/** Everything the Advertise page shows the signed-in listing account, after settling what is due. */
export async function getAdvertisePage(customer: Pick<GrantedCustomer, "tenant">, now: Date): Promise<AdvertisePage> {
  await settleDueAds(now);
  const { tenant } = customer;
  const currentWeek = weekStartOf(now);
  const own = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const claim = await findClaimForBusiness(tx, tenant.businessId);
    const bids = await listBidsForBusiness(tx, tenant.businessId, currentWeek);
    const wins = await listWinsForBusiness(tx, tenant.businessId, currentWeek);
    return { claim, bids, wins };
  });
  const { claim, bids, wins } = own;
  const empty = { claim, market: null, reserves: null, weeks: [], spots: [], results: null, wins, settledBids: [], lastPrices: null, interest: null, resultsDays: RESULTS_DAYS };
  if (claim === null) return empty;
  const market = marketOfListing(claim.listingKey);
  const staff = getStaffDb();
  const days = lastDays(now, RESULTS_DAYS);
  // Per-ad results look back this many weeks: counts are kept longer, but a quarter is what an owner asks about.
  const bookingsFrom = addWeeks(currentWeek, -(RESULT_WEEKS - 1));
  const countsFrom = bookingsFrom < (days[0] ?? bookingsFrom) ? bookingsFrom : (days[0] ?? bookingsFrom);
  const [interest, counts, bookings] = await Promise.all([
    sumListingInterest(staff, directoryRefOf(claim), directoryDay(new Date(now.getTime() - (RESULTS_DAYS - 1) * DAY_MS))),
    claim.placeId === null ? null : readAdDailyCounts(staff, claim.placeId, countsFrom),
    claim.placeId === null ? [] : listPlaceBookings(staff, claim.placeId, bookingsFrom),
  ]);
  // Only weeks that have started have anything to report.
  const results = counts === null ? null : buildAdResults(counts, days, bookings.filter((booking) => booking.weekStart <= currentWeek));
  // A business its owner added with no place has no page for an ad to lead to, so it is offered no weeks (saveDirectoryAdBid refuses too).
  if (claim.status !== "approved" || (claim.origin === "added" && claim.placeId === null)) return { ...empty, market, interest, results };

  const openWeeks = openBiddingWeeks(now);
  const [bidders, openSpots, heldSpots, lastPrices, liveHere, liveHome, reserveList] = await Promise.all([
    countMarketBidders(staff, market, openWeeks),
    countOpenAuctionSpots(staff, market, openWeeks),
    listStaffHeldSpots(staff, market, currentWeek),
    lastWinningPrices(staff, market, now),
    readLiveSpotRows(staff, market, now),
    readLiveSpotRows(staff, homeMarket(market.citySlug), now),
    Promise.all(AD_PLACEMENTS.map(async (placement) => [placement, await placementReserve(staff, auctionScope(placement, market), placement)] as const)),
  ]);
  const reserves = Object.fromEntries(reserveList) as Record<DirectoryAdPlacement, number | null>;
  const weeks: AdWeek[] = openWeeks.map((weekStart) => ({
    weekStart,
    closesAt: biddingClosesAt(weekStart),
    lowerUntil: lowerDeadline(weekStart),
    offers: AD_PLACEMENTS.map((placement) => {
      const mine = bids.find((bid) => bid.weekStart === weekStart && bid.placement === placement && bid.status === "active");
      const open = openSpots.find((row) => row.weekStart === weekStart && row.placement === placement)?.open ?? 0;
      const heldThrough = open === 0 ? placementHeldThrough(heldSpots, placement, DIRECTORY_AD_SPOTS[placement], weekStart) : null;
      return {
        placement,
        reservePaise: reserves[placement],
        totalSpots: DIRECTORY_AD_SPOTS[placement],
        bidders: bidders.find((row) => row.weekStart === weekStart && row.placement === placement)?.bidders ?? 0,
        myBidPaise: mine?.amountPaise ?? null,
        openSpots: open,
        bookedUntil: heldThrough === null ? null : weekEndsAt(heldThrough),
      };
    }),
  }));
  const settledBids = bids.filter((bid) => bid.status === "lost");
  const anyLastPrice = AD_PLACEMENTS.some((placement) => lastPrices[placement].length > 0);
  const spots = spotsNow([...liveHere, ...liveHome], tenant.businessId, heldSpots);
  return { claim, market, reserves, weeks, spots, results, wins, settledBids, lastPrices: anyLastPrice ? lastPrices : null, interest, resultsDays: RESULTS_DAYS };
}

/** Places, changes or (amount null) withdraws the signed-in listing account's bid. */
export async function saveCustomerBid(
  customer: Pick<GrantedCustomer, "tenant">,
  input: { readonly placement: DirectoryAdPlacement; readonly weekStart: string; readonly amountPaise: number | null },
  now: Date,
): Promise<BidOutcome> {
  // A placement that is no longer sold takes no bids, whatever the form posted.
  if (!isSoldPlacement(input.placement)) return { kind: "refused", reason: "not-open" };
  return saveDirectoryAdBid(getStaffDb(), { businessId: customer.tenant.businessId, ...input, now });
}

/** Saves the ad's one line for staff to approve; false when the account has no claim. */
export async function saveCustomerTagline(customer: Pick<GrantedCustomer, "tenant">, tagline: string | null): Promise<boolean> {
  return setClaimTagline(getStaffDb(), customer.tenant.businessId, tagline);
}
