import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import { businessNotClosing } from "./account-closures";
import {
  addWeeks,
  bidChangeRefusal,
  firstPayBy,
  latestClosedWeekStart,
  PAY_WINDOW_MS,
  rankBids,
  secondPriceWinners,
  weekEndsAt,
  weekStartOf,
  weekStartsAt,
  type BidChangeRefusal,
} from "../directory-ad-rules";
import {
  businesses,
  businessMembers,
  charges,
  directoryAdBids,
  directoryAdDailyCounts,
  directoryAdPrices,
  directoryAdSpotPrices,
  directoryAdWins,
  directoryBusinessProfiles,
  directoryClaims,
  directoryDailyCounts,
  directoryListings,
  directoryPlaceLegacyKeys,
  directoryPlaces,
  directoryStaffAdPictures,
  directoryStaffAds,
  directoryVerifications,
  indiaPincodes,
  users,
  DIRECTORY_AD_PLACEMENTS,
  HOME_AD_SCOPE_SLUG,
  HOME_AD_SPOTS,
  type DirectoryEventKind,
  type DirectoryAdBidStatus,
  type DirectoryAdEventKind,
  type DirectoryAdPlacement,
  type DirectoryAdWinStatus,
  type DirectoryClaimOrigin,
  type DirectoryClaimStatus,
  type SignupChoice,
} from "../schema";
import type { ScopedTransaction } from "../scope";
import { elsewhereCitySlug, hasOpenedDistrict, isElsewhereCitySlug, isOpenedDistrict } from "../opened-districts";
import { isPhoneAccountEmail } from "../phone-account";
import { toPlaceUrlSlug } from "../place-id";
import { lockBusinessForBilling } from "./billing";
import { isUuid } from "./tenant";
import {
  createPlatformPlace,
  findPlaces,
  holdPlaceRegistryShared,
  isPlaceRegistryImported,
  lockPlaceUrl,
  PRE_PLACES_STATE_CODE,
  registerLegacyKeys,
  updatePendingPlaceUrl,
  type PlaceUrl,
} from "./directory-places";
import {
  directoryBusinessOf,
  isEmptyDirectoryLookup,
  matchesDirectoryLookup,
  matchesDirectoryRef,
  resolveListingKey,
  sameDirectoryBusiness,
  type DirectoryLookup,
  type DirectoryRef,
} from "./directory-refs";
import { insertBusiness } from "./onboarding";
import { insertOnboardingProject } from "./projects";
import { hasPostgresCode, UNIQUE_VIOLATION } from "./tenant";

type Runner = Database | ScopedTransaction;

/*
 * Free listing accounts and the weekly ad auction (docs/superpowers/specs/2026-09-30-directory-ads-auction-design.md).
 * The customer reads its own rows through row-level security; everything that writes runs on the staff connection
 * after the platform has checked the customer. Settlement (settleDirectoryAds) is idempotent and runs whenever ads are
 * read, under one advisory lock that bid changes take shared, so no bid can slip in while its auction settles.
 *
 * A claim names its business by listing key, which is also its ad market, and by place id when the key is one the
 * place registry knows (docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md, Task 7). Bids copy their
 * claim's place, wins their bid's, and every "is this the same business" check compares places
 * (./directory-refs sameDirectoryBusiness).
 */

/** pg_advisory_xact_lock key for settlement: an arbitrary constant no other lock in the platform uses. */
const SETTLEMENT_LOCK_KEY = 7_411_902_001;

/** How many spots each placement has in its auction (`home`: in its city; the others: in a category and area). */
export const DIRECTORY_AD_SPOTS: Readonly<Record<DirectoryAdPlacement, number>> = { top: 1, side: 2, profile: 1, home: HOME_AD_SPOTS };

/** A market: one category in one area, from a listing key `<category>/<city>/<area>/<slug>`. */
export interface DirectoryAdMarket {
  readonly categorySlug: string;
  readonly citySlug: string;
  readonly areaSlug: string;
}

export class InvalidListingKeyError extends Error {
  constructor(key: string) {
    super(`"${key}" is not a listing key`);
    this.name = "InvalidListingKeyError";
  }
}

const LISTING_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){3}$/;

/** The market a listing is in. */
export function marketOfListing(listingKey: string): DirectoryAdMarket {
  if (listingKey.length > 200 || !LISTING_KEY_PATTERN.test(listingKey)) throw new InvalidListingKeyError(listingKey);
  const [categorySlug, citySlug, areaSlug] = listingKey.split("/");
  if (categorySlug === undefined || citySlug === undefined || areaSlug === undefined) {
    throw new InvalidListingKeyError(listingKey);
  }
  return { categorySlug, citySlug, areaSlug };
}

/**
 * The auction a placement is sold in, from the market of the business that wants it. A list page's top and side and a
 * business page's spot are sold per category and area, as the business's own market; the home page is sold city-wide,
 * in the city's `all` market (HOME_AD_SCOPE_SLUG), whatever the business's category and area.
 */
export function auctionScope(placement: DirectoryAdPlacement, market: DirectoryAdMarket): DirectoryAdMarket {
  if (placement !== "home") return market;
  return { categorySlug: HOME_AD_SCOPE_SLUG, citySlug: market.citySlug, areaSlug: HOME_AD_SCOPE_SLUG };
}

/** The market a city's home page ads are read in: `all/<city>/all`. */
export function homeMarket(citySlug: string): DirectoryAdMarket {
  return auctionScope("home", { categorySlug: HOME_AD_SCOPE_SLUG, citySlug, areaSlug: HOME_AD_SCOPE_SLUG });
}

/**
 * What a staff ad's category or area is when it stands for every one of them: "all categories" in an area, "all areas"
 * of a category, or both across a city. The word the home market uses for the same thing.
 */
export const ALL_SLUG = HOME_AD_SCOPE_SLUG;

/** Whether `market` is a city's home market (`all/<city>/all`), where only home page ads show. */
function isHomeMarket(market: DirectoryAdMarket): boolean {
  return market.categorySlug === ALL_SLUG && market.areaSlug === ALL_SLUG;
}

/**
 * The staff ads that show in `market`: those placed exactly there, and those placed for "all categories" or "all areas"
 * of its city. `market` is a real category and area (the ads of a list page or a business page) or a city's home market,
 * which only home page ads show in, and which no other placement's ads show in.
 */
function staffAdsShowingIn(market: DirectoryAdMarket): SQL {
  if (isHomeMarket(market)) {
    return and(
      eq(directoryStaffAds.placement, "home"),
      eq(directoryStaffAds.categorySlug, market.categorySlug),
      eq(directoryStaffAds.citySlug, market.citySlug),
      eq(directoryStaffAds.areaSlug, market.areaSlug),
    ) as SQL;
  }
  return and(
    ne(directoryStaffAds.placement, "home"),
    eq(directoryStaffAds.citySlug, market.citySlug),
    or(eq(directoryStaffAds.categorySlug, market.categorySlug), eq(directoryStaffAds.categorySlug, ALL_SLUG)),
    or(eq(directoryStaffAds.areaSlug, market.areaSlug), eq(directoryStaffAds.areaSlug, ALL_SLUG)),
  ) as SQL;
}

/**
 * The staff ads whose market overlaps `market`, where either may be "all categories" or "all areas": the ads a new
 * booking in `market` would share a spot with if it took the same spot of the same placement in the same week.
 */
function staffAdsOverlapping(market: DirectoryAdMarket): SQL {
  return and(
    eq(directoryStaffAds.citySlug, market.citySlug),
    market.categorySlug === ALL_SLUG ? sql`true` : or(eq(directoryStaffAds.categorySlug, market.categorySlug), eq(directoryStaffAds.categorySlug, ALL_SLUG)),
    market.areaSlug === ALL_SLUG ? sql`true` : or(eq(directoryStaffAds.areaSlug, market.areaSlug), eq(directoryStaffAds.areaSlug, ALL_SLUG)),
  ) as SQL;
}

function sameMarket(market: DirectoryAdMarket) {
  return and(
    eq(directoryAdBids.categorySlug, market.categorySlug),
    eq(directoryAdBids.citySlug, market.citySlug),
    eq(directoryAdBids.areaSlug, market.areaSlug),
  );
}

// ── Accounts and claims ─────────────────────────────────────────────────────────────────────────────────────────

export class UserAlreadyHasBusinessError extends Error {
  constructor(userId: string) {
    super(`User ${userId} already belongs to a business.`);
    this.name = "UserAlreadyHasBusinessError";
  }
}

interface NewListingAccountBase {
  /** The account just created by @fynix/auth. */
  readonly userId: string;
  /** The listing's name, from the website: the business's name too. */
  readonly businessName: string;
  /** E.164, already normalised. */
  readonly phone: string;
  /** What the owner chose on the entry page; left out by callers that never asked. */
  readonly signupChoice?: SignupChoice | null;
}

/**
 * The business a claim is for: named by its listing key (a claim link from before permanent ids, still accepted while
 * the website switches), or by its place id, which must be claimable (findClaimablePlace).
 */
export type NewListingAccount = NewListingAccountBase &
  (
    | { readonly listingKey: string; readonly placeId?: undefined }
    | { readonly placeId: string; readonly listingKey?: undefined }
  );

/** Why a place cannot be claimed by a new free listing account. */
export type PlaceClaimRefusal =
  /** No place has this id. */
  | "unknown-place"
  /** A client's listing has the place (or, before the backfill, sits at one of its addresses). */
  | "has-client-listing"
  /** A client's place, or a business an owner added: only an open-data business can be claimed. */
  | "not-open-data"
  /** Staff have approved a claim to the place. */
  | "already-claimed"
  /** None of the place's addresses is in its own city, so the claim's market (read from the address) is unknown. */
  | "no-address";

export class PlaceNotClaimableError extends Error {
  readonly placeId: string;
  readonly reason: PlaceClaimRefusal;

  constructor(placeId: string, reason: PlaceClaimRefusal) {
    super(`Place ${placeId} cannot be claimed: ${reason}`);
    this.name = "PlaceNotClaimableError";
    this.placeId = placeId;
    this.reason = reason;
  }
}

export type ClaimablePlaceOutcome =
  | { readonly kind: "claimable"; readonly placeId: string; readonly listingKey: string }
  | { readonly kind: "refused"; readonly reason: PlaceClaimRefusal };

/**
 * Whether a free listing account may claim the place `placeId`, and with which address. A claim keeps a listing key
 * as well as the place, and its market (category, city and area, which ads are bid in) is read from that key, so the
 * claim takes the place's address in the place's own city (its city_slug is the URL's city). Of several, the first in
 * byte order (code units), so the same place always gets the same one. Claimable means: the place exists, is an open-data
 * business, has no client's listing (by place, or by one of its addresses before the backfill gave the listing a place)
 * and no approved claim (by place, or by one of its addresses before the backfill gave the claim one), and has such an
 * address. A pending claim does not hold a place: staff decide between them on the call.
 */
export async function findClaimablePlace(db: Runner, placeId: string): Promise<ClaimablePlaceOutcome> {
  const place = (await findPlaces(db, [placeId])).get(placeId);
  if (place === undefined) return { kind: "refused", reason: "unknown-place" };

  // Sorted here, by code unit, not by the database: a column's collation can skip punctuation, and which address a
  // claim keeps must not depend on where the database runs.
  const keys = (
    await db.select({ listingKey: directoryPlaceLegacyKeys.listingKey }).from(directoryPlaceLegacyKeys).where(eq(directoryPlaceLegacyKeys.placeId, placeId))
  )
    .map((row) => row.listingKey)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const listings = await db
    .select({ businessId: directoryListings.businessId })
    .from(directoryListings)
    .where(or(eq(directoryListings.placeId, placeId), ...keys.map(listingAtUnplacedKey)))
    .limit(1);
  if (listings.length > 0) return { kind: "refused", reason: "has-client-listing" };
  if (place.origin !== "open_data") return { kind: "refused", reason: "not-open-data" };

  const approved = await db
    .select({ id: directoryClaims.id })
    .from(directoryClaims)
    .where(and(matchesDirectoryRef(CLAIM_BUSINESS, { placeId, listingKey: null }), eq(directoryClaims.status, "approved")))
    .limit(1);
  if (approved.length > 0) return { kind: "refused", reason: "already-claimed" };

  const listingKey = keys.find((key) => key.split("/")[1] === place.citySlug);
  if (listingKey === undefined) return { kind: "refused", reason: "no-address" };
  return { kind: "claimable", placeId, listingKey };
}

/**
 * A `listing` business (rupees) owned by `userId`, carrying what its owner chose at sign-up. Refuses a user who
 * already belongs to a business.
 */
async function insertListingBusiness(
  tx: ScopedTransaction,
  userId: string,
  businessName: string,
  signupChoice: SignupChoice | null,
): Promise<{ readonly id: string }> {
  const existing = await tx
    .select({ businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(eq(businessMembers.userId, userId))
    .limit(1);
  if (existing.length > 0) throw new UserAlreadyHasBusinessError(userId);

  const business = await insertBusiness(tx, businessName, "INR", "listing");
  if (signupChoice !== null) await tx.update(businesses).set({ signupChoice }).where(eq(businesses.id, business.id));
  await tx.insert(businessMembers).values({ businessId: business.id, userId, role: "owner" });
  return business;
}

/**
 * Creates a free listing account's business (kind `listing`, rupees), its owner membership and its pending claim, all
 * or nothing. A claim by listing key names the place that key is a legacy key of, when there is one. A claim by place id
 * must be of a claimable place (findClaimablePlace; PlaceNotClaimableError otherwise, with nothing written) and keeps
 * that place's address in its own city as its listing key. Refuses a user who already belongs to a business: one
 * business per account. Staff connection only.
 */
export async function createListingAccountBusiness(
  db: Database,
  account: NewListingAccount,
): Promise<{ readonly businessId: string; readonly claimId: string }> {
  if (account.placeId === undefined) marketOfListing(account.listingKey);
  return db.transaction(async (tx) => {
    // Before any row: the claim's place and address are decided here (holdPlaceRegistryShared).
    if (account.placeId !== undefined) await holdPlaceRegistryShared(tx);
    const target = await claimTarget(tx, account);
    const business = await insertListingBusiness(tx, account.userId, account.businessName, account.signupChoice ?? null);
    const inserted = await tx
      .insert(directoryClaims)
      .values({
        businessId: business.id,
        listingKey: target.listingKey,
        placeId: target.placeId,
        businessName: account.businessName,
        phone: account.phone,
      })
      .returning({ id: directoryClaims.id });
    const claim = inserted[0];
    if (claim === undefined) throw new Error("Inserting a directory claim returned no row");
    return { businessId: business.id, claimId: claim.id };
  });
}

/** The listing key and place a new account's claim is stored with. */
async function claimTarget(
  tx: ScopedTransaction,
  account: NewListingAccount,
): Promise<{ readonly listingKey: string; readonly placeId: string | null }> {
  if (account.placeId === undefined) {
    // No holdPlaceRegistryShared here, as before ids: a claim by key only reads which place the key names, and the
    // key is stored whatever that is. A place the key gains or has just been given only makes this claim carry it
    // (the backfill and the import give every claim by key its place), whereas a claim by id decides the claim's
    // address and so must not run beside an import or backfill (createListingAccountBusiness takes the lock).
    const { placeId } = await resolveListingKey(tx, account.listingKey);
    return { listingKey: account.listingKey, placeId };
  }
  const found = await findClaimablePlace(tx, account.placeId);
  if (found.kind === "refused") throw new PlaceNotClaimableError(account.placeId, found.reason);
  return { listingKey: found.listingKey, placeId: found.placeId };
}

/**
 * Creates the business and owner membership of a free listing account whose business is not in the directory yet: no
 * claim until its owner adds the business (addBusinessListing). Refuses a user who already belongs to a business.
 * Staff connection only.
 */
export async function createUnlistedAccountBusiness(
  db: Database,
  account: {
    readonly userId: string;
    readonly businessName: string;
    readonly signupChoice?: SignupChoice | null;
    /** Where the owner said they are, asked at sign-up: an ISO alpha-2 code, and for India the GST state code. */
    readonly countryCode?: string | null;
    readonly stateCode?: string | null;
  },
): Promise<{ readonly businessId: string }> {
  return db.transaction(async (tx) => {
    const business = await insertListingBusiness(tx, account.userId, account.businessName, account.signupChoice ?? null);
    if (account.countryCode != null) {
      await tx
        .update(businesses)
        .set({ countryCode: account.countryCode, stateCode: account.stateCode ?? null })
        .where(eq(businesses.id, business.id));
    }
    return { businessId: business.id };
  });
}

/**
 * Where an owner-added business outside the opened districts is: the PIN code its owner gave (india_pincodes) and the
 * post-office locality's name, as India Post writes it, that they picked there.
 */
export interface ListingPostal {
  readonly pincode: string;
  readonly localityName: string;
}

/** What a free listing account's owner picked and typed on the Business page, already checked against the places. */
export interface NewBusinessListing {
  readonly businessId: string;
  /** The place's state: "mh" for an opened district, else the PIN's state. */
  readonly stateCode: string;
  readonly categorySlug: string;
  /** A town in an opened district, or elsewhereCitySlug(state, district) outside them. */
  readonly citySlug: string;
  /** An area in an opened district, or the PIN's locality slug outside them. */
  readonly areaSlug: string;
  /** The business name as a slug: the last part of the address, before any number added to keep it unique. */
  readonly slug: string;
  readonly businessName: string;
  readonly streetAddress: string;
  /** E.164, already normalised. */
  readonly phone: string;
  /** Outside the opened districts only: the PIN and its locality. Null in an opened district, whose area is in the key. */
  readonly postal: ListingPostal | null;
}

/** A claim's postal columns: both set outside the opened districts, both null in one. */
interface ClaimPostalColumns {
  readonly pincode: string | null;
  readonly localityName: string | null;
}

/** The claim's postal columns for `listing`. */
function claimPostalColumns(listing: Pick<NewBusinessListing, "postal">): ClaimPostalColumns {
  return { pincode: listing.postal?.pincode ?? null, localityName: listing.postal?.localityName ?? null };
}

/**
 * A listing whose place does not agree with itself: a PIN India Post does not have, or one whose state, district or
 * localities differ from the picks; a PIN in an opened district (it lists under its area, with no postal fields); or no
 * PIN outside the opened districts. The platform checks all of this before saving, so reaching it is a bug there.
 */
export class InvalidListingLocationError extends Error {
  constructor(
    readonly listing: Pick<NewBusinessListing, "stateCode" | "citySlug" | "areaSlug" | "postal">,
    problem: string,
  ) {
    const pin = listing.postal === null ? "no PIN" : `PIN ${listing.postal.pincode}`;
    super(`Listing ${listing.stateCode}/${listing.citySlug}/${listing.areaSlug} with ${pin}: ${problem}.`);
    this.name = "InvalidListingLocationError";
  }
}

/**
 * Checks where `listing` says the business is against India Post's directory and the opened districts, in the caller's
 * transaction, before any claim or place is written. With a PIN: the PIN is known, outside the opened districts, in
 * `stateCode`, its district is the key's city (<state>-<district>), and the area is one of its localities, by slug and
 * by name. Without one: the business is in a state with an opened district, under a town rather than an elsewhere city.
 */
async function assertListingLocation(tx: ScopedTransaction, listing: NewBusinessListing): Promise<void> {
  const { postal } = listing;
  if (postal === null) {
    if (!hasOpenedDistrict(listing.stateCode) || isElsewhereCitySlug(listing.citySlug)) {
      throw new InvalidListingLocationError(listing, "a business with no PIN must be in an opened district");
    }
    return;
  }
  const rows = await tx
    .select({ stateCode: indiaPincodes.stateCode, districtSlug: indiaPincodes.districtSlug, localities: indiaPincodes.localities })
    .from(indiaPincodes)
    .where(eq(indiaPincodes.pincode, postal.pincode))
    .limit(1);
  const pin = rows[0];
  if (pin === undefined) throw new InvalidListingLocationError(listing, "India Post's directory has no such PIN");
  if (pin.stateCode !== listing.stateCode) throw new InvalidListingLocationError(listing, `the PIN is in ${pin.stateCode}`);
  if (isOpenedDistrict(pin.stateCode, pin.districtSlug)) {
    throw new InvalidListingLocationError(listing, "the PIN is in an opened district, which lists by area");
  }
  if (listing.citySlug !== elsewhereCitySlug(pin.stateCode, pin.districtSlug)) {
    throw new InvalidListingLocationError(listing, `the PIN is in ${pin.districtSlug}`);
  }
  if (!pin.localities.some((locality) => locality.slug === listing.areaSlug && locality.name === postal.localityName)) {
    throw new InvalidListingLocationError(listing, `the PIN covers no locality "${postal.localityName}"`);
  }
}

export type AddBusinessListingOutcome =
  | { readonly kind: "added"; readonly claimId: string; readonly listingKey: string }
  | { readonly kind: "refused"; readonly reason: "already-listed" | "not-listing-account" };

/** How many numbered addresses are tried before giving up: `slug`, `slug-2` … `slug-50`. */
const ADDED_SLUG_ATTEMPTS = 50;

/**
 * The first of `slug`, `slug-2`, `slug-3`… that no pending or approved claim, no client's listing and no other place
 * (an open-data business's address, or one a client's listing had, which still redirects to it) holds in this category
 * and area. `ownPlaceId` is the business's own place, whose addresses are its own to keep. An owner whose business is
 * already in the directory gets a numbered address of its own; staff find the existing listing on the call.
 */
async function freeAddedListingKey(tx: ScopedTransaction, listing: NewBusinessListing, ownPlaceId: string | null): Promise<string> {
  const prefix = `${listing.categorySlug}/${listing.citySlug}/${listing.areaSlug}/`;
  const claimed = await tx
    .select({ key: directoryClaims.listingKey })
    .from(directoryClaims)
    .where(
      and(
        ne(directoryClaims.status, "rejected"),
        // The business's own claim does not hold an address against itself: an edit may keep the one it has.
        ne(directoryClaims.businessId, listing.businessId),
        sql`starts_with(${directoryClaims.listingKey}, ${prefix + listing.slug})`,
      ),
    );
  const placed = await tx
    .select({ slug: directoryListings.slug })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.categorySlug, listing.categorySlug),
        eq(directoryListings.citySlug, listing.citySlug),
        eq(directoryListings.areaSlug, listing.areaSlug),
        sql`starts_with(${directoryListings.slug}, ${listing.slug})`,
      ),
    );
  const registered = await tx
    .select({ key: directoryPlaceLegacyKeys.listingKey })
    .from(directoryPlaceLegacyKeys)
    .where(
      and(
        sql`starts_with(${directoryPlaceLegacyKeys.listingKey}, ${prefix + listing.slug})`,
        ownPlaceId === null ? undefined : ne(directoryPlaceLegacyKeys.placeId, ownPlaceId),
      ),
    );
  const taken = new Set([
    ...claimed.map((row) => row.key),
    ...placed.map((row) => prefix + row.slug),
    ...registered.map((row) => row.key),
  ]);
  for (let attempt = 1; attempt <= ADDED_SLUG_ATTEMPTS; attempt += 1) {
    const key = attempt === 1 ? prefix + listing.slug : `${prefix}${listing.slug}-${attempt}`;
    if (!taken.has(key)) return key;
  }
  throw new Error(`No free address for "${listing.slug}" in ${prefix}`);
}

/**
 * A free address for `listing`, chosen under a lock on its category and area so two accounts adding there at the same
 * moment cannot both be given the same one.
 */
async function lockedFreeAddedListingKey(
  tx: ScopedTransaction,
  listing: NewBusinessListing,
  ownPlaceId: string | null,
): Promise<string> {
  // The lock is on the category and area, not the typed name: "Smile" (given smile-2) and "Smile 2" reach the same address.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`directory-added:${listing.categorySlug}/${listing.citySlug}/${listing.areaSlug}`}))`,
  );
  const listingKey = await freeAddedListingKey(tx, listing, ownPlaceId);
  marketOfListing(listingKey);
  return listingKey;
}

/**
 * Whether the address a business already has is still the one for `listing`: the same category, city and area, and an
 * ending that is the name's slug with or without the number that kept it unique. An edit that changes none of those
 * keeps its address, even when a lower number has since come free (the owner was shown this one).
 */
function keepsAddedListingKey(currentKey: string, listing: NewBusinessListing): boolean {
  const prefix = `${listing.categorySlug}/${listing.citySlug}/${listing.areaSlug}/`;
  if (!currentKey.startsWith(prefix)) return false;
  const ending = currentKey.slice(prefix.length);
  return ending === listing.slug || (ending.startsWith(`${listing.slug}-`) && /^[0-9]+$/.test(ending.slice(listing.slug.length + 1)));
}

/**
 * The URL label an added business's page will have, /in/mh/<city>/business/<name>/<id>: its city, and its name's slug
 * cut to the URL's length. No number is added to keep it unique: the id at the end does that.
 */
function addedPlaceUrl(listing: Pick<NewBusinessListing, "citySlug" | "slug">): PlaceUrl {
  return { citySlug: listing.citySlug, urlSlug: toPlaceUrlSlug(listing.slug) };
}

/**
 * Adds a free listing account's business to the directory as a pending claim with `origin = 'added'`, and gives the
 * business the name its owner typed. The business gets its own place (its permanent id), unlocked: the owner may still
 * change its city and name until staff approve it (updateAddedBusinessListing), and approval locks its URL. Refused
 * for an account that already has a claim (one business per account) and for a business that is not a free listing
 * account. Staff connection only, after the platform has checked the customer; the business row is locked, so two
 * submissions by one account cannot both pass the checks, and the address is locked while it is chosen, so two
 * accounts cannot be given the same one.
 */
export async function addBusinessListing(db: Database, listing: NewBusinessListing, now: Date): Promise<AddBusinessListingOutcome> {
  return db.transaction(async (tx) => {
    // Before any row: the addresses other places hold must not change while one is chosen (holdPlaceRegistryShared).
    await holdPlaceRegistryShared(tx);
    await assertListingLocation(tx, listing);
    const owner = await tx.select({ kind: businesses.kind }).from(businesses).where(eq(businesses.id, listing.businessId)).limit(1).for("update");
    if (owner[0]?.kind !== "listing") return { kind: "refused", reason: "not-listing-account" };
    if ((await findClaimForBusiness(tx, listing.businessId)) !== null) return { kind: "refused", reason: "already-listed" };

    const listingKey = await lockedFreeAddedListingKey(tx, listing, null);
    const placeId = await createPlatformPlace(tx, { origin: "added", stateCode: listing.stateCode, ...addedPlaceUrl(listing) }, now);
    await tx.update(businesses).set({ name: listing.businessName }).where(eq(businesses.id, listing.businessId));
    const inserted = await tx
      .insert(directoryClaims)
      .values({
        businessId: listing.businessId,
        listingKey,
        placeId,
        businessName: listing.businessName,
        phone: listing.phone,
        origin: "added",
        streetAddress: listing.streetAddress,
        ...claimPostalColumns(listing),
      })
      .returning({ id: directoryClaims.id });
    const claim = inserted[0];
    if (claim === undefined) throw new Error("Inserting a directory claim returned no row");
    return { kind: "added", claimId: claim.id, listingKey };
  });
}

export type UpdateAddedBusinessOutcome =
  | { readonly kind: "updated"; readonly listingKey: string }
  /** `locked`: staff have decided the claim, or it is a claim to a listing the directory already had. */
  | { readonly kind: "refused"; readonly reason: "no-claim" | "locked" };

/**
 * Changes a business its owner added, while its claim still waits for the call: every pick, the name, the street
 * address and the number, and so possibly its web address, which nobody has seen yet. A new name or city moves its
 * place's URL label (updatePendingPlaceUrl); a new category or area does not, as neither is part of the URL. After staff
 * approve it the picks stay open (category, district and area; the URL and the name do not move), and the new address
 * is registered beside the old one; a rejected or claimed listing is fixed and changes go through staff. Staff connection only, after the platform
 * has checked the customer; the claim row is locked, so it cannot be approved half-way through.
 */
export async function updateAddedBusinessListing(
  db: Database,
  listing: NewBusinessListing,
  now: Date,
): Promise<UpdateAddedBusinessOutcome> {
  return db.transaction(async (tx) => {
    // Before the claim's row: an import or backfill runs first or after, never alongside (holdPlaceRegistryShared).
    await holdPlaceRegistryShared(tx);
    return changeAddedBusiness(tx, listing, now);
  });
}

/**
 * updateAddedBusinessListing's work inside a transaction the caller holds, which must already hold the place registry
 * (holdPlaceRegistryShared) before any row: the Business profile's Details tab (saveBusinessDetails) changes the name,
 * address and number of a business not published yet in the same transaction as its own row.
 */
export async function changeAddedBusiness(tx: ScopedTransaction, listing: NewBusinessListing, now: Date): Promise<UpdateAddedBusinessOutcome> {
  await assertListingLocation(tx, listing);
  const rows = await tx
    .select({
      id: directoryClaims.id,
      origin: directoryClaims.origin,
      status: directoryClaims.status,
      listingKey: directoryClaims.listingKey,
      placeId: directoryClaims.placeId,
      businessName: directoryClaims.businessName,
    })
    .from(directoryClaims)
    .where(eq(directoryClaims.businessId, listing.businessId))
    .limit(1)
    .for("update");
  const claim = rows[0];
  if (claim === undefined) return { kind: "refused", reason: "no-claim" };
  // An added business keeps its picks open after staff approve it: its web address is made from its id and its name,
  // neither of which these picks touch. A claimed listing is the directory's own record, and a rejected claim has none.
  if (claim.origin !== "added" || claim.status === "rejected") return { kind: "refused", reason: "locked" };
  const live = claim.status === "approved";
  // Once live the name is not part of this change (renameAddedBusiness is how it changes).
  if (live && listing.businessName !== claim.businessName) return { kind: "refused", reason: "locked" };
  // A claim from before places has no place to carry a state until the backfill gives it one: it stays in Thane.
  if (claim.placeId === null && listing.postal !== null) return { kind: "refused", reason: "locked" };

  // A claim from before places has none yet: the backfill gives it one from its address.
  const place = claim.placeId === null ? undefined : (await findPlaces(tx, [claim.placeId])).get(claim.placeId);
  const url = addedPlaceUrl(listing);
  const moves =
    place !== undefined &&
    (place.stateCode !== listing.stateCode || place.citySlug !== url.citySlug || place.urlSlug !== url.urlSlug);
  if (live) {
    // Live: the URL stays exactly as it is, whatever district or area is picked; only its state is part of it, and
    // that cannot move.
    if (place !== undefined && place.stateCode !== listing.stateCode) return { kind: "refused", reason: "locked" };
  } else {
    // Its page went live some other way (a client took the business over): the URL is no longer the owner's to change.
    if (moves && place.urlLockedAt !== null) return { kind: "refused", reason: "locked" };
    if (moves) await updatePendingPlaceUrl(tx, place.id, { stateCode: listing.stateCode, ...url }, now);
  }

  const listingKey = keepsAddedListingKey(claim.listingKey, listing)
    ? claim.listingKey
    : await lockedFreeAddedListingKey(tx, listing, claim.placeId);
  await tx.update(businesses).set({ name: listing.businessName }).where(eq(businesses.id, listing.businessId));
  await tx
    .update(directoryClaims)
    .set({
      listingKey,
      businessName: listing.businessName,
      phone: listing.phone,
      streetAddress: listing.streetAddress,
      ...claimPostalColumns(listing),
    })
    .where(eq(directoryClaims.id, claim.id));
  // A live business's old address keeps leading to its page, and so does the new one.
  if (live && listingKey !== claim.listingKey && claim.placeId !== null && (await isPlaceRegistryImported(tx))) {
    await registerLegacyKeys(tx, claim.placeId, [listingKey]);
  }
  return { kind: "updated", listingKey };
}

/**
 * Changes the name a confirmed added business is shown under; its web address stays as it is. False for anything
 * else: before the call the whole form is open (updateAddedBusinessListing), and a claimed listing's name is the
 * website's. Staff connection only, after the platform has checked the customer.
 */
export async function renameAddedBusiness(db: Database, businessId: string, businessName: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(directoryClaims)
      .set({ businessName })
      .where(and(eq(directoryClaims.businessId, businessId), eq(directoryClaims.origin, "added"), eq(directoryClaims.status, "approved")))
      .returning({ id: directoryClaims.id });
    if (rows.length === 0) return false;
    await tx.update(businesses).set({ name: businessName }).where(eq(businesses.id, businessId));
    return true;
  });
}

/** The business's kind. Works through row-level security (a member reads its own business) and on staff. */
export async function findBusinessKind(db: Runner, businessId: string): Promise<"website" | "listing" | null> {
  const rows = await db.select({ kind: businesses.kind }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return rows[0]?.kind ?? null;
}

/** What decides which dashboard a business gets, and whether it is held on the membership payment page. */
export interface BusinessEntry {
  readonly kind: "website" | "listing";
  /** What the owner chose at sign-up; null for a client made from a setup link and for older accounts. */
  readonly signupChoice: SignupChoice | null;
}

/** The business's kind and sign-up choice. Works through row-level security (a member reads its own business) and on staff. */
export async function findBusinessEntry(db: Runner, businessId: string): Promise<BusinessEntry | null> {
  const rows = await db
    .select({ kind: businesses.kind, signupChoice: businesses.signupChoice })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Changes what a free listing account wants. Its one use today: `listing_only`, when an owner who chose Premium at
 * sign-up decides to carry on free and stops being held on the payment page. False for anything that is not a free
 * listing account: a website client's choice is history. Staff connection only, after the platform has checked the
 * customer.
 */
export async function setListingSignupChoice(db: Database, businessId: string, signupChoice: SignupChoice): Promise<boolean> {
  const rows = await db
    .update(businesses)
    .set({ signupChoice })
    .where(and(eq(businesses.id, businessId), eq(businesses.kind, "listing")))
    .returning({ id: businesses.id });
  return rows.length > 0;
}

/** A free listing business that has just become a website client. */
export interface OpenedMembership {
  /** For the Payload tenant every client has (syncTenantForBusiness), which the caller creates once this commits. */
  readonly businessName: string;
}

/**
 * Opens the Premium membership for a free listing business whose first payment has just been recorded: it becomes a
 * website client and gets the onboarding project every client starts from. Null for a business that is already a
 * client (a setup-link client paying, or a second delivery of the same payment), which is left as it is. Its claim is
 * not touched, so its page on the local directory stays up. Staff connection, inside the payment's own transaction: the
 * kind only changes if the payment commits.
 */
export async function openMembershipForListingBusiness(tx: ScopedTransaction, businessId: string): Promise<OpenedMembership | null> {
  const converted = await tx
    .update(businesses)
    .set({ kind: "website" })
    .where(and(eq(businesses.id, businessId), eq(businesses.kind, "listing")))
    .returning({ businessName: businesses.name });
  const opened = converted[0];
  if (opened === undefined) return null;
  await insertOnboardingProject(tx, businessId);
  return opened;
}

export interface DirectoryClaim {
  readonly id: string;
  readonly businessId: string;
  readonly listingKey: string;
  /** The business's permanent id; null for an address the place registry does not know. */
  readonly placeId: string | null;
  readonly businessName: string;
  readonly phone: string;
  /** `added` for a business its owner added; it has no page on the website yet. */
  readonly origin: DirectoryClaimOrigin;
  /** An added business's address as its owner typed it; null for a claimed listing. */
  readonly streetAddress: string | null;
  /** An added business outside the opened districts: its PIN and post-office locality. Null otherwise, both together. */
  readonly pincode: string | null;
  readonly localityName: string | null;
  /** The business's own website as its owner gave it, or null. */
  readonly websiteUrl: string | null;
  readonly status: DirectoryClaimStatus;
  readonly decidedAt: Date | null;
  /** When the owner of an added business published it themselves; null for a claim staff decided or one not live. */
  readonly publishedAt: Date | null;
  readonly tagline: string | null;
  readonly taglineApproved: boolean;
  readonly createdAt: Date;
}

const CLAIM_COLUMNS = {
  id: directoryClaims.id,
  businessId: directoryClaims.businessId,
  listingKey: directoryClaims.listingKey,
  placeId: directoryClaims.placeId,
  businessName: directoryClaims.businessName,
  phone: directoryClaims.phone,
  origin: directoryClaims.origin,
  streetAddress: directoryClaims.streetAddress,
  pincode: directoryClaims.pincode,
  localityName: directoryClaims.localityName,
  websiteUrl: directoryClaims.websiteUrl,
  status: directoryClaims.status,
  decidedAt: directoryClaims.decidedAt,
  publishedAt: directoryClaims.publishedAt,
  tagline: directoryClaims.tagline,
  taglineApproved: directoryClaims.taglineApproved,
  createdAt: directoryClaims.createdAt,
} as const;

/** The business's claim, or null. Works through row-level security (the Advertise page) and on staff. */
export async function findClaimForBusiness(db: Runner, businessId: string): Promise<DirectoryClaim | null> {
  const rows = await db.select(CLAIM_COLUMNS).from(directoryClaims).where(eq(directoryClaims.businessId, businessId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Sets the ad's one line (null clears it). A new or changed line waits for staff approval; saving the same line
 * again keeps its approval. False for an account with no claim, or with a business it added (no page, so no ad). Staff connection only, after the platform has checked the customer owns the claim.
 */
export async function setClaimTagline(db: Database, businessId: string, tagline: string | null): Promise<boolean> {
  const rows = await db
    .update(directoryClaims)
    .set({
      tagline,
      taglineApproved: tagline === null ? false : sql`${directoryClaims.tagline} is not distinct from ${tagline} and ${directoryClaims.taglineApproved}`,
    })
    .where(eq(directoryClaims.businessId, businessId))
    .returning({ id: directoryClaims.id });
  return rows.length > 0;
}

/**
 * Sets the business's own website (null clears it), for a claimed listing or an added business alike. It shows on the
 * business's page once the claim is approved. False for an account with no claim, or one staff turned down. Staff
 * connection only, after the platform has checked the customer owns the claim and the address is a web address.
 */
export async function setClaimWebsite(db: Database, businessId: string, websiteUrl: string | null): Promise<boolean> {
  const rows = await db
    .update(directoryClaims)
    .set({ websiteUrl })
    .where(and(eq(directoryClaims.businessId, businessId), ne(directoryClaims.status, "rejected")))
    .returning({ id: directoryClaims.id });
  return rows.length > 0;
}

/** The columns a claims read matches businesses on. */
const CLAIM_BUSINESS = { placeId: directoryClaims.placeId, listingKey: directoryClaims.listingKey } as const;

/**
 * The website each business in `lookup` has from its owner, for listings claimed and confirmed: the public status feed
 * shows it on the business's page. Keyed by place id, or by listing key for a key no place has; businesses with none
 * are absent. Staff connection.
 */
export async function readClaimedWebsites(db: Database, lookup: DirectoryLookup): Promise<ReadonlyMap<string, string>> {
  if (isEmptyDirectoryLookup(lookup)) return new Map();
  const rows = await db
    .select({ business: directoryBusinessOf(CLAIM_BUSINESS), websiteUrl: directoryClaims.websiteUrl })
    .from(directoryClaims)
    .where(and(matchesDirectoryLookup(CLAIM_BUSINESS, lookup), eq(directoryClaims.status, "approved"), eq(directoryClaims.origin, "claimed")));
  const out = new Map<string, string>();
  for (const row of rows) {
    if (row.websiteUrl !== null) out.set(row.business, row.websiteUrl);
  }
  return out;
}

/** Who a listing's visitors' enquiries go to: the account that owns it on Fynix. */
export interface ListingOwner {
  readonly businessId: string;
  /**
   * `listing`: a free listing account, whose dashboard has the Listing page. `client`: a paying website client, at the
   * address staff placed its Featured listing. `member`: a free listing account that has since bought the Premium
   * membership and still owns the listing through its own claim: it is a website client now, and its dashboard keeps
   * the free listing's pages for that claim (apps/platform lib/listing-sections.ts).
   */
  readonly account: "listing" | "client" | "member";
  readonly businessName: string;
  readonly ownerName: string;
  readonly ownerEmail: string;
  /**
   * The owner can be written to at `ownerEmail`. A free listing account confirms its address by a link; a client's
   * address is the one its setup link was sent to. False for an owner who signs in with a mobile number, whatever
   * kind of account it is: that address is a placeholder nobody reads.
   */
  readonly emailConfirmed: boolean;
}

/**
 * The owner of a directory business, or null when nobody on Fynix owns it: the paying client whose listing staff
 * placed on its place, else the free listing account whose claim to it (or whose added business) staff approved. Each
 * is unique per place (directory_listings_place_id_idx, directory_claims_place_id_approved_idx); a claim made by one of
 * the place's legacy keys before the backfill counts too, after one that has the place. A key no place has is owned by
 * an approved claim to that key, else by a client whose listing (with no place yet) is at that address: the match
 * before ids, kept until keys go (Task 13). Staff connection.
 */
export async function findListingOwner(db: Database, business: DirectoryRef): Promise<ListingOwner | null> {
  const owner = { ownerName: users.name, ownerEmail: users.email, emailVerified: users.emailVerified };
  const placed = await db
    .select({ businessId: directoryListings.businessId, businessName: businesses.name, ...owner })
    .from(directoryListings)
    .innerJoin(businesses, eq(businesses.id, directoryListings.businessId))
    .innerJoin(businessMembers, and(eq(businessMembers.businessId, directoryListings.businessId), eq(businessMembers.role, "owner")))
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(business.placeId !== null ? eq(directoryListings.placeId, business.placeId) : listingAtUnplacedKey(business.listingKey))
    .orderBy(directoryListings.stateCode)
    .limit(1);
  const client = placed[0];
  if (client !== undefined) {
    // A client from a setup link has an account only because it opened the link sent to that address. One that
    // joined on the entry page and bought the membership signs in with a mobile number, and has no address to write to.
    return {
      businessId: client.businessId,
      account: "client",
      businessName: client.businessName,
      ownerName: client.ownerName,
      ownerEmail: client.ownerEmail,
      emailConfirmed: !isPhoneAccountEmail(client.ownerEmail),
    };
  }

  const claimed = await db
    .select({ businessId: directoryClaims.businessId, businessName: directoryClaims.businessName, kind: businesses.kind, ...owner })
    .from(directoryClaims)
    .innerJoin(businesses, eq(businesses.id, directoryClaims.businessId))
    .innerJoin(businessMembers, and(eq(businessMembers.businessId, directoryClaims.businessId), eq(businessMembers.role, "owner")))
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(and(matchesDirectoryRef(CLAIM_BUSINESS, business), eq(directoryClaims.status, "approved")))
    .orderBy(sql`${directoryClaims.placeId} is null`)
    .limit(1);
  const claim = claimed[0];
  if (claim === undefined) return null;
  const { emailVerified, kind, ...rest } = claim;
  return {
    ...rest,
    account: kind === "listing" ? "listing" : "member",
    emailConfirmed: emailVerified && !isPhoneAccountEmail(claim.ownerEmail),
  };
}

/**
 * A client listing with no place yet at the address `listingKey` names (`<category>/<city>/<area>/<slug>`, which has no
 * state, so the first state wins: the directory only covers mh today).
 */
function listingAtUnplacedKey(listingKey: string): SQL {
  const [categorySlug, citySlug, areaSlug, slug] = listingKey.split("/");
  if (categorySlug === undefined || citySlug === undefined || areaSlug === undefined || slug === undefined) return sql`false`;
  return (
    and(
      isNull(directoryListings.placeId),
      eq(directoryListings.categorySlug, categorySlug),
      eq(directoryListings.citySlug, citySlug),
      eq(directoryListings.areaSlug, areaSlug),
      eq(directoryListings.slug, slug),
    ) ?? sql`false`
  );
}

export interface StaffDirectoryClaim extends DirectoryClaim {
  readonly ownerName: string | null;
  /** Null for an owner who signs in with a phone number: the account's address is only a placeholder. */
  readonly ownerEmail: string | null;
  /**
   * The owner has proven a way to reach them is theirs: opened the link we emailed, or signed in with a number
   * that was proven when their account was made. Null only for a claim with no owner, which cannot happen.
   */
  readonly ownerEmailConfirmed: boolean | null;
}

export type DirectoryClaimFilter = DirectoryClaimStatus | "tagline";

/**
 * Claims for the staff console: one status (oldest first for `pending`, newest first otherwise), or `tagline` for
 * approved claims whose line waits for approval.
 */
export async function listDirectoryClaimsForStaff(
  db: Database,
  input: { readonly filter: DirectoryClaimFilter; readonly limit: number; readonly offset: number },
): Promise<{ readonly claims: StaffDirectoryClaim[]; readonly total: number }> {
  const where =
    input.filter === "tagline"
      ? and(
          eq(directoryClaims.status, "approved"),
          sql`${directoryClaims.tagline} is not null`,
          eq(directoryClaims.taglineApproved, false),
        )
      : eq(directoryClaims.status, input.filter);
  const order =
    input.filter === "pending" || input.filter === "tagline"
      ? [asc(directoryClaims.createdAt), asc(directoryClaims.id)]
      : [desc(directoryClaims.decidedAt), desc(directoryClaims.id)];
  const [rows, totals] = await Promise.all([
    // A listing account has exactly one owner (createListingAccountBusiness), so the joins never multiply a claim.
    db
      .select({
        ...CLAIM_COLUMNS,
        ownerName: users.name,
        ownerEmail: users.email,
        ownerEmailConfirmed: sql<boolean | null>`${users.emailVerified} or ${users.phoneNumberVerified}`,
      })
      .from(directoryClaims)
      .leftJoin(
        businessMembers,
        and(eq(businessMembers.businessId, directoryClaims.businessId), eq(businessMembers.role, "owner")),
      )
      .leftJoin(users, eq(users.id, businessMembers.userId))
      .where(where)
      .orderBy(...order)
      .limit(input.limit)
      .offset(input.offset),
    db.select({ value: count() }).from(directoryClaims).where(where),
  ]);
  // A phone account's address is a placeholder nobody can be written to, so staff are not shown one.
  const claims = rows.map((row) => ({
    ...row,
    ownerEmail: row.ownerEmail === null || isPhoneAccountEmail(row.ownerEmail) ? null : row.ownerEmail,
  }));
  return { claims, total: totals[0]?.value ?? 0 };
}

/** A business its owner added and staff confirmed on the call: what the public directory shows of it. */
export interface ConfirmedAddedBusiness {
  readonly businessId: string;
  readonly listingKey: string;
  /** Its permanent id, once the backfill has given it one; null before. */
  readonly placeId: string | null;
  readonly businessName: string;
  readonly streetAddress: string | null;
  readonly phone: string;
  /** The business's own website, as its owner gave it, or null. */
  readonly websiteUrl: string | null;
  readonly confirmedAt: Date;
  /**
   * Whether Fynix has verified it: staff approved it (a confirmation call), or it has a verification row (the
   * owner's code check). An owner who only published it (Claimed) has neither, so the website must not call it Verified.
   */
  readonly verified: boolean;
  /** Its place's state (PRE_PLACES_STATE_CODE before it has a place). */
  readonly stateCode: string;
  /** Outside the opened districts: where India Post puts its PIN. Null in an opened district. */
  readonly postal: {
    readonly pincode: string;
    readonly localityName: string;
    readonly districtName: string;
  } | null;
  /** The map pin from the Google Maps link its owner gave on the Details tab; null when they gave none with a pin. */
  readonly pin: { readonly lat: number; readonly lon: number } | null;
}

/**
 * Every owner-added business whose claim staff approved, for the public feed, in a stable order. An approved claim
 * always has its decision time (directory_claims_decided_check). Staff connection only.
 */
export async function listConfirmedAddedBusinesses(db: Database): Promise<ConfirmedAddedBusiness[]> {
  const rows = await db
    .select({
      businessId: directoryClaims.businessId,
      listingKey: directoryClaims.listingKey,
      placeId: directoryClaims.placeId,
      businessName: directoryClaims.businessName,
      streetAddress: directoryClaims.streetAddress,
      phone: directoryClaims.phone,
      websiteUrl: directoryClaims.websiteUrl,
      decidedAt: directoryClaims.decidedAt,
      // Written with the claims table's name on every column: Drizzle leaves a lone table's columns unqualified, and
      // inside the subquery a bare `listing_key` would mean the verification's own, matching every row.
      verified: sql<boolean>`(directory_claims.published_at is null or exists (select 1 from directory_verifications v where v.listing_key = directory_claims.listing_key or (directory_claims.place_id is not null and v.place_id = directory_claims.place_id)))`.mapWith(Boolean),
      stateCode: directoryPlaces.stateCode,
      pincode: directoryClaims.pincode,
      localityName: directoryClaims.localityName,
      districtName: indiaPincodes.districtName,
      latitude: directoryBusinessProfiles.latitude,
      longitude: directoryBusinessProfiles.longitude,
    })
    .from(directoryClaims)
    .leftJoin(directoryPlaces, eq(directoryPlaces.id, directoryClaims.placeId))
    .leftJoin(indiaPincodes, eq(indiaPincodes.pincode, directoryClaims.pincode))
    .leftJoin(directoryBusinessProfiles, eq(directoryBusinessProfiles.businessId, directoryClaims.businessId))
    .where(and(eq(directoryClaims.origin, "added"), eq(directoryClaims.status, "approved"), businessNotClosing(directoryClaims.businessId)))
    .orderBy(asc(directoryClaims.listingKey));
  return rows.flatMap(({ decidedAt, stateCode, pincode, localityName, districtName, latitude, longitude, ...row }) =>
    decidedAt === null
      ? []
      : [
          {
            ...row,
            confirmedAt: decidedAt,
            stateCode: stateCode ?? PRE_PLACES_STATE_CODE,
            // The PIN is always in india_pincodes: the Listing tab only saves a PIN it found there, and the import never deletes.
            postal: pincode !== null && localityName !== null && districtName !== null ? { pincode, localityName, districtName } : null,
            // The profile keeps both or neither (its check constraint).
            pin: latitude !== null && longitude !== null ? { lat: latitude, lon: longitude } : null,
          },
        ],
  );
}

/** An approved claim on a business the directory already had, as the feed names it. */
export interface ApprovedClaimedBusiness {
  readonly businessId: string;
  readonly listingKey: string;
  /** Its permanent place id: the website lays the owner's profile over the open-data row with this id. */
  readonly placeId: string;
}

/**
 * The approved claims on businesses the directory already had (`origin = 'claimed'`), whose owners' Business profile
 * the feed lays over those businesses' open-data rows (added 2026-10-12). Only a claim with a place: the website names
 * a business by its place id. A closing account's claim is left out until it is restored. Staff connection only.
 */
export async function listApprovedClaimedBusinesses(db: Database): Promise<ApprovedClaimedBusiness[]> {
  const rows = await db
    .select({ businessId: directoryClaims.businessId, listingKey: directoryClaims.listingKey, placeId: directoryClaims.placeId })
    .from(directoryClaims)
    .where(and(eq(directoryClaims.origin, "claimed"), eq(directoryClaims.status, "approved"), businessNotClosing(directoryClaims.businessId)))
    .orderBy(asc(directoryClaims.listingKey));
  return rows.flatMap(({ businessId, listingKey, placeId }) => (placeId === null ? [] : [{ businessId, listingKey, placeId }]));
}

export interface DirectoryClaimCounts {
  readonly pending: number;
  readonly approved: number;
  readonly rejected: number;
  readonly tagline: number;
}

export async function countDirectoryClaims(db: Database): Promise<DirectoryClaimCounts> {
  const rows = await db
    .select({
      pending: sql<number>`count(*) filter (where ${directoryClaims.status} = 'pending')`.mapWith(Number),
      approved: sql<number>`count(*) filter (where ${directoryClaims.status} = 'approved')`.mapWith(Number),
      rejected: sql<number>`count(*) filter (where ${directoryClaims.status} = 'rejected')`.mapWith(Number),
      tagline: sql<number>`count(*) filter (where ${directoryClaims.status} = 'approved' and ${directoryClaims.tagline} is not null and not ${directoryClaims.taglineApproved})`.mapWith(Number),
    })
    .from(directoryClaims);
  return rows[0] ?? { pending: 0, approved: 0, rejected: 0, tagline: 0 };
}

/**
 * An approved claim's business page is live, so its URL is frozen (a claimed listing's open-data place already is).
 * An added business's address is registered as its place's old address, so the website, which still asks by address
 * until it asks by id, reaches the place, and the address 301s to it afterwards. Not before the dataset's places are
 * imported: that address may be an open-data business's (the backfill registers it then), and one another place
 * already has stays with that place.
 */
async function approvePlace(
  tx: ScopedTransaction,
  placeId: string,
  origin: DirectoryClaimOrigin,
  listingKey: string,
  now: Date,
): Promise<void> {
  await lockPlaceUrl(tx, placeId, now);
  if (origin === "added" && (await isPlaceRegistryImported(tx))) await registerLegacyKeys(tx, placeId, [listingKey]);
}

/**
 * `changed`: the owner has changed the claim's details since staff saw them, so what was confirmed is not what is there.
 * `email-unconfirmed`: the owner has not opened the link we emailed, so the address may not be theirs; nothing is approved.
 */
export type ClaimDecisionOutcome = "decided" | "not-found" | "listing-taken" | "changed" | "email-unconfirmed";

/** What the staff console showed for a claim when Approve was pressed: the details the call confirmed. */
export interface SeenClaimDetails {
  readonly listingKey: string;
  readonly phone: string;
  readonly businessName: string;
}

/**
 * Approves or rejects a claim (staff, after calling the number). Approving marks the listing verified with the claim's
 * phone unless it already is (a claimed listing only: an added business has no page to verify), and fails as
 * `listing-taken` when another account's claim to the listing is approved. Approving locks the business's URL
 * (approvePlace): its page is live, and from then on only staff change its URL (changePlaceUrl).
 * Rejecting an approved claim revokes it: its ads stop showing and its open bids lose at settlement. The URL stays
 * locked: the page was live, and its links must keep working.
 * Approving also needs the owner to have confirmed their email address or the phone number they sign in with
 * (`email-unconfirmed` otherwise): an account opened with someone else's address must not end up owning a listing.
 *
 * The owner of an added business may change it until the claim is decided, so an approval names what staff `seen`
 * (the address, number and name the call confirmed): if any of them has changed since, nothing is approved and the
 * outcome is `changed`.
 */
export async function decideDirectoryClaim(
  db: Database,
  input: {
    readonly claimId: string;
    readonly approve: boolean;
    readonly staffId: string;
    readonly now: Date;
    readonly seen?: SeenClaimDetails;
  },
): Promise<ClaimDecisionOutcome> {
  const { seen } = input;
  const asSeen =
    input.approve && seen !== undefined
      ? and(
          eq(directoryClaims.listingKey, seen.listingKey),
          eq(directoryClaims.phone, seen.phone),
          eq(directoryClaims.businessName, seen.businessName),
        )
      : undefined;
  try {
    return await db.transaction(async (tx) => {
      if (input.approve) {
        // An approval locks the place and may register its address: before any row (holdPlaceRegistryShared).
        await holdPlaceRegistryShared(tx);
        const owners = await tx
          .select({ emailVerified: users.emailVerified, phoneNumberVerified: users.phoneNumberVerified })
          .from(directoryClaims)
          .innerJoin(businessMembers, and(eq(businessMembers.businessId, directoryClaims.businessId), eq(businessMembers.role, "owner")))
          .innerJoin(users, eq(users.id, businessMembers.userId))
          .where(eq(directoryClaims.id, input.claimId))
          .limit(1);
        // Either proof will do: the link we emailed, or the number the owner signs in with, proven when their account was made.
        if (owners[0] !== undefined && !owners[0].emailVerified && !owners[0].phoneNumberVerified) return "email-unconfirmed";
      }
      const updated = await tx
        .update(directoryClaims)
        .set({ status: input.approve ? "approved" : "rejected", decidedAt: input.now, decidedByUserId: input.staffId })
        .where(and(eq(directoryClaims.id, input.claimId), asSeen))
        .returning({
          listingKey: directoryClaims.listingKey,
          placeId: directoryClaims.placeId,
          businessName: directoryClaims.businessName,
          phone: directoryClaims.phone,
          origin: directoryClaims.origin,
        });
      const claim = updated[0];
      if (claim === undefined) {
        if (asSeen === undefined) return "not-found";
        const exists = await tx.select({ id: directoryClaims.id }).from(directoryClaims).where(eq(directoryClaims.id, input.claimId)).limit(1);
        return exists.length > 0 ? "changed" : "not-found";
      }
      if (input.approve && claim.placeId !== null) await approvePlace(tx, claim.placeId, claim.origin, claim.listingKey, input.now);
      // An added business's address was made from its owner's picks and may be one the website already lists for a
      // different business: verifying it would put this owner's number on that page.
      if (input.approve && claim.origin === "claimed") {
        await tx
          .insert(directoryVerifications)
          .values({
            listingKey: claim.listingKey,
            placeId: claim.placeId,
            businessName: claim.businessName,
            phone: claim.phone,
            verifiedAt: input.now,
            verifiedByUserId: input.staffId,
          })
          // Already verified at this address, or (by place) at another of the business's addresses.
          .onConflictDoNothing();
      }
      return "decided";
    });
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) return "listing-taken";
    throw error;
  }
}

/**
 * Why an owner's Publish did nothing. `taken-down`: staff turned the business down or took its page off.
 * `owner-unconfirmed`: the owner has confirmed neither their email address nor the number they sign in with.
 * `listing-taken`: another account's approved claim holds the same address or place.
 */
export type PublishRefusal = "no-claim" | "not-added" | "already-published" | "taken-down" | "owner-unconfirmed" | "listing-taken";

export type PublishAddedBusinessOutcome =
  | { readonly kind: "published"; readonly listingKey: string; readonly placeId: string | null }
  | { readonly kind: "refused"; readonly reason: PublishRefusal };

/**
 * The owner of an added business publishes it from their Business profile (docs/superpowers/specs/2026-10-01-business-
 * profile-design.md): their claim is approved by themselves, with no call from us, and its page goes live as Claimed,
 * never Verified. It is the staff approval's path otherwise: the place's URL is locked (approvePlace), and the business
 * joins the feed (listConfirmedAddedBusinesses). Only an added business is published this way; a claim to a listing
 * the directory already had is still confirmed by staff, since that business may be someone else's. The owner must
 * have proved their email address or their sign-in number, as staff approval requires. Staff connection only, after
 * the platform has checked the customer; `userId` must be the business's owner.
 */
export async function publishAddedBusiness(
  db: Database,
  input: { readonly businessId: string; readonly userId: string; readonly now: Date },
): Promise<PublishAddedBusinessOutcome> {
  try {
    return await db.transaction(async (tx) => {
      // Publishing locks the place and may register its address: before any row (holdPlaceRegistryShared).
      await holdPlaceRegistryShared(tx);
      const claims = await tx
        .select({
          id: directoryClaims.id,
          origin: directoryClaims.origin,
          status: directoryClaims.status,
          listingKey: directoryClaims.listingKey,
          placeId: directoryClaims.placeId,
        })
        .from(directoryClaims)
        .where(eq(directoryClaims.businessId, input.businessId))
        .limit(1)
        .for("update");
      const claim = claims[0];
      if (claim === undefined) return { kind: "refused", reason: "no-claim" };
      if (claim.origin !== "added") return { kind: "refused", reason: "not-added" };
      if (claim.status === "rejected") return { kind: "refused", reason: "taken-down" };
      if (claim.status === "approved") return { kind: "refused", reason: "already-published" };

      const owners = await tx
        .select({ emailVerified: users.emailVerified, phoneNumberVerified: users.phoneNumberVerified })
        .from(businessMembers)
        .innerJoin(users, eq(users.id, businessMembers.userId))
        .where(
          and(eq(businessMembers.businessId, input.businessId), eq(businessMembers.userId, input.userId), eq(businessMembers.role, "owner")),
        )
        .limit(1);
      const owner = owners[0];
      // Either proof will do, as for staff approval: the link we emailed, or the sign-in number, proven when the account was made.
      if (owner === undefined || (!owner.emailVerified && !owner.phoneNumberVerified)) return { kind: "refused", reason: "owner-unconfirmed" };

      await tx
        .update(directoryClaims)
        .set({ status: "approved", decidedAt: input.now, decidedByUserId: input.userId, publishedAt: input.now })
        .where(eq(directoryClaims.id, claim.id));
      if (claim.placeId !== null) await approvePlace(tx, claim.placeId, claim.origin, claim.listingKey, input.now);
      return { kind: "published", listingKey: claim.listingKey, placeId: claim.placeId };
    });
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) return { kind: "refused", reason: "listing-taken" };
    throw error;
  }
}

/** Approves the claim's current tagline (staff). False when there is no line to approve. */
export async function approveClaimTagline(db: Database, claimId: string): Promise<boolean> {
  const rows = await db
    .update(directoryClaims)
    .set({ taglineApproved: true })
    .where(and(eq(directoryClaims.id, claimId), sql`${directoryClaims.tagline} is not null`))
    .returning({ id: directoryClaims.id });
  return rows.length > 0;
}

// ── Prices ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DirectoryAdPrice {
  readonly categorySlug: string;
  readonly topWeekPaise: number;
  readonly sideWeekPaise: number;
  readonly updatedAt: Date;
}

const PRICE_COLUMNS = {
  categorySlug: directoryAdPrices.categorySlug,
  topWeekPaise: directoryAdPrices.topWeekPaise,
  sideWeekPaise: directoryAdPrices.sideWeekPaise,
  updatedAt: directoryAdPrices.updatedAt,
} as const;

/** Every category's price, by slug. Works for the customer role and staff. */
export async function listDirectoryAdPrices(db: Runner): Promise<DirectoryAdPrice[]> {
  return db.select(PRICE_COLUMNS).from(directoryAdPrices).orderBy(asc(directoryAdPrices.categorySlug));
}

export async function findDirectoryAdPrice(db: Runner, categorySlug: string): Promise<DirectoryAdPrice | null> {
  const rows = await db.select(PRICE_COLUMNS).from(directoryAdPrices).where(eq(directoryAdPrices.categorySlug, categorySlug)).limit(1);
  return rows[0] ?? null;
}

/** The reserve for a list page's placement from a category's price (placementReserve covers every placement). */
export function reserveFor(price: Pick<DirectoryAdPrice, "topWeekPaise" | "sideWeekPaise">, placement: "top" | "side"): number {
  return placement === "top" ? price.topWeekPaise : price.sideWeekPaise;
}

/** Sets a category's weekly prices (staff). The database checks the amounts. */
export async function setDirectoryAdPrice(
  db: Database,
  input: { readonly categorySlug: string; readonly topWeekPaise: number; readonly sideWeekPaise: number; readonly staffId: string },
): Promise<void> {
  const values = {
    categorySlug: input.categorySlug,
    topWeekPaise: input.topWeekPaise,
    sideWeekPaise: input.sideWeekPaise,
    updatedByUserId: input.staffId,
  };
  await db
    .insert(directoryAdPrices)
    .values(values)
    .onConflictDoUpdate({
      target: directoryAdPrices.categorySlug,
      set: { topWeekPaise: values.topWeekPaise, sideWeekPaise: values.sideWeekPaise, updatedByUserId: values.updatedByUserId, updatedAt: new Date() },
    });
}

/** Closes a category to new bids (staff). Bids already placed still settle, at the lowest bid as the reserve. */
export async function removeDirectoryAdPrice(db: Database, categorySlug: string): Promise<boolean> {
  const rows = await db.delete(directoryAdPrices).where(eq(directoryAdPrices.categorySlug, categorySlug)).returning({ slug: directoryAdPrices.categorySlug });
  return rows.length > 0;
}

export interface DirectoryAdSpotPrice {
  /** The category a `profile` price is for, or HOME_AD_SCOPE_SLUG for the `home` price. */
  readonly scopeSlug: string;
  readonly placement: Extract<DirectoryAdPlacement, "home" | "profile">;
  readonly weekPaise: number;
  readonly updatedAt: Date;
}

const SPOT_PRICE_COLUMNS = {
  scopeSlug: directoryAdSpotPrices.scopeSlug,
  placement: directoryAdSpotPrices.placement,
  weekPaise: directoryAdSpotPrices.weekPaise,
  updatedAt: directoryAdSpotPrices.updatedAt,
} as const;

function asSpotPrice(row: { scopeSlug: string; placement: DirectoryAdPlacement; weekPaise: number; updatedAt: Date }): DirectoryAdSpotPrice {
  if (row.placement !== "home" && row.placement !== "profile") {
    throw new Error(`directory_ad_spot_prices holds a ${row.placement} price, which its check forbids`);
  }
  return { scopeSlug: row.scopeSlug, placement: row.placement, weekPaise: row.weekPaise, updatedAt: row.updatedAt };
}

/** Every home and business-page price: the home page's, then each category's. */
export async function listDirectoryAdSpotPrices(db: Runner): Promise<DirectoryAdSpotPrice[]> {
  const rows = await db.select(SPOT_PRICE_COLUMNS).from(directoryAdSpotPrices).orderBy(asc(directoryAdSpotPrices.placement), asc(directoryAdSpotPrices.scopeSlug));
  return rows.map(asSpotPrice);
}

/** Sets the weekly price of the home page (`scopeSlug` HOME_AD_SCOPE_SLUG) or a category's business pages (staff). */
export async function setDirectoryAdSpotPrice(
  db: Database,
  input: { readonly scopeSlug: string; readonly placement: "home" | "profile"; readonly weekPaise: number; readonly staffId: string },
): Promise<void> {
  await db
    .insert(directoryAdSpotPrices)
    .values({ scopeSlug: input.scopeSlug, placement: input.placement, weekPaise: input.weekPaise, updatedByUserId: input.staffId })
    .onConflictDoUpdate({
      target: [directoryAdSpotPrices.scopeSlug, directoryAdSpotPrices.placement],
      set: { weekPaise: input.weekPaise, updatedByUserId: input.staffId, updatedAt: new Date() },
    });
}

/** Closes the home page, or a category's business pages, to new bids (staff). Bids already placed still settle. */
export async function removeDirectoryAdSpotPrice(db: Database, scopeSlug: string, placement: "home" | "profile"): Promise<boolean> {
  const rows = await db
    .delete(directoryAdSpotPrices)
    .where(and(eq(directoryAdSpotPrices.scopeSlug, scopeSlug), eq(directoryAdSpotPrices.placement, placement)))
    .returning({ scopeSlug: directoryAdSpotPrices.scopeSlug });
  return rows.length > 0;
}

/**
 * The lowest bid for a placement in an auction, or null when staff have not opened it: a list page's top and side from
 * the category's price, a business page's from the category's `profile` price, the home page from its one price.
 * `scope` is the auction's market (auctionScope), so a `home` auction's category is HOME_AD_SCOPE_SLUG.
 */
export async function placementReserve(db: Runner, scope: DirectoryAdMarket, placement: DirectoryAdPlacement): Promise<number | null> {
  if (placement === "top" || placement === "side") {
    const price = await findDirectoryAdPrice(db, scope.categorySlug);
    return price === null ? null : reserveFor(price, placement);
  }
  const rows = await db
    .select({ weekPaise: directoryAdSpotPrices.weekPaise })
    .from(directoryAdSpotPrices)
    .where(
      and(
        eq(directoryAdSpotPrices.scopeSlug, placement === "home" ? HOME_AD_SCOPE_SLUG : scope.categorySlug),
        eq(directoryAdSpotPrices.placement, placement),
      ),
    )
    .limit(1);
  return rows[0]?.weekPaise ?? null;
}

// ── Bids ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DirectoryAdBid {
  readonly id: string;
  readonly placement: DirectoryAdPlacement;
  readonly weekStart: string;
  readonly amountPaise: number;
  readonly status: DirectoryAdBidStatus;
  readonly amountSetAt: Date;
}

const BID_COLUMNS = {
  id: directoryAdBids.id,
  placement: directoryAdBids.placement,
  weekStart: directoryAdBids.weekStart,
  amountPaise: directoryAdBids.amountPaise,
  status: directoryAdBids.status,
  amountSetAt: directoryAdBids.amountSetAt,
} as const;

/** The business's bids for weeks from `fromWeek` on, soonest first. Works through row-level security. */
export async function listBidsForBusiness(db: Runner, businessId: string, fromWeek: string): Promise<DirectoryAdBid[]> {
  return db
    .select(BID_COLUMNS)
    .from(directoryAdBids)
    .where(and(eq(directoryAdBids.businessId, businessId), gte(directoryAdBids.weekStart, fromWeek)))
    .orderBy(asc(directoryAdBids.weekStart), asc(directoryAdBids.placement));
}

export type BidOutcome =
  | { readonly kind: "saved" }
  | { readonly kind: "withdrawn" }
  | {
      readonly kind: "refused";
      /**
       * `spot-taken`: staff have placed ads on every spot of that placement for the week, so there is nothing to win.
       * `no-page`: the business was added by its owner and has no page on the website for an ad to lead to.
       */
      readonly reason: BidChangeRefusal | "no-claim" | "claim-not-approved" | "no-page" | "not-open" | "no-bid" | "spot-taken";
    };

export interface BidInput {
  readonly businessId: string;
  readonly placement: DirectoryAdPlacement;
  readonly weekStart: string;
  /** Whole rupees in paise, or null to withdraw. */
  readonly amountPaise: number | null;
  readonly now: Date;
}

/**
 * Places, changes or withdraws the business's bid for a placement in its own market for one week, after checking its
 * claim is approved, the listing has a page, the category is open (has a price) and the auction rules (bidChangeRefusal). Takes the
 * settlement lock shared, so it cannot interleave with the auction it belongs to settling. Staff connection only.
 */
export async function saveDirectoryAdBid(db: Database, input: BidInput): Promise<BidOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock_shared(${SETTLEMENT_LOCK_KEY})`);
    const claim = await findClaimForBusiness(tx, input.businessId);
    if (claim === null) return { kind: "refused", reason: "no-claim" };
    if (claim.status !== "approved") return { kind: "refused", reason: "claim-not-approved" };
    // A business its owner added has a page once it has a place; with none there is nothing for an ad to lead to.
    if (claim.origin === "added" && claim.placeId === null) return { kind: "refused", reason: "no-page" };
    const scope = auctionScope(input.placement, marketOfListing(claim.listingKey));
    const reservePaise = await placementReserve(tx, scope, input.placement);
    if (reservePaise === null) return { kind: "refused", reason: "not-open" };

    const existingRows = await tx
      .select(BID_COLUMNS)
      .from(directoryAdBids)
      .where(
        and(
          eq(directoryAdBids.businessId, input.businessId),
          eq(directoryAdBids.placement, input.placement),
          eq(directoryAdBids.weekStart, input.weekStart),
        ),
      )
      .limit(1)
      .for("update");
    const existing = existingRows[0];
    const current = existing !== undefined && existing.status === "active" ? existing : null;

    if (input.amountPaise === null && current === null) return { kind: "refused", reason: "no-bid" };
    const refusal = bidChangeRefusal({
      weekStart: input.weekStart,
      reservePaise,
      currentPaise: current?.amountPaise ?? null,
      amountPaise: input.amountPaise,
      now: input.now,
    });
    if (refusal !== null) return { kind: "refused", reason: refusal };

    if (input.amountPaise === null) {
      if (current === null) return { kind: "refused", reason: "no-bid" };
      await tx.update(directoryAdBids).set({ status: "withdrawn" }).where(eq(directoryAdBids.id, current.id));
      return { kind: "withdrawn" };
    }
    const auction = { ...scope, placement: input.placement, weekStart: input.weekStart };
    if ((await freeAuctionSpots(tx, auction)).length === 0) return { kind: "refused", reason: "spot-taken" };
    if (existing === undefined) {
      await tx.insert(directoryAdBids).values({
        businessId: input.businessId,
        listingKey: claim.listingKey,
        placeId: claim.placeId,
        ...scope,
        placement: input.placement,
        weekStart: input.weekStart,
        amountPaise: input.amountPaise,
        amountSetAt: input.now,
      });
    } else {
      const unchanged = current !== null && current.amountPaise === input.amountPaise;
      await tx
        .update(directoryAdBids)
        .set({ amountPaise: input.amountPaise, status: "active", ...(unchanged ? {} : { amountSetAt: input.now }) })
        .where(eq(directoryAdBids.id, existing.id));
    }
    return { kind: "saved" };
  });
}

export interface MarketWeekStats {
  readonly weekStart: string;
  readonly placement: DirectoryAdPlacement;
  /** How many businesses have an active bid. Never who, never how much. */
  readonly bidders: number;
}

/**
 * Every auction that `market`'s business can bid in: how many businesses are bidding for each of `weeks`, per
 * placement, in the business's own market (top, side, profile) and its city's home auction. Staff connection.
 */
export async function countMarketBidders(db: Database, market: DirectoryAdMarket, weeks: readonly string[]): Promise<MarketWeekStats[]> {
  if (weeks.length === 0) return [];
  const home = homeMarket(market.citySlug);
  const rows = await db
    .select({ weekStart: directoryAdBids.weekStart, placement: directoryAdBids.placement, bidders: count() })
    .from(directoryAdBids)
    .where(
      and(
        or(and(ne(directoryAdBids.placement, "home"), sameMarket(market)), and(eq(directoryAdBids.placement, "home"), sameMarket(home))),
        inArray(directoryAdBids.weekStart, [...weeks]),
        eq(directoryAdBids.status, "active"),
      ),
    )
    .groupBy(directoryAdBids.weekStart, directoryAdBids.placement);
  return rows;
}

/** The prices paid (or owed) for each placement in the market's latest settled week, highest first. Staff connection. */
export async function lastWinningPrices(
  db: Database,
  market: DirectoryAdMarket,
  now: Date,
): Promise<{ readonly weekStart: string } & Readonly<Record<DirectoryAdPlacement, number[]>>> {
  const weekStart = latestClosedWeekStart(now);
  const home = homeMarket(market.citySlug);
  const rows = await db
    .select({ placement: directoryAdWins.placement, pricePaise: directoryAdWins.pricePaise })
    .from(directoryAdWins)
    .where(
      and(
        or(
          and(
            ne(directoryAdWins.placement, "home"),
            eq(directoryAdWins.categorySlug, market.categorySlug),
            eq(directoryAdWins.citySlug, market.citySlug),
            eq(directoryAdWins.areaSlug, market.areaSlug),
          ),
          and(
            eq(directoryAdWins.placement, "home"),
            eq(directoryAdWins.categorySlug, home.categorySlug),
            eq(directoryAdWins.citySlug, home.citySlug),
            eq(directoryAdWins.areaSlug, home.areaSlug),
          ),
        ),
        eq(directoryAdWins.weekStart, weekStart),
        ne(directoryAdWins.status, "lapsed"),
      ),
    )
    .orderBy(desc(directoryAdWins.pricePaise));
  const prices = (placement: DirectoryAdPlacement): number[] => rows.filter((row) => row.placement === placement).map((row) => row.pricePaise);
  return { weekStart, top: prices("top"), side: prices("side"), profile: prices("profile"), home: prices("home") };
}

// ── Wins and settlement ─────────────────────────────────────────────────────────────────────────────────────────

export interface DirectoryAdWin {
  readonly id: string;
  readonly chargeId: string;
  readonly placement: DirectoryAdPlacement;
  readonly weekStart: string;
  readonly spot: number;
  readonly pricePaise: number;
  readonly status: DirectoryAdWinStatus;
  readonly payBy: Date;
  readonly paidAt: Date | null;
}

const WIN_COLUMNS = {
  id: directoryAdWins.id,
  chargeId: directoryAdWins.chargeId,
  placement: directoryAdWins.placement,
  weekStart: directoryAdWins.weekStart,
  spot: directoryAdWins.spot,
  pricePaise: directoryAdWins.pricePaise,
  status: directoryAdWins.status,
  payBy: directoryAdWins.payBy,
  paidAt: directoryAdWins.paidAt,
} as const;

/** The business's wins for weeks from `fromWeek` on, soonest first. Works through row-level security. */
export async function listWinsForBusiness(db: Runner, businessId: string, fromWeek: string): Promise<DirectoryAdWin[]> {
  return db
    .select(WIN_COLUMNS)
    .from(directoryAdWins)
    .where(and(eq(directoryAdWins.businessId, businessId), gte(directoryAdWins.weekStart, fromWeek)))
    .orderBy(asc(directoryAdWins.weekStart), asc(directoryAdWins.placement), asc(directoryAdWins.createdAt));
}

/** What a won spot's charge looks like: supplied by the caller, which owns tax and wording. */
export interface AdChargePricing {
  readonly taxRateBasisPoints: number;
  /** The amount charged for `netPaise`, tax included (chargedAmountCents in @fynix/billing). */
  readonly chargedPaise: (netPaise: number) => number;
  /** The charge's description on Billing and the receipt. */
  readonly describe: (win: { readonly placement: DirectoryAdPlacement; readonly spot: number; readonly weekStart: string } & DirectoryAdMarket) => string;
}

export interface SettlementSummary {
  /** Auctions (market, placement, week) settled. */
  readonly settled: number;
  readonly won: number;
  readonly lapsed: number;
  /** Spots passed to the next bidder after a lapse. */
  readonly passedOn: number;
}

interface AuctionBid {
  readonly id: string;
  readonly businessId: string;
  readonly listingKey: string;
  readonly placeId: string | null;
  readonly amountPaise: number;
  readonly amountSetAt: Date;
  readonly status: DirectoryAdBidStatus;
}

interface AuctionRef extends DirectoryAdMarket {
  readonly placement: DirectoryAdPlacement;
  readonly weekStart: string;
}

async function auctionBids(tx: ScopedTransaction, auction: AuctionRef): Promise<AuctionBid[]> {
  return tx
    .select({
      id: directoryAdBids.id,
      businessId: directoryAdBids.businessId,
      listingKey: directoryAdBids.listingKey,
      placeId: directoryAdBids.placeId,
      amountPaise: directoryAdBids.amountPaise,
      amountSetAt: directoryAdBids.amountSetAt,
      status: directoryAdBids.status,
    })
    .from(directoryAdBids)
    .where(and(sameMarket(auction), eq(directoryAdBids.placement, auction.placement), eq(directoryAdBids.weekStart, auction.weekStart)));
}

/** Businesses that may not win in this auction: without an approved claim to the bid's business (its place), or (for `side`) already holding the market's `top` spot that week. */
async function ineligibleBusinesses(tx: ScopedTransaction, auction: AuctionRef, bids: readonly AuctionBid[]): Promise<Set<string>> {
  const ids = [...new Set(bids.map((bid) => bid.businessId))];
  if (ids.length === 0) return new Set();
  const approved = await tx
    .select({ businessId: directoryClaims.businessId, listingKey: directoryClaims.listingKey, placeId: directoryClaims.placeId })
    .from(directoryClaims)
    .where(and(inArray(directoryClaims.businessId, ids), eq(directoryClaims.status, "approved")));
  const approvedClaim = new Map(approved.map((row) => [row.businessId, row]));
  const out = new Set(
    bids
      .filter((bid) => {
        const claim = approvedClaim.get(bid.businessId);
        return claim === undefined || !sameDirectoryBusiness(claim, bid);
      })
      .map((bid) => bid.businessId),
  );
  if (auction.placement === "side") {
    const topHolders = await tx
      .select({ businessId: directoryAdWins.businessId })
      .from(directoryAdWins)
      .where(
        and(
          eq(directoryAdWins.categorySlug, auction.categorySlug),
          eq(directoryAdWins.citySlug, auction.citySlug),
          eq(directoryAdWins.areaSlug, auction.areaSlug),
          eq(directoryAdWins.weekStart, auction.weekStart),
          eq(directoryAdWins.placement, "top"),
          ne(directoryAdWins.status, "lapsed"),
        ),
      );
    for (const holder of topHolders) out.add(holder.businessId);
  }
  return out;
}

/** The reserve at settlement: the placement's price now, or the lowest bid if staff have since closed it. */
async function settlementReserve(tx: ScopedTransaction, auction: AuctionRef, bids: readonly AuctionBid[]): Promise<number> {
  const reserve = await placementReserve(tx, auction, auction.placement);
  if (reserve !== null) return reserve;
  return Math.min(...bids.map((bid) => bid.amountPaise));
}

async function insertWin(
  tx: ScopedTransaction,
  auction: AuctionRef,
  bid: AuctionBid,
  spot: number,
  pricePaise: number,
  payBy: Date,
  pricing: AdChargePricing,
): Promise<void> {
  await lockBusinessForBilling(tx, bid.businessId);
  const inserted = await tx
    .insert(charges)
    .values({
      businessId: bid.businessId,
      kind: "directory_ad",
      description: pricing.describe({
        categorySlug: auction.categorySlug,
        citySlug: auction.citySlug,
        areaSlug: auction.areaSlug,
        placement: auction.placement,
        weekStart: auction.weekStart,
        spot,
      }),
      quantity: 1,
      unitAmountCents: pricePaise,
      taxRateBasisPoints: pricing.taxRateBasisPoints,
      amountCents: pricing.chargedPaise(pricePaise),
      currency: "INR",
      createdByStaffId: null,
    })
    .returning({ id: charges.id });
  const charge = inserted[0];
  if (charge === undefined) throw new Error("Inserting a directory ad charge returned no row");
  await tx.insert(directoryAdWins).values({
    bidId: bid.id,
    businessId: bid.businessId,
    listingKey: bid.listingKey,
    placeId: bid.placeId,
    categorySlug: auction.categorySlug,
    citySlug: auction.citySlug,
    areaSlug: auction.areaSlug,
    placement: auction.placement,
    weekStart: auction.weekStart,
    spot,
    pricePaise,
    chargeId: charge.id,
    payBy,
  });
  await tx.update(directoryAdBids).set({ status: "won" }).where(eq(directoryAdBids.id, bid.id));
}

/** The auction's spots no live staff-placed ad holds, best (lowest number) first. */
async function freeAuctionSpots(tx: ScopedTransaction, auction: AuctionRef): Promise<number[]> {
  const held = await tx
    .select({ spot: directoryStaffAds.spot })
    .from(directoryStaffAds)
    .where(
      and(
        staffAdsShowingIn(auction),
        eq(directoryStaffAds.placement, auction.placement),
        eq(directoryStaffAds.weekStart, auction.weekStart),
        isNull(directoryStaffAds.removedAt),
      ),
    );
  const taken = new Set(held.map((row) => row.spot));
  return Array.from({ length: DIRECTORY_AD_SPOTS[auction.placement] }, (_, index) => index + 1).filter((spot) => !taken.has(spot));
}

async function settleAuction(tx: ScopedTransaction, auction: AuctionRef, now: Date, pricing: AdChargePricing): Promise<number> {
  const bids = (await auctionBids(tx, auction)).filter((bid) => bid.status === "active");
  if (bids.length === 0) return 0;
  // Nobody looked until the week was over: there is nothing left to sell, so nobody wins or is asked to pay.
  if (weekEndsAt(auction.weekStart).getTime() <= now.getTime()) {
    await tx.update(directoryAdBids).set({ status: "lost" }).where(inArray(directoryAdBids.id, bids.map((bid) => bid.id)));
    return 0;
  }
  const excluded = await ineligibleBusinesses(tx, auction, bids);
  const eligible = rankBids(bids.filter((bid) => !excluded.has(bid.businessId)));
  const reserve = await settlementReserve(tx, auction, bids);
  // Spots staff have placed an ad on are not for sale: the winners take the spots left, best bid on the best spot.
  const free = await freeAuctionSpots(tx, auction);
  const winners = secondPriceWinners(eligible, free.length, reserve).map((winner) => {
    const spot = free[winner.spot - 1];
    if (spot === undefined) throw new Error(`No free spot for winner ${winner.bidId}`);
    return { ...winner, spot };
  });
  const winnerIds = new Set(winners.map((winner) => winner.bidId));
  const losers = bids.filter((bid) => !winnerIds.has(bid.id)).map((bid) => bid.id);
  if (losers.length > 0) await tx.update(directoryAdBids).set({ status: "lost" }).where(inArray(directoryAdBids.id, losers));
  // Settled late (nobody read the ads since the close)? Winners still get a full day to pay.
  const scheduled = firstPayBy(auction.weekStart);
  const payBy = scheduled.getTime() > now.getTime() ? scheduled : new Date(now.getTime() + PAY_WINDOW_MS);
  for (const winner of winners) {
    const bid = eligible.find((entry) => entry.id === winner.bidId);
    if (bid === undefined) throw new Error(`Winning bid ${winner.bidId} is not among the auction's bids`);
    await insertWin(tx, auction, bid, winner.spot, winner.pricePaise, payBy, pricing);
  }
  return winners.length;
}

/** Lapses one unpaid win and, time allowing, passes its spot to the best remaining bidder. Returns whether it passed. */
async function lapseWin(
  tx: ScopedTransaction,
  win: AuctionRef & { readonly id: string; readonly businessId: string; readonly chargeId: string; readonly spot: number; readonly payBy: Date },
  now: Date,
  pricing: AdChargePricing,
): Promise<"paid" | "lapsed" | "passed"> {
  await lockBusinessForBilling(tx, win.businessId);
  const chargeRows = await tx.select({ status: charges.status }).from(charges).where(eq(charges.id, win.chargeId)).limit(1).for("update");
  if (chargeRows[0]?.status === "paid") return "paid";
  if (chargeRows[0]?.status === "open") {
    await tx.update(charges).set({ status: "waived", waivedAt: now, waivedByStaffId: null }).where(eq(charges.id, win.chargeId));
  }
  await tx.update(directoryAdWins).set({ status: "lapsed", lapsedAt: now }).where(eq(directoryAdWins.id, win.id));

  const payBy = new Date(Math.max(win.payBy.getTime(), now.getTime()) + PAY_WINDOW_MS);
  if (payBy.getTime() >= weekEndsAt(win.weekStart).getTime()) return "lapsed";

  const bids = await auctionBids(tx, win);
  const alreadyWon = await tx
    .select({ bidId: directoryAdWins.bidId, businessId: directoryAdWins.businessId, status: directoryAdWins.status })
    .from(directoryAdWins)
    .where(
      and(
        eq(directoryAdWins.categorySlug, win.categorySlug),
        eq(directoryAdWins.citySlug, win.citySlug),
        eq(directoryAdWins.areaSlug, win.areaSlug),
        eq(directoryAdWins.placement, win.placement),
        eq(directoryAdWins.weekStart, win.weekStart),
      ),
    );
  const hadWin = new Set(alreadyWon.map((row) => row.bidId));
  const holding = new Set(alreadyWon.filter((row) => row.status !== "lapsed").map((row) => row.businessId));
  const lost = bids.filter((bid) => bid.status === "lost" && !hadWin.has(bid.id) && !holding.has(bid.businessId));
  const excluded = await ineligibleBusinesses(tx, win, lost);
  const candidates = rankBids(lost.filter((bid) => !excluded.has(bid.businessId)));
  const reserve = await settlementReserve(tx, win, bids);
  const next = secondPriceWinners(candidates, 1, reserve)[0];
  if (next === undefined) return "lapsed";
  const bid = candidates.find((entry) => entry.id === next.bidId);
  if (bid === undefined) throw new Error(`Passed-on bid ${next.bidId} is not among the candidates`);
  await insertWin(tx, win, bid, win.spot, next.pricePaise, payBy, pricing);
  return "passed";
}

/**
 * Settles every auction whose bidding has closed and still has open bids, then lapses unpaid wins past their pay-by
 * time and passes their spots on. Idempotent and safe to call on every read: it takes an exclusive advisory lock, and
 * with nothing due it is two indexed lookups. Staff connection only.
 */
export async function settleDirectoryAds(db: Database, now: Date, pricing: AdChargePricing): Promise<SettlementSummary> {
  const closedUpTo = latestClosedWeekStart(now);
  // A cheap unlocked look first, so the common case (nothing due) never queues on the lock.
  const [dueBids, dueWins] = await Promise.all([
    db.select({ id: directoryAdBids.id }).from(directoryAdBids).where(and(eq(directoryAdBids.status, "active"), lte(directoryAdBids.weekStart, closedUpTo))).limit(1),
    db.select({ id: directoryAdWins.id }).from(directoryAdWins).where(and(eq(directoryAdWins.status, "awaiting_payment"), lte(directoryAdWins.payBy, now))).limit(1),
  ]);
  if (dueBids.length === 0 && dueWins.length === 0) return { settled: 0, won: 0, lapsed: 0, passedOn: 0 };

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SETTLEMENT_LOCK_KEY})`);
    const auctions = await tx
      .selectDistinct({
        categorySlug: directoryAdBids.categorySlug,
        citySlug: directoryAdBids.citySlug,
        areaSlug: directoryAdBids.areaSlug,
        placement: directoryAdBids.placement,
        weekStart: directoryAdBids.weekStart,
      })
      .from(directoryAdBids)
      .where(and(eq(directoryAdBids.status, "active"), lte(directoryAdBids.weekStart, closedUpTo)));
    // `top` before `side` in each market and week, so a top winner is known before the side spots are filled.
    const ordered = [...auctions].sort(
      (a, b) =>
        a.weekStart.localeCompare(b.weekStart) ||
        a.categorySlug.localeCompare(b.categorySlug) ||
        a.citySlug.localeCompare(b.citySlug) ||
        a.areaSlug.localeCompare(b.areaSlug) ||
        (a.placement === b.placement ? 0 : a.placement === "top" ? -1 : 1),
    );
    let won = 0;
    for (const auction of ordered) won += await settleAuction(tx, auction, now, pricing);

    let lapsed = 0;
    let passedOn = 0;
    // A spot passed on gets a fresh pay-by in the future, so this loop ends; `seen` guards against a win whose charge
    // is paid while the win still reads unpaid, which the payment's own transaction rules out.
    const seen = new Set<string>();
    for (;;) {
      const due = await tx
        .select({
          id: directoryAdWins.id,
          businessId: directoryAdWins.businessId,
          chargeId: directoryAdWins.chargeId,
          categorySlug: directoryAdWins.categorySlug,
          citySlug: directoryAdWins.citySlug,
          areaSlug: directoryAdWins.areaSlug,
          placement: directoryAdWins.placement,
          weekStart: directoryAdWins.weekStart,
          spot: directoryAdWins.spot,
          payBy: directoryAdWins.payBy,
        })
        .from(directoryAdWins)
        .where(and(eq(directoryAdWins.status, "awaiting_payment"), lte(directoryAdWins.payBy, now)))
        .orderBy(asc(directoryAdWins.payBy), asc(directoryAdWins.id))
        .limit(1);
      const win = due[0];
      if (win === undefined) break;
      if (seen.has(win.id)) throw new Error(`Directory ad win ${win.id} is unpaid but its charge is paid`);
      seen.add(win.id);
      const outcome = await lapseWin(tx, win, now, pricing);
      // Paid in the moment before its business's lock was taken: the payment marked the win paid, so it is no longer due.
      if (outcome === "paid") continue;
      lapsed += 1;
      if (outcome === "passed") passedOn += 1;
    }
    return { settled: ordered.length, won, lapsed, passedOn };
  });
}

/**
 * Marks the win a `directory_ad` charge asked for as paid. Called by recordChargePayment in the transaction that marks
 * the charge paid, so the two never disagree.
 */
export async function markDirectoryAdWinPaid(tx: ScopedTransaction, chargeId: string, paidAt: Date): Promise<void> {
  const rows = await tx
    .update(directoryAdWins)
    .set({ status: "paid", paidAt })
    .where(and(eq(directoryAdWins.chargeId, chargeId), eq(directoryAdWins.status, "awaiting_payment")))
    .returning({ id: directoryAdWins.id });
  if (rows.length === 0) throw new Error(`No unpaid directory ad win for charge ${chargeId}`);
}

// ── What the website shows ──────────────────────────────────────────────────────────────────────────────────────

/** The last segment of a link ad's key: a slug no business has (businesses are named by a code). */
export const LINK_AD_KEY_SLUG = "link-ad";

/** The key a link ad answers with: its market and LINK_AD_KEY_SLUG, in the shape of a listing key. */
export function linkAdKey(market: DirectoryAdMarket): string {
  return `${market.categorySlug}/${market.citySlug}/${market.areaSlug}/${LINK_AD_KEY_SLUG}`;
}

/** The two shapes an ad picture is cut to: tall (8 : 9) for the first side spot and home tile, wide (8 : 5) for every other spot. */
export type AdPictureShape = "tall" | "wide";

/**
 * The shape of the picture a spot shows: the tall one for spot 1 of the side column and of the home page's grid, the
 * wide one everywhere else (the second side spot, the home page's smaller tiles, the business page's card).
 */
export function adPictureShape(placement: DirectoryAdPlacement, spot: number): AdPictureShape {
  return spot === 1 && (placement === "side" || placement === "home") ? "tall" : "wide";
}

export interface LiveDirectoryAd {
  /** Which spot of its placement the ad holds, from 1: the website puts the ad in that tile, so a spot nobody holds stays free. */
  readonly spot: number;
  /**
   * The advertiser's listing key: where the ad leads, for a website that names businesses by key. A link ad has no
   * business, so its key (linkAdKey) only names its market, shaped like a listing key so that a website which does not
   * know link ads finds no business behind it and drops the ad instead of refusing the whole answer.
   */
  readonly key: string;
  /** Where a link ad leads (any web address staff chose); null for an ad that leads to its business's page. */
  readonly linkUrl: string | null;
  /** The picture staff uploaded for this ad, in the shape of its spot; null for an ad with none (the business's own or the stock photo shows). */
  readonly picture: { readonly id: string; readonly shape: AdPictureShape } | null;
  /** The advertiser's permanent id; null for an address the place registry does not know. */
  readonly placeId: string | null;
  readonly name: string;
  /** Null until staff approve it. */
  readonly tagline: string | null;
}

export interface LiveDirectoryAds {
  readonly top: LiveDirectoryAd | null;
  readonly side: LiveDirectoryAd[];
  /** The business page's one spot, in a category and area market. Null when free. */
  readonly profile: LiveDirectoryAd | null;
  /** The home page's tiles, in spot order, in a city's `all` market (homeMarket). Empty when none is booked. */
  readonly home: LiveDirectoryAd[];
}

/** One ad on one spot this week, with who holds it and where it came from: what the advertiser's spot board needs. */
export interface LiveSpotRow {
  readonly placement: DirectoryAdPlacement;
  readonly spot: number;
  readonly weekStart: string;
  readonly ad: LiveDirectoryAd;
  /** The advertiser's account for an auction win; null for a staff-placed ad, which has none. */
  readonly businessId: string | null;
  readonly source: "auction" | "staff";
}

/**
 * This week's ads in an auction's market, spot by spot: staff-placed ads, and auction wins that are paid and whose
 * business's claim is still approved. A spot holds at most one of the two (0067). `market` is the auction's own: a
 * category and area for the top, side and profile placements, `homeMarket(city)` for the home page; only that
 * market's placements come back. Staff connection.
 */
export async function readLiveSpotRows(db: Database, market: DirectoryAdMarket, now: Date): Promise<LiveSpotRow[]> {
  const weekStart = weekStartOf(now);
  const [won, placed] = await Promise.all([
    db
      .select({
        placement: directoryAdWins.placement,
        spot: directoryAdWins.spot,
        businessId: directoryAdWins.businessId,
        key: directoryAdWins.listingKey,
        placeId: directoryAdWins.placeId,
        name: directoryClaims.businessName,
        tagline: directoryClaims.tagline,
        taglineApproved: directoryClaims.taglineApproved,
      })
      .from(directoryAdWins)
      .innerJoin(
        directoryClaims,
        and(
          eq(directoryClaims.businessId, directoryAdWins.businessId),
          // Still the business the win was for: the same place, or the same key when neither has one
          // (sameDirectoryBusiness, in SQL).
          sql`(${directoryClaims.placeId} = ${directoryAdWins.placeId} or (${directoryClaims.placeId} is null and ${directoryAdWins.placeId} is null and ${directoryClaims.listingKey} = ${directoryAdWins.listingKey}))`,
          eq(directoryClaims.status, "approved"),
        ),
      )
      .where(
        and(
          eq(directoryAdWins.categorySlug, market.categorySlug),
          eq(directoryAdWins.citySlug, market.citySlug),
          eq(directoryAdWins.areaSlug, market.areaSlug),
          eq(directoryAdWins.weekStart, weekStart),
          eq(directoryAdWins.status, "paid"),
          lte(directoryAdWins.paidAt, now),
          businessNotClosing(directoryAdWins.businessId),
        ),
      ),
    db
      .select({
        placement: directoryStaffAds.placement,
        spot: directoryStaffAds.spot,
        key: directoryStaffAds.listingKey,
        linkUrl: directoryStaffAds.linkUrl,
        pictureId: directoryStaffAds.pictureId,
        placeId: directoryStaffAds.placeId,
        name: directoryStaffAds.businessName,
        tagline: directoryStaffAds.tagline,
      })
      .from(directoryStaffAds)
      .where(
        and(staffAdsShowingIn(market), eq(directoryStaffAds.weekStart, weekStart), isNull(directoryStaffAds.removedAt)),
      ),
  ]);
  const rows: LiveSpotRow[] = [
    ...won.map((row) => ({
      placement: row.placement,
      spot: row.spot,
      weekStart,
      businessId: row.businessId,
      source: "auction" as const,
      ad: { spot: row.spot, key: row.key, linkUrl: null, picture: null, placeId: row.placeId, name: row.name, tagline: row.taglineApproved ? row.tagline : null },
    })),
    ...placed.map((row) => ({
      placement: row.placement,
      spot: row.spot,
      weekStart,
      businessId: null,
      source: "staff" as const,
      ad: {
        spot: row.spot,
        key: row.key ?? linkAdKey(market),
        linkUrl: row.linkUrl,
        picture: row.pictureId === null ? null : { id: row.pictureId, shape: adPictureShape(row.placement, row.spot) },
        placeId: row.placeId,
        name: row.name,
        tagline: row.tagline,
      },
    })),
  ];
  return rows.sort((a, b) => a.spot - b.spot);
}

/** This week's ads in a market, for the website (readLiveSpotRows, without who holds what). Staff connection. */
export async function readLiveDirectoryAds(db: Database, market: DirectoryAdMarket, now: Date): Promise<LiveDirectoryAds> {
  const rows = await readLiveSpotRows(db, market, now);
  const adsIn = (placement: DirectoryAdPlacement): LiveDirectoryAd[] => rows.filter((row) => row.placement === placement).map((row) => row.ad);
  return { top: adsIn("top")[0] ?? null, side: adsIn("side"), profile: adsIn("profile")[0] ?? null, home: adsIn("home") };
}

// ── Staff: auctions ─────────────────────────────────────────────────────────────────────────────────────────────

export interface StaffAuctionBid {
  readonly id: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly listingKey: string;
  readonly categorySlug: string;
  readonly citySlug: string;
  readonly areaSlug: string;
  readonly placement: DirectoryAdPlacement;
  readonly weekStart: string;
  readonly amountPaise: number;
  readonly status: DirectoryAdBidStatus;
  readonly amountSetAt: Date;
  /** The live (or latest) win this bid produced. */
  readonly win: { readonly spot: number; readonly pricePaise: number; readonly status: DirectoryAdWinStatus; readonly payBy: Date } | null;
}

/** Every bid for the given weeks with its business and any win, for the staff console. Withdrawn bids are left out. */
export async function listAuctionBidsForStaff(db: Database, weeks: readonly string[]): Promise<StaffAuctionBid[]> {
  if (weeks.length === 0) return [];
  const rows = await db
    .select({
      id: directoryAdBids.id,
      businessId: directoryAdBids.businessId,
      businessName: businesses.name,
      listingKey: directoryAdBids.listingKey,
      categorySlug: directoryAdBids.categorySlug,
      citySlug: directoryAdBids.citySlug,
      areaSlug: directoryAdBids.areaSlug,
      placement: directoryAdBids.placement,
      weekStart: directoryAdBids.weekStart,
      amountPaise: directoryAdBids.amountPaise,
      status: directoryAdBids.status,
      amountSetAt: directoryAdBids.amountSetAt,
      winSpot: directoryAdWins.spot,
      winPrice: directoryAdWins.pricePaise,
      winStatus: directoryAdWins.status,
      winPayBy: directoryAdWins.payBy,
    })
    .from(directoryAdBids)
    .innerJoin(businesses, eq(businesses.id, directoryAdBids.businessId))
    .leftJoin(directoryAdWins, eq(directoryAdWins.bidId, directoryAdBids.id))
    .where(and(inArray(directoryAdBids.weekStart, [...weeks]), ne(directoryAdBids.status, "withdrawn")))
    .orderBy(
      asc(directoryAdBids.weekStart),
      asc(directoryAdBids.categorySlug),
      asc(directoryAdBids.citySlug),
      asc(directoryAdBids.areaSlug),
      asc(directoryAdBids.placement),
      desc(directoryAdBids.amountPaise),
      asc(directoryAdBids.amountSetAt),
    );
  return rows.map(({ winSpot, winPrice, winStatus, winPayBy, ...bid }) => ({
    ...bid,
    win:
      winSpot === null || winPrice === null || winStatus === null || winPayBy === null
        ? null
        : { spot: winSpot, pricePaise: winPrice, status: winStatus, payBy: winPayBy },
  }));
}

/** The weeks the staff console shows: the running one, then the next two. */
export function staffAuctionWeeks(now: Date): string[] {
  const current = weekStartOf(now);
  return [current, addWeeks(current, 1), addWeeks(current, 2)];
}

// ── Results for the advertiser ──────────────────────────────────────────────────────────────────────────────────

/**
 * How many visitors did each thing on the business from `fromDay` (an Asia/Kolkata `YYYY-MM-DD`) on: by place,
 * whichever address or id they came by. Staff connection.
 */
export async function sumListingInterest(
  db: Database,
  business: DirectoryRef,
  fromDay: string,
): Promise<Readonly<Record<DirectoryEventKind, number>>> {
  const rows = await db
    .select({ kind: directoryDailyCounts.kind, total: sql<number>`sum(${directoryDailyCounts.count})`.mapWith(Number) })
    .from(directoryDailyCounts)
    .where(
      and(
        matchesDirectoryRef({ placeId: directoryDailyCounts.placeId, listingKey: directoryDailyCounts.listingKey }, business),
        gte(directoryDailyCounts.day, fromDay),
      ),
    )
    .groupBy(directoryDailyCounts.kind);
  const totals: Record<DirectoryEventKind, number> = { view: 0, call: 0, whatsapp: 0, enquire: 0, directions: 0, website: 0, share: 0 };
  for (const row of rows) totals[row.kind] = row.total;
  return totals;
}

// ── Counting who saw and clicked an ad ──────────────────────────────────────────────────────────────────────────

/** Adds one to a day's count of an ad's `kind` (`placeId` is the advertiser's place). Staff connection. */
export async function incrementDirectoryAdDailyCount(
  db: Database,
  input: { readonly placeId: string; readonly placement: DirectoryAdPlacement; readonly day: string; readonly kind: DirectoryAdEventKind },
): Promise<void> {
  await db
    .insert(directoryAdDailyCounts)
    .values({ placeId: input.placeId, placement: input.placement, day: input.day, kind: input.kind, count: 1 })
    .onConflictDoUpdate({
      target: [directoryAdDailyCounts.placeId, directoryAdDailyCounts.placement, directoryAdDailyCounts.day, directoryAdDailyCounts.kind],
      set: { count: sql`${directoryAdDailyCounts.count} + 1` },
    });
}

/** Deletes counts older than `beforeDay` (an Asia/Kolkata `YYYY-MM-DD`). The reports look back well under that. */
export async function purgeOldDirectoryAdDailyCounts(db: Database, beforeDay: string): Promise<void> {
  await db.delete(directoryAdDailyCounts).where(lte(directoryAdDailyCounts.day, beforeDay));
}

/**
 * Whether the place's ad is on a spot of `placement` right now (this week, paid or staff-placed). Only an ad that is
 * running can be counted, so events for a business that has none, or a placement it does not hold, are refused.
 */
export async function holdsLivePlacement(db: Database, placeId: string, placement: DirectoryAdPlacement, now: Date): Promise<boolean> {
  const weekStart = weekStartOf(now);
  const [won, placed] = await Promise.all([
    db
      .select({ id: directoryAdWins.id })
      .from(directoryAdWins)
      .where(
        and(
          eq(directoryAdWins.placeId, placeId),
          eq(directoryAdWins.placement, placement),
          eq(directoryAdWins.weekStart, weekStart),
          eq(directoryAdWins.status, "paid"),
        ),
      )
      .limit(1),
    db
      .select({ id: directoryStaffAds.id })
      .from(directoryStaffAds)
      .where(
        and(
          eq(directoryStaffAds.placeId, placeId),
          eq(directoryStaffAds.placement, placement),
          eq(directoryStaffAds.weekStart, weekStart),
          isNull(directoryStaffAds.removedAt),
        ),
      )
      .limit(1),
  ]);
  return won.length > 0 || placed.length > 0;
}

export interface PlaceBooking {
  readonly placement: DirectoryAdPlacement;
  readonly weekStart: string;
  readonly source: "auction" | "staff";
}

/**
 * The weeks from `fromWeek` on in which the place's ad had a spot: auction wins that were paid, and staff-placed ads
 * still up. One entry per placement and week, which is what an advertiser's per-ad results are for. Staff connection.
 */
export async function listPlaceBookings(db: Database, placeId: string, fromWeek: string): Promise<PlaceBooking[]> {
  const [won, placed] = await Promise.all([
    db
      .select({ placement: directoryAdWins.placement, weekStart: directoryAdWins.weekStart })
      .from(directoryAdWins)
      .where(and(eq(directoryAdWins.placeId, placeId), eq(directoryAdWins.status, "paid"), gte(directoryAdWins.weekStart, fromWeek))),
    db
      .select({ placement: directoryStaffAds.placement, weekStart: directoryStaffAds.weekStart })
      .from(directoryStaffAds)
      .where(and(eq(directoryStaffAds.placeId, placeId), isNull(directoryStaffAds.removedAt), gte(directoryStaffAds.weekStart, fromWeek))),
  ]);
  const bookings = new Map<string, PlaceBooking>();
  for (const row of placed) bookings.set(`${row.placement}:${row.weekStart}`, { ...row, source: "staff" });
  // A paid win and a staff ad never hold the same spot, but the same placement can have both for one business (two tiles).
  for (const row of won) bookings.set(`${row.placement}:${row.weekStart}`, { ...row, source: "auction" });
  return [...bookings.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.placement.localeCompare(b.placement));
}

export interface AdDayCount {
  readonly placement: DirectoryAdPlacement;
  readonly day: string;
  readonly kind: DirectoryAdEventKind;
  readonly count: number;
}

/** What visitors did with the place's ads from `fromDay` (an Asia/Kolkata `YYYY-MM-DD`) on, day by day. Staff connection. */
export async function readAdDailyCounts(db: Database, placeId: string, fromDay: string): Promise<AdDayCount[]> {
  return db
    .select({
      placement: directoryAdDailyCounts.placement,
      day: directoryAdDailyCounts.day,
      kind: directoryAdDailyCounts.kind,
      count: directoryAdDailyCounts.count,
    })
    .from(directoryAdDailyCounts)
    .where(and(eq(directoryAdDailyCounts.placeId, placeId), gte(directoryAdDailyCounts.day, fromDay)))
    .orderBy(asc(directoryAdDailyCounts.day));
}

// ── Staff-placed ads ────────────────────────────────────────────────────────────────────────────────────────────

/** The most weeks one staff placement may cover. */
export const MAX_STAFF_AD_WEEKS = 12;

export interface StaffAd {
  readonly id: string;
  /** The business the ad leads to; null for a link ad. */
  readonly listingKey: string | null;
  /** Where a link ad leads; null for an ad that leads to a business's page. */
  readonly linkUrl: string | null;
  /** The picture staff uploaded for it; null for none. */
  readonly pictureId: string | null;
  /** The business's name, or a link ad's headline. */
  readonly businessName: string;
  readonly tagline: string | null;
  readonly categorySlug: string;
  readonly citySlug: string;
  readonly areaSlug: string;
  readonly placement: DirectoryAdPlacement;
  readonly spot: number;
  readonly weekStart: string;
  readonly agreedPaise: number | null;
  readonly note: string | null;
  readonly createdAt: Date;
}

const STAFF_AD_COLUMNS = {
  id: directoryStaffAds.id,
  listingKey: directoryStaffAds.listingKey,
  linkUrl: directoryStaffAds.linkUrl,
  pictureId: directoryStaffAds.pictureId,
  businessName: directoryStaffAds.businessName,
  tagline: directoryStaffAds.tagline,
  categorySlug: directoryStaffAds.categorySlug,
  citySlug: directoryStaffAds.citySlug,
  areaSlug: directoryStaffAds.areaSlug,
  placement: directoryStaffAds.placement,
  spot: directoryStaffAds.spot,
  weekStart: directoryStaffAds.weekStart,
  agreedPaise: directoryStaffAds.agreedPaise,
  note: directoryStaffAds.note,
  createdAt: directoryStaffAds.createdAt,
} as const;

/** A picture staff uploaded for an ad, already stored under `storageKey` (shared by every week of the booking). */
export interface NewStaffAdPicture {
  /** Generated before the file was stored, because the storage key is built from it. */
  readonly id: string;
  /** `staff-ads/{id}/display`. */
  readonly storageKey: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

export interface NewStaffAds {
  /** The picture to show with the ad, or none. It is recorded only when the ad is placed. */
  readonly picture?: NewStaffAdPicture | null | undefined;
  /** The business the ad is for: any directory listing, with or without an account. Null for a link ad. */
  readonly listingKey: string | null;
  /** Where a link ad leads: an http or https address. Null for an ad for a business's page; exactly one of the two is set. */
  readonly linkUrl?: string | null | undefined;
  /** The business's name, or a link ad's headline, as the ad shows it. */
  readonly businessName: string;
  readonly tagline: string | null;
  /** Where the ad shows: any category in any area, not only the business's own. */
  readonly market: DirectoryAdMarket;
  readonly placement: DirectoryAdPlacement;
  readonly spot: number;
  /** The first week (a Monday, this week or later) and how many weeks in a row, 1 to MAX_STAFF_AD_WEEKS. */
  readonly fromWeek: string;
  readonly weeks: number;
  readonly agreedPaise: number | null;
  readonly note: string | null;
  readonly staffId: string;
  readonly now: Date;
}

export type PlaceStaffAdsOutcome =
  | { readonly kind: "placed"; readonly weeks: number }
  /** The first week is already over. */
  | { readonly kind: "week-past" }
  /** The spot is held that week: by another staff-placed ad, or by an auction win (paid or still to be paid). */
  | { readonly kind: "spot-taken"; readonly weekStart: string; readonly by: "staff" | "auction" };

/**
 * Places an ad by hand on one spot for one or more weeks in a row, all or nothing: if the spot is held in any of the
 * weeks nothing is written and the outcome names the first such week. Takes the settlement lock, so it cannot
 * interleave with an auction settling for the same spot. The ad shows from the moment its week is the running one, and
 * names the place its listing key is a legacy key of, when there is one.
 */
export async function placeStaffAds(db: Database, input: NewStaffAds): Promise<PlaceStaffAdsOutcome> {
  const linkUrl = input.linkUrl ?? null;
  if ((input.listingKey === null) === (linkUrl === null)) {
    throw new RangeError("A staff ad leads to a business's page or to a link: give exactly one of listingKey and linkUrl");
  }
  if (input.listingKey !== null) marketOfListing(input.listingKey);
  // A home spot is the city's, whatever category and area the caller named.
  const market = auctionScope(input.placement, input.market);
  if (market.citySlug === ALL_SLUG) throw new RangeError("A staff ad shows in one city: only its category and area may be all");
  if (input.spot < 1 || input.spot > DIRECTORY_AD_SPOTS[input.placement]) {
    throw new RangeError(`The ${input.placement} placement has spots 1 to ${DIRECTORY_AD_SPOTS[input.placement]}, received ${input.spot}`);
  }
  if (!Number.isInteger(input.weeks) || input.weeks < 1 || input.weeks > MAX_STAFF_AD_WEEKS) {
    throw new RangeError(`A staff ad runs 1 to ${MAX_STAFF_AD_WEEKS} weeks, received ${input.weeks}`);
  }
  // Throws for anything that is not a Monday.
  weekStartsAt(input.fromWeek);
  if (input.fromWeek < weekStartOf(input.now)) return { kind: "week-past" };
  const weekStarts = Array.from({ length: input.weeks }, (_, index) => addWeeks(input.fromWeek, index));

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SETTLEMENT_LOCK_KEY})`);
    const [staffHeld, wonHeld] = await Promise.all([
      tx
        .select({ weekStart: directoryStaffAds.weekStart })
        .from(directoryStaffAds)
        .where(
          and(
            staffAdsOverlapping(market),
            eq(directoryStaffAds.placement, input.placement),
            eq(directoryStaffAds.spot, input.spot),
            inArray(directoryStaffAds.weekStart, weekStarts),
            isNull(directoryStaffAds.removedAt),
          ),
        ),
      tx
        .select({ weekStart: directoryAdWins.weekStart })
        .from(directoryAdWins)
        .where(
          and(
            eq(directoryAdWins.citySlug, market.citySlug),
            market.categorySlug === ALL_SLUG ? sql`true` : eq(directoryAdWins.categorySlug, market.categorySlug),
            market.areaSlug === ALL_SLUG ? sql`true` : eq(directoryAdWins.areaSlug, market.areaSlug),
            eq(directoryAdWins.placement, input.placement),
            eq(directoryAdWins.spot, input.spot),
            inArray(directoryAdWins.weekStart, weekStarts),
            ne(directoryAdWins.status, "lapsed"),
          ),
        ),
    ]);
    for (const weekStart of weekStarts) {
      if (staffHeld.some((row) => row.weekStart === weekStart)) return { kind: "spot-taken", weekStart, by: "staff" };
      if (wonHeld.some((row) => row.weekStart === weekStart)) return { kind: "spot-taken", weekStart, by: "auction" };
    }
    const placeId = input.listingKey === null ? null : (await resolveListingKey(tx, input.listingKey)).placeId;
    const picture = input.picture ?? null;
    if (picture !== null) await tx.insert(directoryStaffAdPictures).values({ ...picture, uploadedByUserId: input.staffId });
    await tx.insert(directoryStaffAds).values(
      weekStarts.map((weekStart) => ({
        listingKey: input.listingKey,
        linkUrl,
        pictureId: picture?.id ?? null,
        placeId,
        businessName: input.businessName,
        tagline: input.tagline,
        categorySlug: market.categorySlug,
        citySlug: market.citySlug,
        areaSlug: market.areaSlug,
        placement: input.placement,
        spot: input.spot,
        weekStart,
        agreedPaise: input.agreedPaise,
        note: input.note,
        placedByUserId: input.staffId,
      })),
    );
    return { kind: "placed", weeks: weekStarts.length };
  });
}

/** Takes a staff-placed ad down, freeing its spot. False when it was already down or never existed. */
export async function removeStaffAd(
  db: Database,
  input: { readonly id: string; readonly staffId: string; readonly now: Date },
): Promise<boolean> {
  const rows = await db
    .update(directoryStaffAds)
    .set({ removedAt: input.now, removedByUserId: input.staffId })
    .where(and(eq(directoryStaffAds.id, input.id), isNull(directoryStaffAds.removedAt)))
    .returning({ id: directoryStaffAds.id });
  return rows.length > 0;
}

/** What taking a booking down did. */
export interface RemovedStaffAds {
  /** How many weekly ads were taken down; ones already down or unknown are skipped. */
  readonly removed: number;
  /** The files of pictures no live ad uses any more: the caller deletes them once this has committed. */
  readonly droppedStorageKeys: readonly string[];
}

/**
 * Takes down every one of these staff-placed ads (the weeks of one booking) at once, freeing their spots straight away.
 * A picture that none of the ads still up uses is marked removed and its file's key returned.
 */
export async function removeStaffAds(
  db: Database,
  input: { readonly ids: readonly string[]; readonly staffId: string; readonly now: Date },
): Promise<RemovedStaffAds> {
  if (input.ids.length === 0) return { removed: 0, droppedStorageKeys: [] };
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(directoryStaffAds)
      .set({ removedAt: input.now, removedByUserId: input.staffId })
      .where(and(inArray(directoryStaffAds.id, [...input.ids]), isNull(directoryStaffAds.removedAt)))
      .returning({ id: directoryStaffAds.id, pictureId: directoryStaffAds.pictureId });
    const droppedStorageKeys = await dropUnusedStaffAdPictures(tx, rows.flatMap((row) => (row.pictureId === null ? [] : [row.pictureId])), input.now);
    return { removed: rows.length, droppedStorageKeys };
  });
}

/**
 * Marks as removed those of `pictureIds` that no staff ad still up uses, and returns their files' keys: the caller
 * deletes the files once the transaction has committed.
 */
async function dropUnusedStaffAdPictures(tx: Runner, pictureIds: readonly string[], now: Date): Promise<string[]> {
  const candidates = [...new Set(pictureIds)];
  if (candidates.length === 0) return [];
  const stillUsed = await tx
    .select({ pictureId: directoryStaffAds.pictureId })
    .from(directoryStaffAds)
    .where(and(inArray(directoryStaffAds.pictureId, candidates), isNull(directoryStaffAds.removedAt)));
  const used = new Set(stillUsed.map((row) => row.pictureId));
  const unused = candidates.filter((id) => !used.has(id));
  if (unused.length === 0) return [];
  const dropped = await tx
    .update(directoryStaffAdPictures)
    .set({ removedAt: now })
    .where(and(inArray(directoryStaffAdPictures.id, unused), isNull(directoryStaffAdPictures.removedAt)))
    .returning({ storageKey: directoryStaffAdPictures.storageKey });
  return dropped.map((row) => row.storageKey);
}

/** The live ads among `ids` (the weeks of one booking), soonest first. Staff connection. */
export async function findStaffAdsByIds(db: Database, ids: readonly string[]): Promise<StaffAd[]> {
  if (ids.length === 0) return [];
  return db
    .select(STAFF_AD_COLUMNS)
    .from(directoryStaffAds)
    .where(and(inArray(directoryStaffAds.id, [...ids]), isNull(directoryStaffAds.removedAt)))
    .orderBy(asc(directoryStaffAds.weekStart));
}

/** What staff may change on a booking they placed: what the ad says and leads to, its picture, and their own notes. Where and when it shows is not here: that is a new booking. */
export interface StaffAdEdit {
  /** Every week of the booking still up; ones already taken down are skipped. */
  readonly ids: readonly string[];
  readonly businessName: string;
  readonly tagline: string | null;
  /** Where a link ad leads (required for one); null for an ad for a business, whose page cannot change. */
  readonly linkUrl: string | null;
  readonly agreedPaise: number | null;
  readonly note: string | null;
  readonly picture: StaffAdPictureChange;
  readonly now: Date;
}

export type StaffAdPictureChange =
  | { readonly kind: "keep" }
  | { readonly kind: "remove" }
  /** A new picture, already stored; it is recorded only when the edit is. */
  | { readonly kind: "replace"; readonly picture: NewStaffAdPicture; readonly staffId: string };

export type UpdateStaffAdsOutcome =
  | { readonly kind: "updated"; readonly updated: number; readonly droppedStorageKeys: readonly string[] }
  /** None of the ads is up any more. */
  | { readonly kind: "not-found" }
  /** The ads are not weeks of one booking: nothing was changed. */
  | { readonly kind: "mixed" };

/**
 * Changes what a booking says, leads to and shows, in every week of it that is still up at once, so its weeks stay one
 * booking in the list. A picture it no longer uses is marked removed and its file's key returned for the caller to
 * delete once this has committed. Staff connection.
 */
export async function updateStaffAds(db: Database, input: StaffAdEdit): Promise<UpdateStaffAdsOutcome> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ ...STAFF_AD_COLUMNS, placeId: directoryStaffAds.placeId })
      .from(directoryStaffAds)
      .where(and(inArray(directoryStaffAds.id, [...input.ids]), isNull(directoryStaffAds.removedAt)))
      .for("update");
    const [first] = rows;
    if (first === undefined) return { kind: "not-found" };
    const sameBooking = rows.every(
      (row) =>
        row.listingKey === first.listingKey &&
        (row.linkUrl === null) === (first.linkUrl === null) &&
        row.placement === first.placement &&
        row.spot === first.spot &&
        row.categorySlug === first.categorySlug &&
        row.citySlug === first.citySlug &&
        row.areaSlug === first.areaSlug,
    );
    if (!sameBooking) return { kind: "mixed" };
    if ((first.linkUrl === null) !== (input.linkUrl === null)) {
      throw new RangeError("A link ad needs the address it leads to, and an ad for a business's page has none");
    }
    if (input.picture.kind === "replace") {
      await tx.insert(directoryStaffAdPictures).values({ ...input.picture.picture, uploadedByUserId: input.picture.staffId });
    }
    const pictureId = input.picture.kind === "keep" ? undefined : input.picture.kind === "remove" ? null : input.picture.picture.id;
    await tx
      .update(directoryStaffAds)
      .set({
        businessName: input.businessName,
        tagline: input.tagline,
        ...(input.linkUrl === null ? {} : { linkUrl: input.linkUrl }),
        agreedPaise: input.agreedPaise,
        note: input.note,
        ...(pictureId === undefined ? {} : { pictureId }),
        updatedAt: input.now,
      })
      .where(inArray(directoryStaffAds.id, rows.map((row) => row.id)));
    const replaced = pictureId === undefined ? [] : rows.flatMap((row) => (row.pictureId === null ? [] : [row.pictureId]));
    return { kind: "updated", updated: rows.length, droppedStorageKeys: await dropUnusedStaffAdPictures(tx, replaced, input.now) };
  });
}

/** What serving a staff ad's picture needs from its row. */
export interface StaffAdPictureFile {
  readonly storageKey: string;
  readonly mimeType: string;
  /** Hex SHA-256 of the stored file. */
  readonly sha256: string;
}

const STAFF_AD_PICTURE_FILE = {
  storageKey: directoryStaffAdPictures.storageKey,
  mimeType: directoryStaffAdPictures.mimeType,
  sha256: directoryStaffAdPictures.sha256,
} as const;

/**
 * A staff ad's picture the website may show: not removed, and used by a staff ad that is still up. Staff connection:
 * the website's shared secret has already been checked.
 */
export async function findLiveStaffAdPictureFile(db: Database, pictureId: string): Promise<StaffAdPictureFile | null> {
  if (!isUuid(pictureId)) return null;
  const rows = await db
    .select(STAFF_AD_PICTURE_FILE)
    .from(directoryStaffAdPictures)
    .where(
      and(
        eq(directoryStaffAdPictures.id, pictureId),
        isNull(directoryStaffAdPictures.removedAt),
        sql`exists (select 1 from ${directoryStaffAds} where ${directoryStaffAds.pictureId} = ${directoryStaffAdPictures.id} and ${directoryStaffAds.removedAt} is null)`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** A staff ad's picture for staff to look at, whether or not its ad is up yet. Only call after checking staff access. */
export async function findStaffAdPictureFileForStaff(db: Database, pictureId: string): Promise<StaffAdPictureFile | null> {
  if (!isUuid(pictureId)) return null;
  const rows = await db
    .select(STAFF_AD_PICTURE_FILE)
    .from(directoryStaffAdPictures)
    .where(and(eq(directoryStaffAdPictures.id, pictureId), isNull(directoryStaffAdPictures.removedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** Every live staff-placed ad for `fromWeek` and later, soonest first, for the staff console. */
export async function listStaffAds(db: Database, fromWeek: string): Promise<StaffAd[]> {
  return db
    .select(STAFF_AD_COLUMNS)
    .from(directoryStaffAds)
    .where(and(gte(directoryStaffAds.weekStart, fromWeek), isNull(directoryStaffAds.removedAt)))
    .orderBy(
      asc(directoryStaffAds.weekStart),
      asc(directoryStaffAds.categorySlug),
      asc(directoryStaffAds.citySlug),
      asc(directoryStaffAds.areaSlug),
      asc(directoryStaffAds.placement),
      asc(directoryStaffAds.spot),
    );
}

export interface OpenSpots {
  readonly weekStart: string;
  readonly placement: DirectoryAdPlacement;
  /** Spots the week's auction can still sell: those no staff-placed ad holds. */
  readonly open: number;
}

/** How many spots each placement's auction can sell for the business in `market` for each of `weeks`. Staff connection. */
export async function countOpenAuctionSpots(db: Database, market: DirectoryAdMarket, weeks: readonly string[]): Promise<OpenSpots[]> {
  if (weeks.length === 0) return [];
  const home = homeMarket(market.citySlug);
  const held = await db
    .select({ weekStart: directoryStaffAds.weekStart, placement: directoryStaffAds.placement, held: count() })
    .from(directoryStaffAds)
    .where(
      and(
        or(staffAdsShowingIn(market), staffAdsShowingIn(home)),
        inArray(directoryStaffAds.weekStart, [...weeks]),
        isNull(directoryStaffAds.removedAt),
      ),
    )
    .groupBy(directoryStaffAds.weekStart, directoryStaffAds.placement);
  return weeks.flatMap((weekStart) =>
    DIRECTORY_AD_PLACEMENTS.map((placement) => ({
      weekStart,
      placement,
      open:
        DIRECTORY_AD_SPOTS[placement] -
        (held.find((row) => row.weekStart === weekStart && row.placement === placement)?.held ?? 0),
    })),
  );
}

export interface StaffHeldSpot {
  readonly placement: DirectoryAdPlacement;
  readonly spot: number;
  readonly weekStart: string;
}

/**
 * Every spot-week a staff-placed ad holds from `fromWeek` on, in the business's market and on its city's home page:
 * the weeks the Advertise page tells an owner a spot is booked until. Staff connection.
 */
export async function listStaffHeldSpots(db: Database, market: DirectoryAdMarket, fromWeek: string): Promise<StaffHeldSpot[]> {
  const home = homeMarket(market.citySlug);
  return db
    .select({ placement: directoryStaffAds.placement, spot: directoryStaffAds.spot, weekStart: directoryStaffAds.weekStart })
    .from(directoryStaffAds)
    .where(
      and(
        or(staffAdsShowingIn(market), staffAdsShowingIn(home)),
        gte(directoryStaffAds.weekStart, fromWeek),
        isNull(directoryStaffAds.removedAt),
      ),
    )
    .orderBy(asc(directoryStaffAds.weekStart), asc(directoryStaffAds.placement), asc(directoryStaffAds.spot));
}
