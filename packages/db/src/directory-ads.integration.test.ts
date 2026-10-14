import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { biddingClosesAt, firstPayBy, weekStartsAt } from "./directory-ad-rules";
import { findChargeForBusiness, recordChargePayment } from "./queries/charges";
import {
  addBusinessListing,
  approveClaimTagline,
  adPictureShape,
  auctionScope,
  countMarketBidders,
  createListingAccountBusiness,
  createUnlistedAccountBusiness,
  decideDirectoryClaim,
  findBusinessKind,
  findClaimForBusiness,
  findListingOwner,
  findLiveStaffAdPictureFile,
  findStaffAdPictureFileForStaff,
  holdsLivePlacement,
  listPlaceBookings,
  homeMarket,
  incrementDirectoryAdDailyCount,
  InvalidListingLocationError,
  lastWinningPrices,
  listAuctionBidsForStaff,
  listApprovedClaimedBusinesses,
  listConfirmedAddedBusinesses,
  listBidsForBusiness,
  listDirectoryClaimsForStaff,
  linkAdKey,
  listStaffAds,
  listStaffHeldSpots,
  listWinsForBusiness,
  placeStaffAds,
  updateStaffAds,
  findStaffAdsByIds,
  type StaffAdEdit,
  readAdDailyCounts,
  readClaimedWebsites,
  readLiveDirectoryAds,
  readLiveSpotRows,
  removeDirectoryAdSpotPrice,
  setDirectoryAdSpotPrice,
  purgeOldDirectoryAdDailyCounts,
  renameAddedBusiness,
  removeDirectoryAdPrice,
  removeStaffAd,
  removeStaffAds,
  countOpenAuctionSpots,
  saveDirectoryAdBid,
  setClaimTagline,
  setClaimWebsite,
  setDirectoryAdPrice,
  settleDirectoryAds,
  updateAddedBusinessListing,
  UserAlreadyHasBusinessError,
  type AdChargePricing,
  type DirectoryAdMarket,
  type NewBusinessListing,
  type NewStaffAdPicture,
  type NewStaffAds,
} from "./queries/directory-ads";
import { createPlatformPlace, findPlaces, registerLegacyKeys } from "./queries/directory-places";
import { upsertPincodes } from "./queries/india-pincodes";
import { openAccountClosure, restoreAccountClosure } from "./queries/account-closures";
import { businesses, directoryAdBids, directoryClaims, directoryPlaces, directoryAdDailyCounts, directoryAdWins, directoryListings, directoryStaffAdPictures, directoryStaffAds, directoryVerifications, users, type DirectoryAdPlacement } from "./schema";
import { phoneAccountEmail } from "./phone-account";
import { withTenantScope, type ScopedTransaction } from "./scope";
import type { DirectoryLookup, DirectoryRef } from "./queries/directory-refs";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF = "staff-1";
const OWNERS = ["owner-a", "owner-b", "owner-c", "owner-d"] as const;
const MARKET: DirectoryAdMarket = { categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" };
const KEYS = [
  "dentists/thane/naupada/smile-dental",
  "dentists/thane/naupada/bright-teeth",
  "dentists/thane/naupada/care-dental",
  "dentists/thane/naupada/pearl-dental",
] as const;
/** The week bid for: Monday 5 Oct 2026. Bidding closes Saturday 3 Oct, 20:00 IST. */
const WEEK = "2026-10-05";
const WEDNESDAY = new Date("2026-09-30T06:00:00.000Z");
const AFTER_CLOSE = new Date(biddingClosesAt(WEEK).getTime() + 60_000);
const AFTER_PAY_BY = new Date(firstPayBy(WEEK).getTime() + 60_000);
const IN_THE_WEEK = new Date(weekStartsAt(WEEK).getTime() + 2 * 60 * 60 * 1000);

/** 18% GST, rounded half up, as chargedAmountCents does. */
const PRICING: AdChargePricing = {
  taxRateBasisPoints: 1800,
  chargedPaise: (net) => Math.floor((net * 11_800 + 5_000) / 10_000),
  describe: (win) => `Ad, ${win.placement} spot ${win.spot}, ${win.categorySlug} in ${win.areaSlug}, week of ${win.weekStart}`,
};

let dbs: TestDatabases;
let business: string[] = [];
let payments = 0;

/** A key no place has: read by the key alone, as before ids (place-based reads: directory-by-place.integration.test.ts). */
function byKey(listingKey: string): DirectoryRef {
  return { placeId: null, listingKey };
}

function byKeys(listingKeys: readonly string[]): DirectoryLookup {
  return { placeIds: [], unplacedKeys: listingKeys };
}

function asBusiness<T>(index: number, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  const owner = OWNERS[index];
  const businessId = business[index];
  if (owner === undefined || businessId === undefined) throw new Error(`No business ${index}`);
  return withTenantScope(dbs.app.db, { userId: owner, businessId }, work);
}

function id(index: number): string {
  const value = business[index];
  if (value === undefined) throw new Error(`No business ${index}`);
  return value;
}

async function bid(index: number, placement: DirectoryAdPlacement, rupees: number | null, now = WEDNESDAY) {
  return saveDirectoryAdBid(dbs.staff.db, {
    businessId: id(index),
    placement,
    weekStart: WEEK,
    amountPaise: rupees === null ? null : rupees * 100,
    now,
  });
}

async function pay(businessId: string, chargeId: string, now: Date) {
  const charge = await findChargeForBusiness(dbs.staff.db, businessId, chargeId);
  if (charge === null) throw new Error(`No charge ${chargeId}`);
  payments += 1;
  return recordChargePayment(dbs.staff.db, {
    chargeId,
    businessId,
    provider: "fake",
    providerPaymentId: `pay_ad_${payments}`,
    amountCents: charge.amountCents,
    currency: "INR",
    paidAt: now,
    now,
  });
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: STAFF, name: "Staff", email: "staff@example.com" },
    // Owners who have confirmed their email address, as an approval requires.
    ...OWNERS.map((owner, index) => ({ id: owner, name: `Owner ${index}`, email: `${owner}@example.com`, emailVerified: true })),
  ]);
  business = [];
  for (const [index, owner] of OWNERS.entries()) {
    const key = KEYS[index];
    if (key === undefined) throw new Error("Missing key");
    const created = await createListingAccountBusiness(dbs.staff.db, {
      userId: owner,
      listingKey: key,
      businessName: `Clinic ${index}`,
      phone: `+9198200000${index}0`,
    });
    business.push(created.businessId);
  }
  await setDirectoryAdPrice(dbs.staff.db, { categorySlug: "dentists", topWeekPaise: 50_000, sideWeekPaise: 30_000, staffId: STAFF });
});

describe("free listing accounts and claims", () => {
  it("creates a listing business, its owner and a pending claim the owner can read", async () => {
    expect(await findBusinessKind(dbs.staff.db, id(0))).toBe("listing");
    const claim = await asBusiness(0, (tx) => findClaimForBusiness(tx, id(0)));
    expect(claim).toMatchObject({ listingKey: KEYS[0], status: "pending", phone: "+919820000000", tagline: null });
    expect(await asBusiness(1, (tx) => findClaimForBusiness(tx, id(0)))).toBeNull();
  });

  it("refuses a second business for the same account", async () => {
    await expect(
      createListingAccountBusiness(dbs.staff.db, { userId: OWNERS[0], listingKey: KEYS[1], businessName: "Again", phone: "+919820000011" }),
    ).rejects.toBeInstanceOf(UserAlreadyHasBusinessError);
  });

  it("verifies the listing on approval and lets only one account own a listing", async () => {
    const claim = await findClaimForBusiness(dbs.staff.db, id(0));
    expect(await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: true, staffId: STAFF, now: WEDNESDAY })).toBe("decided");
    const verified = await dbs.staff.db.select().from(directoryVerifications).where(eq(directoryVerifications.listingKey, KEYS[0]));
    expect(verified[0]).toMatchObject({ businessName: "Clinic 0", phone: "+919820000000", verifiedByUserId: STAFF });

    await dbs.staff.db.insert(users).values({ id: "owner-e", name: "Rival", email: "rival@example.com", emailVerified: true });
    const rival = await createListingAccountBusiness(dbs.staff.db, { userId: "owner-e", listingKey: KEYS[0], businessName: "Rival", phone: "+919820000099" });
    expect(await decideDirectoryClaim(dbs.staff.db, { claimId: rival.claimId, approve: true, staffId: STAFF, now: WEDNESDAY })).toBe("listing-taken");
  });

  it("approves nothing for an owner who has not confirmed their email, and says why", async () => {
    await dbs.staff.db.update(users).set({ emailVerified: false }).where(eq(users.id, OWNERS[0]));
    const claim = await findClaimForBusiness(dbs.staff.db, id(0));
    const decide = (approve: boolean) => decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve, staffId: STAFF, now: WEDNESDAY });

    expect(await decide(true)).toBe("email-unconfirmed");
    expect((await findClaimForBusiness(dbs.staff.db, id(0)))?.status).toBe("pending");
    expect(await dbs.staff.db.select().from(directoryVerifications).where(eq(directoryVerifications.listingKey, KEYS[0]))).toEqual([]);
    const listed = await listDirectoryClaimsForStaff(dbs.staff.db, { filter: "pending", limit: 10, offset: 0 });
    expect(listed.claims.find((row) => row.id === claim?.id)?.ownerEmailConfirmed).toBe(false);

    // A rejection needs no confirmed address, and the approval goes through once the owner opens the link.
    await dbs.staff.db.update(users).set({ emailVerified: true }).where(eq(users.id, OWNERS[0]));
    expect(await decide(true)).toBe("decided");
  });

  it("takes a proven phone number in place of a confirmed email, and shows staff no placeholder address", async () => {
    await dbs.staff.db
      .update(users)
      .set({ emailVerified: false, email: "919820000000@phone.firstfold.invalid", phoneNumber: "+919820000000", phoneNumberVerified: true })
      .where(eq(users.id, OWNERS[0]));
    const claim = await findClaimForBusiness(dbs.staff.db, id(0));
    const listed = await listDirectoryClaimsForStaff(dbs.staff.db, { filter: "pending", limit: 10, offset: 0 });
    expect(listed.claims.find((row) => row.id === claim?.id)).toMatchObject({ ownerEmail: null, ownerEmailConfirmed: true });
    expect(await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: true, staffId: STAFF, now: WEDNESDAY })).toBe("decided");
  });

  it("keeps the owner's website: shown for a confirmed claim, cleared with null, never taken from a rejected one", async () => {
    expect(await setClaimWebsite(dbs.staff.db, id(0), "https://smiledental.example/")).toBe(true);
    expect((await findClaimForBusiness(dbs.staff.db, id(0)))?.websiteUrl).toBe("https://smiledental.example/");
    // Not public until the claim is approved.
    expect(await readClaimedWebsites(dbs.staff.db, byKeys([KEYS[0], KEYS[1]]))).toEqual(new Map());

    const claim = await findClaimForBusiness(dbs.staff.db, id(0));
    await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: true, staffId: STAFF, now: WEDNESDAY });
    expect(await readClaimedWebsites(dbs.staff.db, byKeys([KEYS[0], KEYS[1]]))).toEqual(new Map([[KEYS[0], "https://smiledental.example/"]]));

    expect(await setClaimWebsite(dbs.staff.db, id(0), null)).toBe(true);
    expect(await readClaimedWebsites(dbs.staff.db, byKeys([KEYS[0]]))).toEqual(new Map());

    const other = await findClaimForBusiness(dbs.staff.db, id(1));
    await decideDirectoryClaim(dbs.staff.db, { claimId: other?.id ?? "", approve: false, staffId: STAFF, now: WEDNESDAY });
    expect(await setClaimWebsite(dbs.staff.db, id(1), "https://brightteeth.example/")).toBe(false);
  });

  it("refuses a website that is not a web address", async () => {
    const message = await captureErrorText(setClaimWebsite(dbs.staff.db, id(0), "javascript:alert(1)"));
    expect(message).toContain("directory_claims_website_url_check");
  });

  it("finds a listing's owner only once its claim is approved", async () => {
    expect(await findListingOwner(dbs.staff.db, byKey(KEYS[0]))).toBeNull();
    const claim = await findClaimForBusiness(dbs.staff.db, id(0));
    await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: true, staffId: STAFF, now: WEDNESDAY });
    expect(await findListingOwner(dbs.staff.db, byKey(KEYS[0]))).toEqual({
      businessId: id(0),
      account: "listing",
      businessName: "Clinic 0",
      ownerName: "Owner 0",
      ownerEmail: "owner-a@example.com",
      emailConfirmed: true,
    });
    expect(await findListingOwner(dbs.staff.db, byKey("dentists/thane/naupada/nobody-owns-this"))).toBeNull();
  });

  it("knows an owner who has since become a Premium member, and that a phone account has no address to write to", async () => {
    const claim = await findClaimForBusiness(dbs.staff.db, id(0));
    await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: true, staffId: STAFF, now: WEDNESDAY });
    await dbs.staff.db.update(businesses).set({ kind: "website" }).where(eq(businesses.id, id(0)));
    expect(await findListingOwner(dbs.staff.db, byKey(KEYS[0]))).toMatchObject({ account: "member", emailConfirmed: true });

    await dbs.staff.db
      .update(users)
      .set({ email: phoneAccountEmail("+919820000011"), phoneNumber: "+919820000011", phoneNumberVerified: true })
      .where(eq(users.id, OWNERS[0]));
    expect(await findListingOwner(dbs.staff.db, byKey(KEYS[0]))).toMatchObject({ account: "member", emailConfirmed: false });
  });

  it("lists each claim for staff with its own owner", async () => {
    const page = await listDirectoryClaimsForStaff(dbs.staff.db, { filter: "pending", limit: 10, offset: 0 });
    expect(page.total).toBe(4);
    expect(page.claims.map((claim) => [claim.businessName, claim.ownerName, claim.ownerEmail])).toEqual(
      OWNERS.map((owner, index) => [`Clinic ${index}`, `Owner ${index}`, `${owner}@example.com`]),
    );
  });

  it("sends a changed tagline back for approval but keeps approval when it is saved unchanged", async () => {
    const claim = await findClaimForBusiness(dbs.staff.db, id(0));
    await setClaimTagline(dbs.staff.db, id(0), "Painless root canals, open Sundays");
    expect(await approveClaimTagline(dbs.staff.db, claim?.id ?? "")).toBe(true);
    await setClaimTagline(dbs.staff.db, id(0), "Painless root canals, open Sundays");
    expect((await findClaimForBusiness(dbs.staff.db, id(0)))?.taglineApproved).toBe(true);
    await setClaimTagline(dbs.staff.db, id(0), "Braces and implants");
    expect((await findClaimForBusiness(dbs.staff.db, id(0)))?.taglineApproved).toBe(false);
  });
});

describe("adding a business that is not in the directory", () => {
  const NEW_OWNER = "owner-new";
  const ADDED = {
    stateCode: "mh",
    categorySlug: "dentists",
    citySlug: "thane",
    areaSlug: "naupada",
    slug: "gentle-dental",
    businessName: "Gentle Dental",
    streetAddress: "12 Gokhale Road, near Thane station",
    phone: "+919820077001",
    postal: null,
  } as const;

  /** A business outside the opened districts: its PIN's state, and <state>-<district>/<locality> in its key. */
  const ELSEWHERE = {
    stateCode: "wb",
    categorySlug: "dentists",
    citySlug: "wb-north-24-parganas",
    areaSlug: "salt-lake-sector-v",
    slug: "smile-dental",
    businessName: "Smile Dental",
    streetAddress: "AB-12, Sector V",
    phone: "+919830000000",
    postal: { pincode: "700091", localityName: "Salt Lake Sector V" },
  } as const;

  beforeEach(async () => {
    // India Post's rows for the two PINs these tests list under: Salt Lake in Kolkata's suburbs, and Naupada in Thane.
    await upsertPincodes(
      dbs.staff.db,
      [
        {
          pincode: "700091",
          stateCode: "wb",
          districtSlug: "north-24-parganas",
          districtName: "North 24 Parganas",
          localities: [{ slug: "salt-lake-sector-v", name: "Salt Lake Sector V" }],
        },
        { pincode: "400602", stateCode: "mh", districtSlug: "thane", districtName: "Thane", localities: [{ slug: "naupada", name: "Naupada" }] },
      ],
      WEDNESDAY,
    );
  });

  async function newAccount(userId = NEW_OWNER): Promise<string> {
    await dbs.staff.db.insert(users).values({ id: userId, name: "New Owner", email: `${userId}@example.com`, emailVerified: true });
    const created = await createUnlistedAccountBusiness(dbs.staff.db, { userId, businessName: "Gentle" });
    return created.businessId;
  }

  it("opens a listing account with no claim", async () => {
    const businessId = await newAccount();
    expect(await findBusinessKind(dbs.staff.db, businessId)).toBe("listing");
    const claim = await withTenantScope(dbs.app.db, { userId: NEW_OWNER, businessId }, (tx) => findClaimForBusiness(tx, businessId));
    expect(claim).toBeNull();
    await expect(createUnlistedAccountBusiness(dbs.staff.db, { userId: NEW_OWNER, businessName: "Again" })).rejects.toBeInstanceOf(
      UserAlreadyHasBusinessError,
    );
  });

  it("stores the picks as a pending claim the owner can read, and renames the business", async () => {
    const businessId = await newAccount();
    const outcome = await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
    expect(outcome).toMatchObject({ kind: "added", listingKey: "dentists/thane/naupada/gentle-dental" });
    const claim = await withTenantScope(dbs.app.db, { userId: NEW_OWNER, businessId }, (tx) => findClaimForBusiness(tx, businessId));
    expect(claim).toMatchObject({
      listingKey: "dentists/thane/naupada/gentle-dental",
      businessName: "Gentle Dental",
      phone: "+919820077001",
      status: "pending",
      origin: "added",
      streetAddress: "12 Gokhale Road, near Thane station",
    });
    const renamed = await dbs.staff.db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId));
    expect(renamed[0]?.name).toBe("Gentle Dental");
  });

  it("keeps a claim made from an existing page as claimed, with no address", async () => {
    expect(await findClaimForBusiness(dbs.staff.db, id(0))).toMatchObject({ origin: "claimed", streetAddress: null });
  });

  it("adds a number when another claim already holds the address", async () => {
    const businessId = await newAccount();
    // KEYS[0] is pending and KEYS[1] rejected: only a rejected claim frees its address.
    const rejected = await findClaimForBusiness(dbs.staff.db, id(1));
    await decideDirectoryClaim(dbs.staff.db, { claimId: rejected?.id ?? "", approve: false, staffId: STAFF, now: WEDNESDAY });
    expect(await addBusinessListing(dbs.staff.db, { businessId, ...ADDED, slug: "smile-dental" }, WEDNESDAY)).toMatchObject({
      kind: "added",
      listingKey: "dentists/thane/naupada/smile-dental-2",
    });
    const second = await newAccount("owner-new-2");
    expect(await addBusinessListing(dbs.staff.db, { businessId: second, ...ADDED, slug: "bright-teeth" }, WEDNESDAY)).toMatchObject({
      kind: "added",
      listingKey: "dentists/thane/naupada/bright-teeth",
    });
  });

  it("adds a number when a client's listing already holds the address", async () => {
    const client = await dbs.staff.db.insert(businesses).values({ name: "Client Dental", slug: "client-dental" }).returning({ id: businesses.id });
    await dbs.staff.db.insert(directoryListings).values({
      businessId: client[0]?.id ?? "",
      categorySlug: "dentists",
      stateCode: "mh",
      citySlug: "thane",
      areaSlug: "naupada",
      slug: "gentle-dental",
      lat: 19.19,
      lon: 72.97,
      pinLabel: "Gokhale Road",
    });
    const businessId = await newAccount();
    expect(await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY)).toMatchObject({
      kind: "added",
      listingKey: "dentists/thane/naupada/gentle-dental-2",
    });
  });

  it("refuses a second business for the account, and an account that is not a free listing", async () => {
    const businessId = await newAccount();
    await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
    expect(await addBusinessListing(dbs.staff.db, { businessId, ...ADDED, slug: "another" }, WEDNESDAY)).toEqual({ kind: "refused", reason: "already-listed" });
    expect(await addBusinessListing(dbs.staff.db, { businessId: id(0), ...ADDED }, WEDNESDAY)).toEqual({ kind: "refused", reason: "already-listed" });
    const client = await dbs.staff.db.insert(businesses).values({ name: "Client", slug: "client" }).returning({ id: businesses.id });
    expect(await addBusinessListing(dbs.staff.db, { businessId: client[0]?.id ?? "", ...ADDED }, WEDNESDAY)).toEqual({
      kind: "refused",
      reason: "not-listing-account",
    });
  });

  it("shows staff which claims are new businesses, with their address", async () => {
    const businessId = await newAccount();
    await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
    const page = await listDirectoryClaimsForStaff(dbs.staff.db, { filter: "pending", limit: 10, offset: 0 });
    expect(page.claims.find((claim) => claim.businessId === businessId)).toMatchObject({
      origin: "added",
      streetAddress: "12 Gokhale Road, near Thane station",
      ownerName: "New Owner",
    });
  });

  it("can bid once approved, because an added business has its own page", async () => {
    const businessId = await newAccount();
    const outcome = await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
    if (outcome.kind !== "added") throw new Error("The business was not added");
    await setDirectoryAdSpotPrice(dbs.staff.db, { scopeSlug: "all", placement: "home", weekPaise: 40_000, staffId: STAFF });
    expect(await saveDirectoryAdBid(dbs.staff.db, { businessId, placement: "home", weekStart: WEEK, amountPaise: 60_000, now: WEDNESDAY })).toEqual({
      kind: "refused",
      reason: "claim-not-approved",
    });
    await decideDirectoryClaim(dbs.staff.db, { claimId: outcome.claimId, approve: true, staffId: STAFF, now: WEDNESDAY });
    expect(await saveDirectoryAdBid(dbs.staff.db, { businessId, placement: "home", weekStart: WEEK, amountPaise: 60_000, now: WEDNESDAY })).toEqual({
      kind: "saved",
    });
  });

  it("cannot bid when it has no place for an ad to lead to", async () => {
    const businessId = await newAccount();
    const outcome = await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
    if (outcome.kind !== "added") throw new Error("The business was not added");
    await decideDirectoryClaim(dbs.staff.db, { claimId: outcome.claimId, approve: true, staffId: STAFF, now: WEDNESDAY });
    await setDirectoryAdSpotPrice(dbs.staff.db, { scopeSlug: "all", placement: "home", weekPaise: 40_000, staffId: STAFF });
    await dbs.owner.db.execute(sql`alter table directory_claims disable trigger user`);
    await dbs.owner.db.execute(sql`update directory_claims set place_id = null where business_id = ${businessId}`);
    await dbs.owner.db.execute(sql`alter table directory_claims enable trigger user`);
    expect(await saveDirectoryAdBid(dbs.staff.db, { businessId, placement: "home", weekStart: WEEK, amountPaise: 60_000, now: WEDNESDAY })).toEqual({
      kind: "refused",
      reason: "no-page",
    });
  });

  it("does not mark a listing verified when an added business is approved", async () => {
    // The address may be one the website already lists for another business, whose page must not show this number.
    const businessId = await newAccount();
    const outcome = await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
    if (outcome.kind !== "added") throw new Error("The business was not added");
    expect(await decideDirectoryClaim(dbs.staff.db, { claimId: outcome.claimId, approve: true, staffId: STAFF, now: WEDNESDAY })).toBe("decided");
    const verified = await dbs.staff.db.select().from(directoryVerifications).where(eq(directoryVerifications.listingKey, outcome.listingKey));
    expect(verified).toEqual([]);
    expect((await findClaimForBusiness(dbs.staff.db, businessId))?.status).toBe("approved");
  });

  it("lists an added business for the public feed only while staff have it approved, and never a claimed listing", async () => {
    // A claimed listing, approved: the website already has its page, so it is not the feed's to send.
    const claimed = await findClaimForBusiness(dbs.staff.db, id(0));
    await decideDirectoryClaim(dbs.staff.db, { claimId: claimed?.id ?? "", approve: true, staffId: STAFF, now: WEDNESDAY });

    const businessId = await newAccount();
    const outcome = await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
    if (outcome.kind !== "added") throw new Error("The business was not added");
    expect(await listConfirmedAddedBusinesses(dbs.staff.db)).toEqual([]);

    await decideDirectoryClaim(dbs.staff.db, { claimId: outcome.claimId, approve: true, staffId: STAFF, now: WEDNESDAY });
    expect(await listConfirmedAddedBusinesses(dbs.staff.db)).toEqual([
      {
        businessId,
        listingKey: "dentists/thane/naupada/gentle-dental",
        // An added business has its own place from the moment it is added.
        placeId: expect.stringMatching(/^[2-9][23456789a-hjkmnp-z]{6}$/),
        businessName: "Gentle Dental",
        streetAddress: "12 Gokhale Road, near Thane station",
        phone: "+919820077001",
        websiteUrl: null,
        confirmedAt: WEDNESDAY,
        verified: true,
        stateCode: "mh",
        postal: null,
        pin: null,
      },
    ]);

    // Revoked: it leaves the feed, and so the website.
    await decideDirectoryClaim(dbs.staff.db, { claimId: outcome.claimId, approve: false, staffId: STAFF, now: WEDNESDAY });
    expect(await listConfirmedAddedBusinesses(dbs.staff.db)).toEqual([]);
  });

  describe("claimed businesses for the feed", () => {
    /** Gives owner 0's claim a place of the dataset, as the import and backfill do, and returns its id. */
    async function placeClaim(index: number, placeId: string): Promise<void> {
      await dbs.owner.db.insert(directoryPlaces).values({ id: placeId, origin: "open_data", stateCode: "mh", citySlug: "thane", urlSlug: `clinic-${String(index)}` });
      await dbs.owner.db.update(directoryClaims).set({ placeId }).where(eq(directoryClaims.businessId, id(index)));
    }

    it("lists an approved claim on a business the directory had, by its place, and nothing before it is approved", async () => {
      await placeClaim(0, "k7m2q9a");
      expect(await listApprovedClaimedBusinesses(dbs.staff.db)).toEqual([]);

      const claim = await findClaimForBusiness(dbs.staff.db, id(0));
      await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: true, staffId: STAFF, now: WEDNESDAY });
      expect(await listApprovedClaimedBusinesses(dbs.staff.db)).toEqual([{ businessId: id(0), placeId: "k7m2q9a", listingKey: KEYS[0] }]);
    });

    it("leaves out a claim with no place yet, a rejected one, an added business and a closing account", async () => {
      const claims = await Promise.all([0, 1, 2].map((index) => findClaimForBusiness(dbs.staff.db, id(index))));
      await decideDirectoryClaim(dbs.staff.db, { claimId: claims[0]?.id ?? "", approve: true, staffId: STAFF, now: WEDNESDAY });
      // Owner 0 is approved but its claim has no place: not in the feed, which names a business by its place.
      expect(await listApprovedClaimedBusinesses(dbs.staff.db)).toEqual([]);

      await placeClaim(0, "k7m2q9a");
      await decideDirectoryClaim(dbs.staff.db, { claimId: claims[1]?.id ?? "", approve: false, staffId: STAFF, now: WEDNESDAY });
      await placeClaim(1, "m2q9a3b");
      const added = await newAccount();
      const outcome = await addBusinessListing(dbs.staff.db, { businessId: added, ...ADDED }, WEDNESDAY);
      if (outcome.kind !== "added") throw new Error("The business was not added");
      await decideDirectoryClaim(dbs.staff.db, { claimId: outcome.claimId, approve: true, staffId: STAFF, now: WEDNESDAY });
      expect((await listApprovedClaimedBusinesses(dbs.staff.db)).map((row) => row.businessId)).toEqual([id(0)]);

      await openAccountClosure(dbs.staff.db, { userId: OWNERS[0], businessId: id(0), now: WEDNESDAY, eraseAfter: new Date(WEDNESDAY.getTime() + 86_400_000) });
      expect(await listApprovedClaimedBusinesses(dbs.staff.db)).toEqual([]);
    });
  });

  it("leaves a closing account's added business out of the feed until it is restored", async () => {
    const businessId = await newAccount();
    const outcome = await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
    if (outcome.kind !== "added") throw new Error("The business was not added");
    await decideDirectoryClaim(dbs.staff.db, { claimId: outcome.claimId, approve: true, staffId: STAFF, now: WEDNESDAY });
    expect(await listConfirmedAddedBusinesses(dbs.staff.db)).toHaveLength(1);

    await dbs.owner.db.insert(users).values({ id: "closing-owner", name: "Owner", email: "closing-owner@example.com", emailVerified: true });
    await openAccountClosure(dbs.staff.db, { userId: "closing-owner", businessId, now: WEDNESDAY, eraseAfter: new Date(WEDNESDAY.getTime() + 86_400_000) });
    expect(await listConfirmedAddedBusinesses(dbs.staff.db)).toEqual([]);

    await restoreAccountClosure(dbs.staff.db, { userId: "closing-owner", now: WEDNESDAY });
    expect(await listConfirmedAddedBusinesses(dbs.staff.db)).toHaveLength(1);
  });

  it("adds a business outside the opened districts under its own state, with its PIN and locality", async () => {
    const businessId = await newAccount();
    const outcome = await addBusinessListing(dbs.staff.db, { businessId, ...ELSEWHERE }, WEDNESDAY);
    expect(outcome).toMatchObject({ kind: "added", listingKey: "dentists/wb-north-24-parganas/salt-lake-sector-v/smile-dental" });
    const claim = await withTenantScope(dbs.app.db, { userId: NEW_OWNER, businessId }, (tx) => findClaimForBusiness(tx, businessId));
    expect(claim).toMatchObject({ pincode: "700091", localityName: "Salt Lake Sector V" });
    const placeId = claim?.placeId ?? "";
    expect((await findPlaces(dbs.staff.db, [placeId])).get(placeId)).toMatchObject({ stateCode: "wb", citySlug: "wb-north-24-parganas" });
  });

  it("keeps a Thane business in Maharashtra, with no PIN or locality", async () => {
    const businessId = await newAccount();
    await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
    const claim = await findClaimForBusiness(dbs.staff.db, businessId);
    expect(claim).toMatchObject({ pincode: null, localityName: null });
    const placeId = claim?.placeId ?? "";
    expect((await findPlaces(dbs.staff.db, [placeId])).get(placeId)).toMatchObject({ stateCode: "mh" });
  });

  it("refuses a PIN on a claimed listing, and a PIN without its locality", async () => {
    const claimed = await findClaimForBusiness(dbs.staff.db, id(0));
    const onClaimed = await captureErrorText(
      dbs.staff.db.execute(sql`update directory_claims set pincode = '700091', locality_name = 'Salt Lake' where id = ${claimed?.id ?? ""}`),
    );
    expect(onClaimed).toContain("directory_claims_postal_check");
    const businessId = await newAccount();
    await addBusinessListing(dbs.staff.db, { businessId, ...ELSEWHERE }, WEDNESDAY);
    const halfPostal = await captureErrorText(
      dbs.staff.db.execute(sql`update directory_claims set locality_name = null where business_id = ${businessId}`),
    );
    expect(halfPostal).toContain("directory_claims_postal_check");
    const badPin = await captureErrorText(
      dbs.staff.db.execute(sql`update directory_claims set pincode = '070091' where business_id = ${businessId}`),
    );
    expect(badPin).toContain("directory_claims_pincode_check");
  });

  it("sends a confirmed business outside the opened districts with its state and where India Post puts its PIN", async () => {
    const businessId = await newAccount();
    const outcome = await addBusinessListing(dbs.staff.db, { businessId, ...ELSEWHERE }, WEDNESDAY);
    if (outcome.kind !== "added") throw new Error("The business was not added");
    await decideDirectoryClaim(dbs.staff.db, { claimId: outcome.claimId, approve: true, staffId: STAFF, now: WEDNESDAY });
    expect(await listConfirmedAddedBusinesses(dbs.staff.db)).toEqual([
      expect.objectContaining({
        listingKey: "dentists/wb-north-24-parganas/salt-lake-sector-v/smile-dental",
        stateCode: "wb",
        postal: { pincode: "700091", localityName: "Salt Lake Sector V", districtName: "North 24 Parganas" },
      }),
    ]);
  });

  it("refuses a listing whose PIN, state, city or locality do not agree with India Post", async () => {
    const businessId = await newAccount();
    const refused: readonly Omit<NewBusinessListing, "businessId">[] = [
      // A PIN India Post does not have.
      { ...ELSEWHERE, postal: { pincode: "700999", localityName: "Salt Lake Sector V" } },
      // The PIN's state is West Bengal.
      { ...ELSEWHERE, stateCode: "mh" },
      // The PIN's district is North 24 Parganas.
      { ...ELSEWHERE, citySlug: "wb-kolkata" },
      // A locality the PIN does not cover, by slug or by name.
      { ...ELSEWHERE, areaSlug: "park-street" },
      { ...ELSEWHERE, postal: { pincode: "700091", localityName: "Salt Lake" } },
      // A PIN in an opened district lists under its area, with no postal fields.
      { ...ELSEWHERE, stateCode: "mh", citySlug: "mh-thane", areaSlug: "naupada", postal: { pincode: "400602", localityName: "Naupada" } },
      // No PIN: only an opened district's town will do.
      { ...ELSEWHERE, postal: null },
      { ...ADDED, citySlug: "wb-north-24-parganas" },
    ];
    for (const listing of refused) {
      await expect(addBusinessListing(dbs.staff.db, { businessId, ...listing }, WEDNESDAY)).rejects.toBeInstanceOf(InvalidListingLocationError);
    }
    expect(await findClaimForBusiness(dbs.staff.db, businessId)).toBeNull();
  });

  it("will not let a PIN that has a claim leave India Post's table", async () => {
    const businessId = await newAccount();
    await addBusinessListing(dbs.staff.db, { businessId, ...ELSEWHERE }, WEDNESDAY);
    const removed = await captureErrorText(dbs.owner.db.execute(sql`delete from india_pincodes where pincode = '700091'`));
    expect(removed).toContain("directory_claims_pincode_india_pincodes_pincode_fk");
  });

  it("takes an ad line from an added business, held for approval like any other", async () => {
    const businessId = await newAccount();
    await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
    expect(await setClaimTagline(dbs.staff.db, businessId, "Fresh bread daily")).toBe(true);
    expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({ tagline: "Fresh bread daily", taglineApproved: false });
  });

  describe("changing it afterwards", () => {
    const CHANGED = {
      stateCode: "mh",
      categorySlug: "bakery-stores",
      citySlug: "thane",
      areaSlug: "charai",
      slug: "gentle-bakes",
      businessName: "Gentle Bakes",
      streetAddress: "4 Station Road",
      phone: "+919820077002",
      postal: null,
    } as const;

    async function added(userId = NEW_OWNER): Promise<{ readonly businessId: string; readonly claimId: string }> {
      const businessId = await newAccount(userId);
      const outcome = await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY);
      if (outcome.kind !== "added") throw new Error("The business was not added");
      return { businessId, claimId: outcome.claimId };
    }

    it("lets the owner change every pick while the claim waits for the call", async () => {
      const { businessId, claimId } = await added();
      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...CHANGED }, WEDNESDAY)).toEqual({
        kind: "updated",
        listingKey: "bakery-stores/thane/charai/gentle-bakes",
      });
      expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({
        id: claimId,
        listingKey: "bakery-stores/thane/charai/gentle-bakes",
        businessName: "Gentle Bakes",
        streetAddress: "4 Station Road",
        phone: "+919820077002",
        status: "pending",
        origin: "added",
      });
      const renamed = await dbs.staff.db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId));
      expect(renamed[0]?.name).toBe("Gentle Bakes");
    });

    it("moves a business between states when its owner corrects the PIN, and clears the PIN on the way back", async () => {
      const { businessId } = await added();
      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ELSEWHERE }, WEDNESDAY)).toEqual({
        kind: "updated",
        listingKey: "dentists/wb-north-24-parganas/salt-lake-sector-v/smile-dental",
      });
      const away = await findClaimForBusiness(dbs.staff.db, businessId);
      expect(away).toMatchObject({ pincode: "700091", localityName: "Salt Lake Sector V" });
      const placeId = away?.placeId ?? "";
      expect((await findPlaces(dbs.staff.db, [placeId])).get(placeId)).toMatchObject({ stateCode: "wb", citySlug: "wb-north-24-parganas" });

      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ADDED }, WEDNESDAY)).toEqual({
        kind: "updated",
        listingKey: "dentists/thane/naupada/gentle-dental",
      });
      expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({ pincode: null, localityName: null });
      expect((await findPlaces(dbs.staff.db, [placeId])).get(placeId)).toMatchObject({ stateCode: "mh", citySlug: "thane" });
    });

    it("refuses a change whose PIN and picks do not agree, and leaves the claim as it was", async () => {
      const { businessId } = await added();
      await expect(
        updateAddedBusinessListing(dbs.staff.db, { businessId, ...ELSEWHERE, citySlug: "wb-kolkata" }, WEDNESDAY),
      ).rejects.toBeInstanceOf(InvalidListingLocationError);
      expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({
        listingKey: "dentists/thane/naupada/gentle-dental",
        pincode: null,
      });
    });

    it("keeps a claim from before places in Thane: it cannot take a PIN until the backfill gives it a place", async () => {
      const { businessId } = await added();
      await dbs.staff.db.execute(sql`update directory_claims set place_id = null where business_id = ${businessId}`);
      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ELSEWHERE }, WEDNESDAY)).toEqual({
        kind: "refused",
        reason: "locked",
      });
      expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({ pincode: null, listingKey: "dentists/thane/naupada/gentle-dental" });
    });

    it("keeps its own address when only the street address or number changes", async () => {
      const { businessId } = await added();
      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ADDED, streetAddress: "14 Gokhale Road" }, WEDNESDAY)).toEqual({
        kind: "updated",
        listingKey: "dentists/thane/naupada/gentle-dental",
      });
    });

    it("keeps a numbered address on a save that changes neither the picks nor the name, even once the plain one is free", async () => {
      const businessId = await newAccount();
      // KEYS[0] (smile-dental) is pending, so this one is given smile-dental-2.
      await addBusinessListing(dbs.staff.db, { businessId, ...ADDED, slug: "smile-dental", businessName: "Smile Dental" }, WEDNESDAY);
      const holder = await findClaimForBusiness(dbs.staff.db, id(0));
      await decideDirectoryClaim(dbs.staff.db, { claimId: holder?.id ?? "", approve: false, staffId: STAFF, now: WEDNESDAY });
      expect(
        await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ADDED, slug: "smile-dental", businessName: "Smile Dental", phone: "+919820077009" }, WEDNESDAY),
      ).toEqual({ kind: "updated", listingKey: "dentists/thane/naupada/smile-dental-2" });
    });

    it("does not approve details staff have not seen", async () => {
      const { businessId, claimId } = await added();
      const seen = { listingKey: "dentists/thane/naupada/gentle-dental", phone: ADDED.phone, businessName: ADDED.businessName };
      // The owner changes the number after staff opened the queue and called the old one.
      await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ADDED, phone: "+919820077003" }, WEDNESDAY);
      expect(await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: WEDNESDAY, seen })).toBe("changed");
      expect((await findClaimForBusiness(dbs.staff.db, businessId))?.status).toBe("pending");
      expect(
        await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: WEDNESDAY, seen: { ...seen, phone: "+919820077003" } }),
      ).toBe("decided");
    });

    it("adds a number when the new address is another claim's", async () => {
      const { businessId } = await added();
      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ADDED, slug: "smile-dental" }, WEDNESDAY)).toEqual({
        kind: "updated",
        listingKey: "dentists/thane/naupada/smile-dental-2",
      });
    });

    it("stays open after staff approve it: the category and area move, the name and the web address do not", async () => {
      const { businessId, claimId } = await added();
      await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: WEDNESDAY });
      const before = await findClaimForBusiness(dbs.staff.db, businessId);

      // A new name is not part of this change once live.
      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...CHANGED }, WEDNESDAY)).toEqual({ kind: "refused", reason: "locked" });
      expect((await findClaimForBusiness(dbs.staff.db, businessId))?.listingKey).toBe("dentists/thane/naupada/gentle-dental");

      const moved = { ...CHANGED, slug: "gentle-dental", businessName: before?.businessName ?? "" };
      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...moved }, WEDNESDAY)).toEqual({
        kind: "updated",
        listingKey: "bakery-stores/thane/charai/gentle-dental",
      });
      const after = await findClaimForBusiness(dbs.staff.db, businessId);
      expect(after).toMatchObject({ listingKey: "bakery-stores/thane/charai/gentle-dental", status: "approved", placeId: before?.placeId });
    });

    it("is locked once the claim is turned down, for a claimed listing, and for an account with no business", async () => {
      const { businessId, claimId } = await added();

      await decideDirectoryClaim(dbs.staff.db, { claimId, approve: false, staffId: STAFF, now: WEDNESDAY });
      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...CHANGED }, WEDNESDAY)).toEqual({ kind: "refused", reason: "locked" });

      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId: id(0), ...CHANGED }, WEDNESDAY)).toEqual({ kind: "refused", reason: "locked" });
      const empty = await newAccount("owner-new-2");
      expect(await updateAddedBusinessListing(dbs.staff.db, { businessId: empty, ...CHANGED }, WEDNESDAY)).toEqual({ kind: "refused", reason: "no-claim" });
    });

    it("lets a confirmed added business change its name, and leaves its address alone", async () => {
      const { businessId, claimId } = await added();
      // Before the call the whole form is open, so the name alone is not changed this way.
      expect(await renameAddedBusiness(dbs.staff.db, businessId, "Gentle Dental Care")).toBe(false);
      await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: WEDNESDAY });
      expect(await renameAddedBusiness(dbs.staff.db, businessId, "Gentle Dental Care")).toBe(true);
      expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({
        businessName: "Gentle Dental Care",
        listingKey: "dentists/thane/naupada/gentle-dental",
        status: "approved",
      });
      const renamed = await dbs.staff.db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId));
      expect(renamed[0]?.name).toBe("Gentle Dental Care");
    });

    it("does not rename a claimed listing, whose name is the website's", async () => {
      const claim = await findClaimForBusiness(dbs.staff.db, id(0));
      await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: true, staffId: STAFF, now: WEDNESDAY });
      expect(await renameAddedBusiness(dbs.staff.db, id(0), "Something Else")).toBe(false);
      expect((await findClaimForBusiness(dbs.staff.db, id(0)))?.businessName).toBe("Clinic 0");
    });
  });

  it("refuses an address on an existing claim and a missing one on an added business", async () => {
    const businessId = await newAccount();
    const message = await captureErrorText(
      dbs.staff.db.execute(
        sql`insert into directory_claims (id, business_id, listing_key, business_name, phone, origin) values (gen_random_uuid(), ${businessId}, 'dentists/thane/naupada/x', 'X', '+919820000001', 'added')`,
      ),
    );
    expect(message).toContain("directory_claims_street_address_check");
  });
});

async function approveAll(): Promise<void> {
  for (const index of OWNERS.keys()) {
    const claim = await findClaimForBusiness(dbs.staff.db, id(index));
    await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: true, staffId: STAFF, now: WEDNESDAY });
  }
}

describe("bidding", () => {
  it("refuses until the claim is approved, and in a category with no price", async () => {
    expect(await bid(0, "top", 600)).toEqual({ kind: "refused", reason: "claim-not-approved" });
    await approveAll();
    expect(await bid(0, "top", 499)).toEqual({ kind: "refused", reason: "below-price" });
    expect(await bid(0, "top", 600)).toEqual({ kind: "saved" });
  });

  it("keeps bids sealed: an owner reads only its own", async () => {
    await approveAll();
    await bid(0, "top", 600);
    await bid(1, "top", 700);
    expect(await asBusiness(0, (tx) => listBidsForBusiness(tx, id(1), WEEK))).toEqual([]);
    expect((await asBusiness(0, (tx) => listBidsForBusiness(tx, id(0), WEEK))).map((row) => row.amountPaise)).toEqual([60_000]);
    expect(await countMarketBidders(dbs.staff.db, MARKET, [WEEK])).toEqual([{ weekStart: WEEK, placement: "top", bidders: 2 }]);
  });

  it("lets a bid rise late but not fall or be withdrawn in the last day", async () => {
    await approveAll();
    await bid(0, "top", 600);
    const saturday = new Date("2026-10-03T04:00:00.000Z");
    expect(await bid(0, "top", 550, saturday)).toEqual({ kind: "refused", reason: "too-late-to-lower" });
    expect(await bid(0, "top", null, saturday)).toEqual({ kind: "refused", reason: "too-late-to-lower" });
    expect(await bid(0, "top", 650, saturday)).toEqual({ kind: "saved" });
    expect(await bid(0, "top", 700, AFTER_CLOSE)).toEqual({ kind: "refused", reason: "closed" });
  });
});

describe("settlement", () => {
  it("does nothing before the close", async () => {
    await approveAll();
    await bid(0, "top", 600);
    expect(await settleDirectoryAds(dbs.staff.db, WEDNESDAY, PRICING)).toEqual({ settled: 0, won: 0, lapsed: 0, passedOn: 0 });
  });

  it("settles second-price, keeps a top winner out of the side spots, and charges GST", async () => {
    await approveAll();
    await bid(0, "top", 900);
    await bid(1, "top", 700);
    await bid(0, "side", 800);
    await bid(1, "side", 500);
    await bid(2, "side", 400);
    await bid(3, "side", 350);

    const summary = await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    expect(summary).toEqual({ settled: 2, won: 3, lapsed: 0, passedOn: 0 });
    // Idempotent.
    expect(await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING)).toEqual({ settled: 0, won: 0, lapsed: 0, passedOn: 0 });

    const top = await listWinsForBusiness(dbs.staff.db, id(0), WEEK);
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ placement: "top", spot: 1, pricePaise: 71_000, status: "awaiting_payment" });
    expect(top[0]?.payBy.toISOString()).toBe(firstPayBy(WEEK).toISOString());
    const charge = await findChargeForBusiness(dbs.staff.db, id(0), top[0]?.chargeId ?? "");
    expect(charge).toMatchObject({ kind: "directory_ad", unitAmountCents: 71_000, amountCents: 83_780, status: "open", currency: "INR" });

    // Business 0 holds top, so side goes to 1 (pays 2's bid + ₹10) and 2 (pays 3's bid + ₹10).
    const side1 = await listWinsForBusiness(dbs.staff.db, id(1), WEEK);
    expect(side1.map((win) => [win.placement, win.spot, win.pricePaise])).toEqual([["side", 1, 41_000]]);
    const side2 = await listWinsForBusiness(dbs.staff.db, id(2), WEEK);
    expect(side2.map((win) => [win.placement, win.spot, win.pricePaise])).toEqual([["side", 2, 36_000]]);
    expect(await listWinsForBusiness(dbs.staff.db, id(3), WEEK)).toEqual([]);

    const staffView = await listAuctionBidsForStaff(dbs.staff.db, [WEEK]);
    expect(staffView.filter((row) => row.status === "lost")).toHaveLength(3);
    expect(await lastWinningPrices(dbs.staff.db, MARKET, AFTER_CLOSE)).toEqual({ weekStart: WEEK, top: [71_000], side: [41_000, 36_000], profile: [], home: [] });
  });

  it("shows an ad once it is paid, during its week", async () => {
    await approveAll();
    await bid(0, "top", 600);
    await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    const [win] = await listWinsForBusiness(dbs.staff.db, id(0), WEEK);
    expect(await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).toEqual({ top: null, side: [], profile: null, home: [] });

    expect((await pay(id(0), win?.chargeId ?? "", AFTER_CLOSE)).outcome).toBe("paid");
    expect(await readLiveDirectoryAds(dbs.staff.db, MARKET, AFTER_CLOSE)).toEqual({ top: null, side: [], profile: null, home: [] });
    expect(await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).toEqual({
      top: { spot: 1, key: KEYS[0], linkUrl: null, picture: null, placeId: null, name: "Clinic 0", tagline: null },
      side: [],
      profile: null,
      home: [],
    });

    const claim = await findClaimForBusiness(dbs.staff.db, id(0));
    await setClaimTagline(dbs.staff.db, id(0), "Open on Sundays");
    await approveClaimTagline(dbs.staff.db, claim?.id ?? "");
    expect((await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).top?.tagline).toBe("Open on Sundays");

    // Revoking the claim takes the ad down.
    await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: false, staffId: STAFF, now: IN_THE_WEEK });
    expect(await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).toEqual({ top: null, side: [], profile: null, home: [] });
  });

  it("takes a closing account's ad and added listing down, and puts them back when it is restored", async () => {
    await approveAll();
    await bid(0, "top", 600);
    await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    const [win] = await listWinsForBusiness(dbs.staff.db, id(0), WEEK);
    await pay(id(0), win?.chargeId ?? "", AFTER_CLOSE);
    expect((await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).top).not.toBeNull();

    await dbs.owner.db.insert(users).values({ id: "closing-owner", name: "Owner", email: "closing-owner@example.com", emailVerified: true });
    await openAccountClosure(dbs.staff.db, { userId: "closing-owner", businessId: id(0), now: IN_THE_WEEK, eraseAfter: new Date(IN_THE_WEEK.getTime() + 86_400_000) });
    expect(await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).toEqual({ top: null, side: [], profile: null, home: [] });

    await restoreAccountClosure(dbs.staff.db, { userId: "closing-owner", now: IN_THE_WEEK });
    expect((await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).top).not.toBeNull();
  });

  it("lapses an unpaid win, cancels its charge, and passes the spot to the next bidder", async () => {
    await approveAll();
    await bid(0, "top", 900);
    await bid(1, "top", 700);
    await bid(2, "top", 600);
    await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    const [first] = await listWinsForBusiness(dbs.staff.db, id(0), WEEK);

    const summary = await settleDirectoryAds(dbs.staff.db, AFTER_PAY_BY, PRICING);
    expect(summary).toEqual({ settled: 0, won: 0, lapsed: 1, passedOn: 1 });
    const cancelled = await findChargeForBusiness(dbs.staff.db, id(0), first?.chargeId ?? "");
    expect(cancelled?.status).toBe("waived");

    const [second] = await listWinsForBusiness(dbs.staff.db, id(1), WEEK);
    expect(second).toMatchObject({ placement: "top", spot: 1, pricePaise: 61_000, status: "awaiting_payment" });
    expect(second?.payBy.getTime()).toBe(AFTER_PAY_BY.getTime() + 24 * 60 * 60 * 1000);

    // Paying the lapsed charge now is refused as not open, and flagged for a refund.
    expect((await pay(id(0), first?.chargeId ?? "", AFTER_PAY_BY)).outcome).toBe("not-open");
  });

  it("refuses to pair a win with another business's bid", async () => {
    await approveAll();
    await bid(0, "top", 600);
    await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    const [win] = await listWinsForBusiness(dbs.staff.db, id(0), WEEK);
    const error = await captureErrorText(
      dbs.staff.db.update(directoryAdWins).set({ businessId: id(1) }).where(eq(directoryAdWins.id, win?.id ?? "")),
    );
    expect(error).toContain("does not match its bid");
  });

  it("never lets the customer role write a bid", async () => {
    await approveAll();
    const error = await captureErrorText(
      asBusiness(0, (tx) =>
        tx.insert(directoryAdBids).values({
          businessId: id(0),
          listingKey: KEYS[0],
          ...MARKET,
          placement: "top",
          weekStart: WEEK,
          amountPaise: 60_000,
          amountSetAt: WEDNESDAY,
        }),
      ),
    );
    expect(error).toMatch(/permission denied/);
  });

  it("closes a category to new bids once staff remove its price", async () => {
    await approveAll();
    await removeDirectoryAdPrice(dbs.staff.db, "dentists");
    expect(await bid(0, "top", 600)).toEqual({ kind: "refused", reason: "not-open" });
  });
});

describe("home page and business page spots", () => {
  const HOME_PRICE = 40_000;
  const PROFILE_PRICE = 20_000;

  async function openSpots(): Promise<void> {
    await setDirectoryAdSpotPrice(dbs.staff.db, { scopeSlug: "all", placement: "home", weekPaise: HOME_PRICE, staffId: STAFF });
    await setDirectoryAdSpotPrice(dbs.staff.db, { scopeSlug: "dentists", placement: "profile", weekPaise: PROFILE_PRICE, staffId: STAFF });
  }

  it("scopes the home page to the city and every other placement to the business's own market", () => {
    expect(auctionScope("home", MARKET)).toEqual({ categorySlug: "all", citySlug: "thane", areaSlug: "all" });
    expect(homeMarket("thane")).toEqual(auctionScope("home", MARKET));
    expect(auctionScope("top", MARKET)).toBe(MARKET);
    expect(auctionScope("profile", MARKET)).toBe(MARKET);
  });

  it("stays closed until staff set its price", async () => {
    await approveAll();
    expect(await bid(0, "home", 500)).toEqual({ kind: "refused", reason: "not-open" });
    expect(await bid(0, "profile", 500)).toEqual({ kind: "refused", reason: "not-open" });
    await openSpots();
    expect(await bid(0, "home", 500)).toEqual({ kind: "saved" });
    expect(await bid(0, "profile", 500)).toEqual({ kind: "saved" });
    expect(await bid(1, "home", 300)).toEqual({ kind: "refused", reason: "below-price" });
    await removeDirectoryAdSpotPrice(dbs.staff.db, "dentists", "profile");
    expect(await bid(1, "profile", 500)).toEqual({ kind: "refused", reason: "not-open" });
  });

  it("keeps a home bid in the city's auction, whatever the business's category and area", async () => {
    await approveAll();
    await openSpots();
    await bid(0, "home", 500);
    const [stored] = await dbs.staff.db.select().from(directoryAdBids).where(eq(directoryAdBids.businessId, id(0)));
    expect(stored).toMatchObject({ placement: "home", categorySlug: "all", citySlug: "thane", areaSlug: "all", listingKey: KEYS[0] });
    expect(await countMarketBidders(dbs.staff.db, MARKET, [WEEK])).toEqual([{ weekStart: WEEK, placement: "home", bidders: 1 }]);
  });

  it("sells four home tiles second-price from one city-wide price, and shows them in the city's market", async () => {
    await approveAll();
    await openSpots();
    await bid(0, "home", 900);
    await bid(1, "home", 700);
    await bid(2, "home", 600);
    await bid(3, "home", 500);
    await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    const wins = await Promise.all([0, 1, 2, 3].map((index) => listWinsForBusiness(dbs.staff.db, id(index), WEEK)));
    expect(wins.map(([win]) => [win?.placement, win?.spot, win?.pricePaise])).toEqual([
      ["home", 1, 71_000],
      ["home", 2, 61_000],
      ["home", 3, 51_000],
      ["home", 4, HOME_PRICE],
    ]);
    for (const [index, [win]] of wins.entries()) await pay(id(index), win?.chargeId ?? "", AFTER_CLOSE);
    const live = await readLiveDirectoryAds(dbs.staff.db, homeMarket("thane"), IN_THE_WEEK);
    expect(live.home.map((ad) => ad.name)).toEqual(["Clinic 0", "Clinic 1", "Clinic 2", "Clinic 3"]);
    expect(live.top).toBeNull();
    // A category page's market has none of them.
    expect((await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).home).toEqual([]);
  });

  it("lets a business hold the top spot, a side spot's rival rules, and a business-page spot at once", async () => {
    await approveAll();
    await openSpots();
    await bid(0, "top", 600);
    await bid(0, "profile", 400);
    await bid(0, "home", 800);
    await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    const wins = await listWinsForBusiness(dbs.staff.db, id(0), WEEK);
    expect(wins.map((win) => win.placement).sort()).toEqual(["home", "profile", "top"]);
    for (const win of wins) await pay(id(0), win.chargeId, AFTER_CLOSE);
    const rows = await readLiveSpotRows(dbs.staff.db, MARKET, IN_THE_WEEK);
    expect(rows.map((row) => [row.placement, row.spot, row.source, row.businessId])).toEqual([
      ["top", 1, "auction", id(0)],
      ["profile", 1, "auction", id(0)],
    ]);
    expect((await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).profile?.name).toBe("Clinic 0");
  });

  it("lets staff place a home ad by the city, and refuses a spot the placement does not have", async () => {
    const staffAd = (overrides: Partial<NewStaffAds>): NewStaffAds => ({
      listingKey: "salons/thane/vartak-nagar/glow-salon",
      businessName: "Glow Salon",
      tagline: null,
      market: MARKET,
      placement: "home",
      spot: 1,
      fromWeek: WEEK,
      weeks: 1,
      agreedPaise: null,
      note: null,
      staffId: STAFF,
      now: WEDNESDAY,
      ...overrides,
    });
    const outcome = await placeStaffAds(dbs.staff.db, staffAd({ spot: 3 }));
    expect(outcome).toEqual({ kind: "placed", weeks: 1 });
    const live = await readLiveDirectoryAds(dbs.staff.db, homeMarket("thane"), IN_THE_WEEK);
    expect(live.home.map((ad) => ad.name)).toEqual(["Glow Salon"]);
    await expect(placeStaffAds(dbs.staff.db, staffAd({ placement: "profile", spot: 2 }))).rejects.toThrow(RangeError);
    await approveAll();
    await openSpots();
    expect(await countOpenAuctionSpots(dbs.staff.db, MARKET, [WEEK])).toContainEqual({ weekStart: WEEK, placement: "home", open: 3 });
  });
});

describe("counting who saw and clicked an ad", () => {
  const TODAY = "2026-10-07";
  const SALON_KEY = "salons/thane/vartak-nagar/glow-salon";
  let place = "";

  beforeEach(async () => {
    place = await createPlatformPlace(dbs.staff.db, { citySlug: "thane", urlSlug: "glow-salon", origin: "added", stateCode: "mh" }, WEDNESDAY);
    await registerLegacyKeys(dbs.staff.db, place, [SALON_KEY]);
  });

  it("adds one a time per placement, day and kind, and reads them back by day", async () => {
    await incrementDirectoryAdDailyCount(dbs.staff.db, { placeId: place, placement: "home", day: TODAY, kind: "impression" });
    await incrementDirectoryAdDailyCount(dbs.staff.db, { placeId: place, placement: "home", day: TODAY, kind: "impression" });
    await incrementDirectoryAdDailyCount(dbs.staff.db, { placeId: place, placement: "home", day: TODAY, kind: "click" });
    await incrementDirectoryAdDailyCount(dbs.staff.db, { placeId: place, placement: "top", day: "2026-10-06", kind: "impression" });
    expect(await readAdDailyCounts(dbs.staff.db, place, "2026-10-06")).toEqual([
      { placement: "top", day: "2026-10-06", kind: "impression", count: 1 },
      expect.objectContaining({ placement: "home", day: TODAY, count: expect.any(Number) }),
      expect.objectContaining({ placement: "home", day: TODAY, count: expect.any(Number) }),
    ]);
    const today = await readAdDailyCounts(dbs.staff.db, place, TODAY);
    expect(today).toHaveLength(2);
    expect(today.find((row) => row.kind === "impression")?.count).toBe(2);
    expect(today.find((row) => row.kind === "click")?.count).toBe(1);
  });

  it("purges counts older than a day and keeps the rest", async () => {
    await incrementDirectoryAdDailyCount(dbs.staff.db, { placeId: place, placement: "home", day: "2026-06-01", kind: "click" });
    await incrementDirectoryAdDailyCount(dbs.staff.db, { placeId: place, placement: "home", day: TODAY, kind: "click" });
    await purgeOldDirectoryAdDailyCounts(dbs.staff.db, "2026-07-01");
    const left = await dbs.staff.db.select().from(directoryAdDailyCounts);
    expect(left.map((row) => row.day)).toEqual([TODAY]);
  });

  it("lists the weeks a place's ad had a spot, newest first, from staff placements it still has", async () => {
    const staffAd = (weeks: number, placement: "home" | "side"): NewStaffAds => ({
      listingKey: SALON_KEY,
      businessName: "Glow Salon",
      tagline: null,
      market: MARKET,
      placement,
      spot: 1,
      fromWeek: WEEK,
      weeks,
      agreedPaise: null,
      note: null,
      staffId: STAFF,
      now: WEDNESDAY,
    });
    await placeStaffAds(dbs.staff.db, staffAd(2, "home"));
    await placeStaffAds(dbs.staff.db, staffAd(1, "side"));
    expect(await listPlaceBookings(dbs.staff.db, place, WEEK)).toEqual([
      { placement: "home", weekStart: "2026-10-12", source: "staff" },
      { placement: "home", weekStart: "2026-10-05", source: "staff" },
      { placement: "side", weekStart: "2026-10-05", source: "staff" },
    ]);
    expect(await listPlaceBookings(dbs.staff.db, place, "2026-10-12")).toHaveLength(1);
    expect(await listPlaceBookings(dbs.staff.db, "2222222", WEEK)).toEqual([]);
  });

  it("refuses a count for a place the registry does not have", async () => {
    const error = await captureErrorText(
      incrementDirectoryAdDailyCount(dbs.staff.db, { placeId: "2222222", placement: "home", day: TODAY, kind: "click" }),
    );
    expect(error).toContain("directory_ad_daily_counts_place_id_directory_places_id_fk");
  });

  it("knows the placement an advertiser's ad is running on this week, and only then", async () => {
    await placeStaffAds(dbs.staff.db, {
      listingKey: SALON_KEY,
      businessName: "Glow Salon",
      tagline: null,
      market: MARKET,
      placement: "home",
      spot: 2,
      fromWeek: WEEK,
      weeks: 1,
      agreedPaise: null,
      note: null,
      staffId: STAFF,
      now: WEDNESDAY,
    });
    expect(await holdsLivePlacement(dbs.staff.db, place, "home", IN_THE_WEEK)).toBe(true);
    expect(await holdsLivePlacement(dbs.staff.db, place, "top", IN_THE_WEEK)).toBe(false);
    expect(await holdsLivePlacement(dbs.staff.db, place, "home", WEDNESDAY)).toBe(false);
  });
});

describe("staff-placed ads", () => {
  /** A salon staff place on the dentists page: any listing, any market. */
  const SALON_KEY = "salons/thane/vartak-nagar/glow-salon";

  function staffAd(overrides: Partial<NewStaffAds> = {}): NewStaffAds {
    return {
      listingKey: SALON_KEY,
      businessName: "Glow Salon",
      tagline: "Bridal packages from ₹4,999",
      market: MARKET,
      placement: "side",
      spot: 1,
      fromWeek: WEEK,
      weeks: 1,
      agreedPaise: 150_000,
      note: "Paid by UPI",
      staffId: STAFF,
      now: WEDNESDAY,
      ...overrides,
    };
  }

  it("places an ad for any listing in any market, for several weeks, and shows it in its week", async () => {
    expect(await placeStaffAds(dbs.staff.db, staffAd({ weeks: 3 }))).toEqual({ kind: "placed", weeks: 3 });
    const listed = await listStaffAds(dbs.staff.db, WEEK);
    expect(listed.map((ad) => ad.weekStart)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(listed[0]).toMatchObject({ listingKey: SALON_KEY, categorySlug: "dentists", areaSlug: "naupada", spot: 1, agreedPaise: 150_000 });

    // Not its week yet.
    expect(await readLiveDirectoryAds(dbs.staff.db, MARKET, WEDNESDAY)).toEqual({ top: null, side: [], profile: null, home: [] });
    expect(await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).toEqual({
      top: null,
      side: [{ spot: 1, key: SALON_KEY, linkUrl: null, picture: null, placeId: null, name: "Glow Salon", tagline: "Bridal packages from ₹4,999" }],
      profile: null,
      home: [],
    });
  });

  it("refuses a spot another staff ad holds, a week already over, and writes nothing when any week clashes", async () => {
    await placeStaffAds(dbs.staff.db, staffAd({ fromWeek: "2026-10-12" }));
    expect(await placeStaffAds(dbs.staff.db, staffAd({ weeks: 2, businessName: "Other" }))).toEqual({
      kind: "spot-taken",
      weekStart: "2026-10-12",
      by: "staff",
    });
    expect(await listStaffAds(dbs.staff.db, WEEK)).toHaveLength(1);
    expect(await placeStaffAds(dbs.staff.db, staffAd({ fromWeek: "2026-09-21" }))).toEqual({ kind: "week-past" });
  });

  it("frees the spot when the ad is taken down", async () => {
    await placeStaffAds(dbs.staff.db, staffAd());
    const [ad] = await listStaffAds(dbs.staff.db, WEEK);
    expect(await removeStaffAd(dbs.staff.db, { id: ad?.id ?? "", staffId: STAFF, now: WEDNESDAY })).toBe(true);
    expect(await removeStaffAd(dbs.staff.db, { id: ad?.id ?? "", staffId: STAFF, now: WEDNESDAY })).toBe(false);
    expect(await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).toEqual({ top: null, side: [], profile: null, home: [] });
    expect(await placeStaffAds(dbs.staff.db, staffAd({ businessName: "Again" }))).toEqual({ kind: "placed", weeks: 1 });
  });

  it("leaves the auction only the spots staff have not taken", async () => {
    await approveAll();
    // Staff hold side spot 1 and the top spot.
    await placeStaffAds(dbs.staff.db, staffAd());
    await placeStaffAds(dbs.staff.db, staffAd({ placement: "top", spot: 1 }));
    expect(await countOpenAuctionSpots(dbs.staff.db, MARKET, [WEEK])).toEqual([
      { weekStart: WEEK, placement: "top", open: 0 },
      { weekStart: WEEK, placement: "side", open: 1 },
      { weekStart: WEEK, placement: "profile", open: 1 },
      { weekStart: WEEK, placement: "home", open: 4 },
    ]);
    expect(await bid(0, "top", 1200)).toEqual({ kind: "refused", reason: "spot-taken" });
    await bid(0, "side", 800);
    await bid(1, "side", 600);

    await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    // One spot was for sale: the best bid takes side spot 2 and pays the next bid + ₹10.
    const [win] = await listWinsForBusiness(dbs.staff.db, id(0), WEEK);
    expect(win).toMatchObject({ placement: "side", spot: 2, pricePaise: 61_000 });
    expect(await listWinsForBusiness(dbs.staff.db, id(1), WEEK)).toEqual([]);

    await pay(id(0), win?.chargeId ?? "", AFTER_CLOSE);
    const live = await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK);
    expect(live.top?.name).toBe("Glow Salon");
    expect(live.side.map((ad) => ad.name)).toEqual(["Glow Salon", "Clinic 0"]);
  });

  it("cannot take a spot an auction win holds, and the database refuses it too", async () => {
    await approveAll();
    await bid(0, "top", 1200);
    await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    expect(await placeStaffAds(dbs.staff.db, staffAd({ placement: "top", spot: 1, now: AFTER_CLOSE }))).toEqual({
      kind: "spot-taken",
      weekStart: WEEK,
      by: "auction",
    });
    const error = await captureErrorText(
      dbs.staff.db.insert(directoryStaffAds).values({
        listingKey: SALON_KEY,
        businessName: "Glow Salon",
        ...MARKET,
        placement: "top",
        spot: 1,
        weekStart: WEEK,
        placedByUserId: STAFF,
      }),
    );
    expect(error).toContain("an auction win already holds this ad spot");
  });

  describe("edited after it is placed", () => {
    const PICTURE_A = { id: "0192f3c4-0000-7000-8000-0000000000a1", storageKey: "staff-ads/0192f3c4-0000-7000-8000-0000000000a1/display", mimeType: "image/webp", bytes: 1200, width: 960, height: 1080, sha256: "a".repeat(64) };
    const PICTURE_B = { id: "0192f3c4-0000-7000-8000-0000000000b2", storageKey: "staff-ads/0192f3c4-0000-7000-8000-0000000000b2/display", mimeType: "image/webp", bytes: 1300, width: 960, height: 1080, sha256: "b".repeat(64) };
    const edit = (ids: readonly string[], overrides: Partial<StaffAdEdit> = {}): StaffAdEdit => ({
      ids,
      businessName: "Glow Salon & Spa",
      tagline: "Now with a spa",
      linkUrl: null,
      agreedPaise: 200_000,
      note: "Paid again",
      picture: { kind: "keep" },
      now: IN_THE_WEEK,
      ...overrides,
    });
    const idsOf = async (): Promise<string[]> => (await listStaffAds(dbs.staff.db, WEEK)).map((ad) => ad.id);

    it("changes what every week of the booking says, and the website shows it", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ weeks: 3 }));
      const outcome = await updateStaffAds(dbs.staff.db, edit(await idsOf()));
      expect(outcome).toEqual({ kind: "updated", updated: 3, droppedStorageKeys: [] });
      const listed = await listStaffAds(dbs.staff.db, WEEK);
      expect(listed.map((ad) => [ad.businessName, ad.tagline, ad.agreedPaise, ad.note])).toEqual(Array(3).fill(["Glow Salon & Spa", "Now with a spa", 200_000, "Paid again"]));
      expect((await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).side[0]).toMatchObject({ name: "Glow Salon & Spa", tagline: "Now with a spa" });
    });

    it("leaves where and when it shows, and the business it leads to, as they were", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ weeks: 2 }));
      await updateStaffAds(dbs.staff.db, edit(await idsOf()));
      expect((await listStaffAds(dbs.staff.db, WEEK)).map((ad) => [ad.listingKey, ad.placement, ad.spot, ad.categorySlug, ad.areaSlug])).toEqual(
        Array(2).fill([SALON_KEY, "side", 1, "dentists", "naupada"]),
      );
    });

    it("changes where a link ad leads, and refuses to give a business's ad a link or a link ad none", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ listingKey: null, linkUrl: "https://example.com/old", businessName: "Camp" }));
      const [linkId] = await idsOf();
      expect(await updateStaffAds(dbs.staff.db, edit([linkId ?? ""], { linkUrl: "https://example.com/new" }))).toMatchObject({ kind: "updated" });
      expect((await listStaffAds(dbs.staff.db, WEEK))[0]?.linkUrl).toBe("https://example.com/new");
      await expect(updateStaffAds(dbs.staff.db, edit([linkId ?? ""], { linkUrl: null }))).rejects.toThrow(RangeError);
      await placeStaffAds(dbs.staff.db, staffAd({ spot: 2 }));
      const business = (await listStaffAds(dbs.staff.db, WEEK)).find((ad) => ad.listingKey !== null);
      await expect(updateStaffAds(dbs.staff.db, edit([business?.id ?? ""], { linkUrl: "https://example.com/x" }))).rejects.toThrow(RangeError);
    });

    it("puts a new picture on every week, and drops the old one's file only when no ad uses it", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ weeks: 2, picture: PICTURE_A }));
      const ids = await idsOf();
      expect(await updateStaffAds(dbs.staff.db, edit(ids, { picture: { kind: "replace", picture: PICTURE_B, staffId: STAFF } }))).toEqual({
        kind: "updated",
        updated: 2,
        droppedStorageKeys: [PICTURE_A.storageKey],
      });
      expect((await listStaffAds(dbs.staff.db, WEEK)).map((ad) => ad.pictureId)).toEqual([PICTURE_B.id, PICTURE_B.id]);
      expect(await findLiveStaffAdPictureFile(dbs.staff.db, PICTURE_A.id)).toBeNull();
      expect(await findLiveStaffAdPictureFile(dbs.staff.db, PICTURE_B.id)).toMatchObject({ storageKey: PICTURE_B.storageKey });
    });

    it("keeps an old picture another booking still uses, and takes a picture away", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ picture: PICTURE_A }));
      const first = await idsOf();
      expect(await updateStaffAds(dbs.staff.db, edit(first, { picture: { kind: "remove" } }))).toEqual({ kind: "updated", updated: 1, droppedStorageKeys: [PICTURE_A.storageKey] });
      expect((await listStaffAds(dbs.staff.db, WEEK))[0]?.pictureId).toBeNull();
      expect(await updateStaffAds(dbs.staff.db, edit(first, { picture: { kind: "replace", picture: PICTURE_B, staffId: STAFF } }))).toMatchObject({ droppedStorageKeys: [] });
    });

    it("finds nothing to edit once the booking is taken down, and refuses weeks of different bookings", async () => {
      await placeStaffAds(dbs.staff.db, staffAd());
      await placeStaffAds(dbs.staff.db, staffAd({ spot: 2, businessName: "Other" }));
      const [one, two] = await idsOf();
      expect(await updateStaffAds(dbs.staff.db, edit([one ?? "", two ?? ""]))).toEqual({ kind: "mixed" });
      await removeStaffAds(dbs.staff.db, { ids: [one ?? ""], staffId: STAFF, now: IN_THE_WEEK });
      expect(await updateStaffAds(dbs.staff.db, edit([one ?? ""]))).toEqual({ kind: "not-found" });
      expect((await findStaffAdsByIds(dbs.staff.db, [one ?? "", two ?? ""])).map((ad) => ad.id)).toEqual([two]);
    });
  });

  describe("for all categories or all areas", () => {
    const ALL_CATEGORIES: DirectoryAdMarket = { categorySlug: "all", citySlug: "thane", areaSlug: "naupada" };
    const ALL_AREAS: DirectoryAdMarket = { categorySlug: "dentists", citySlug: "thane", areaSlug: "all" };
    const EVERYWHERE: DirectoryAdMarket = { categorySlug: "all", citySlug: "thane", areaSlug: "all" };
    const SALONS_NAUPADA: DirectoryAdMarket = { categorySlug: "salons", citySlug: "thane", areaSlug: "naupada" };
    const DENTISTS_VARTAK: DirectoryAdMarket = { categorySlug: "dentists", citySlug: "thane", areaSlug: "vartak-nagar" };
    const names = async (market: DirectoryAdMarket): Promise<(string | undefined)[]> =>
      (await readLiveDirectoryAds(dbs.staff.db, market, IN_THE_WEEK)).side.map((ad) => ad.name);

    it("shows an ad for all categories in every category of its area, and nowhere else", async () => {
      expect(await placeStaffAds(dbs.staff.db, staffAd({ market: ALL_CATEGORIES }))).toEqual({ kind: "placed", weeks: 1 });
      expect(await names(MARKET)).toEqual(["Glow Salon"]);
      expect(await names(SALONS_NAUPADA)).toEqual(["Glow Salon"]);
      expect(await names(DENTISTS_VARTAK)).toEqual([]);
    });

    it("shows an ad for all areas in every area of its category, and nowhere else", async () => {
      expect(await placeStaffAds(dbs.staff.db, staffAd({ market: ALL_AREAS }))).toEqual({ kind: "placed", weeks: 1 });
      expect(await names(MARKET)).toEqual(["Glow Salon"]);
      expect(await names(DENTISTS_VARTAK)).toEqual(["Glow Salon"]);
      expect(await names(SALONS_NAUPADA)).toEqual([]);
    });

    it("shows an ad for all of a city in every list and business page there, but never on its home page, nor a home ad in them", async () => {
      expect(await placeStaffAds(dbs.staff.db, staffAd({ market: EVERYWHERE }))).toEqual({ kind: "placed", weeks: 1 });
      await placeStaffAds(dbs.staff.db, staffAd({ market: MARKET, placement: "home", spot: 1, businessName: "Home Ad" }));
      expect(await names(MARKET)).toEqual(["Glow Salon"]);
      expect(await names(SALONS_NAUPADA)).toEqual(["Glow Salon"]);
      expect(await names(DENTISTS_VARTAK)).toEqual(["Glow Salon"]);
      const home = await readLiveDirectoryAds(dbs.staff.db, homeMarket("thane"), IN_THE_WEEK);
      expect([home.side.length, home.home.map((ad) => ad.name)]).toEqual([0, ["Home Ad"]]);
      expect((await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).home).toEqual([]);
    });

    it("holds its spot in every market it covers: a specific ad or another wildcard cannot take it, another spot or a market it does not cover can", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ market: ALL_AREAS }));
      expect(await placeStaffAds(dbs.staff.db, staffAd({ market: DENTISTS_VARTAK, businessName: "Other" }))).toMatchObject({ kind: "spot-taken", by: "staff" });
      expect(await placeStaffAds(dbs.staff.db, staffAd({ market: ALL_CATEGORIES, businessName: "Other" }))).toMatchObject({ kind: "spot-taken", by: "staff" });
      expect(await placeStaffAds(dbs.staff.db, staffAd({ market: DENTISTS_VARTAK, spot: 2, businessName: "Second" }))).toEqual({ kind: "placed", weeks: 1 });
      expect(await placeStaffAds(dbs.staff.db, staffAd({ market: SALONS_NAUPADA, businessName: "Salon ad" }))).toEqual({ kind: "placed", weeks: 1 });
    });

    it("cannot be placed over a spot already held in a market it covers, and writes nothing", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ market: DENTISTS_VARTAK, businessName: "Held" }));
      expect(await placeStaffAds(dbs.staff.db, staffAd({ market: EVERYWHERE, businessName: "Wide" }))).toMatchObject({ kind: "spot-taken", by: "staff" });
      expect(await listStaffAds(dbs.staff.db, WEEK)).toHaveLength(1);
    });

    it("takes a spot from the auction in every market it covers", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ market: ALL_CATEGORIES }));
      expect(await countOpenAuctionSpots(dbs.staff.db, MARKET, [WEEK])).toContainEqual({ weekStart: WEEK, placement: "side", open: 1 });
      expect(await countOpenAuctionSpots(dbs.staff.db, SALONS_NAUPADA, [WEEK])).toContainEqual({ weekStart: WEEK, placement: "side", open: 1 });
      expect(await countOpenAuctionSpots(dbs.staff.db, DENTISTS_VARTAK, [WEEK])).toContainEqual({ weekStart: WEEK, placement: "side", open: 2 });
      expect(await listStaffHeldSpots(dbs.staff.db, SALONS_NAUPADA, WEEK)).toEqual([{ placement: "side", spot: 1, weekStart: WEEK }]);
    });

    it("is refused by the database too, beside another ad or an auction win over the same spot", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ market: DENTISTS_VARTAK }));
      const message = await captureErrorText(
        dbs.staff.db.insert(directoryStaffAds).values({ listingKey: SALON_KEY, businessName: "x", ...ALL_AREAS, placement: "side", spot: 1, weekStart: WEEK, placedByUserId: STAFF }),
      );
      expect(message).toMatch(/already holds this ad spot/);
    });

    it("needs a city, which is never all", async () => {
      await expect(placeStaffAds(dbs.staff.db, staffAd({ market: { categorySlug: "dentists", citySlug: "all", areaSlug: "all" } }))).rejects.toThrow(RangeError);
    });
  });

  describe("a link ad", () => {
    const linkAd = (overrides: Partial<NewStaffAds> = {}): NewStaffAds =>
      staffAd({ listingKey: null, linkUrl: "https://example.com/camp", businessName: "Free check-up camp", tagline: "Every Sunday", ...overrides });

    it("leads to the address staff chose, with no business behind it, and is read like any other ad", async () => {
      expect(await placeStaffAds(dbs.staff.db, linkAd({ weeks: 2 }))).toEqual({ kind: "placed", weeks: 2 });
      expect((await listStaffAds(dbs.staff.db, WEEK)).map((ad) => [ad.listingKey, ad.linkUrl, ad.businessName])).toEqual([
        [null, "https://example.com/camp", "Free check-up camp"],
        [null, "https://example.com/camp", "Free check-up camp"],
      ]);
      expect((await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK)).side).toEqual([
        { spot: 1, key: linkAdKey(MARKET), linkUrl: "https://example.com/camp", picture: null, placeId: null, name: "Free check-up camp", tagline: "Every Sunday" },
      ]);
    });

    it("says which tile it holds, so a tile nobody holds is a gap the website keeps free", async () => {
      await placeStaffAds(dbs.staff.db, linkAd({ placement: "home", spot: 3 }));
      await placeStaffAds(dbs.staff.db, linkAd({ placement: "home", spot: 1, linkUrl: "https://example.com/other" }));
      const live = await readLiveDirectoryAds(dbs.staff.db, homeMarket("thane"), IN_THE_WEEK);
      expect(live.home.map((ad) => ad.spot)).toEqual([1, 3]);
    });

    it("can be a home page tile, under the city's home market", async () => {
      await placeStaffAds(dbs.staff.db, linkAd({ placement: "home", spot: 2 }));
      const live = await readLiveDirectoryAds(dbs.staff.db, homeMarket("thane"), IN_THE_WEEK);
      expect(live.home).toEqual([{ spot: 2, key: "all/thane/all/link-ad", linkUrl: "https://example.com/camp", picture: null, placeId: null, name: "Free check-up camp", tagline: "Every Sunday" }]);
    });

    it("holds its spot against another staff ad and against the auction, like any staff ad", async () => {
      await placeStaffAds(dbs.staff.db, linkAd());
      expect(await placeStaffAds(dbs.staff.db, staffAd())).toEqual({ kind: "spot-taken", weekStart: WEEK, by: "staff" });
      await approveAll();
      expect(await countOpenAuctionSpots(dbs.staff.db, MARKET, [WEEK])).toContainEqual({ weekStart: WEEK, placement: "side", open: 1 });
    });

    it("leads to a business's page or to a link, never both and never neither", async () => {
      await expect(placeStaffAds(dbs.staff.db, linkAd({ listingKey: SALON_KEY }))).rejects.toThrow(RangeError);
      await expect(placeStaffAds(dbs.staff.db, linkAd({ linkUrl: null }))).rejects.toThrow(RangeError);
      expect(await listStaffAds(dbs.staff.db, WEEK)).toEqual([]);
    });

    it("is refused by the database for an address that is not a web address", async () => {
      for (const linkUrl of ["javascript:alert(1)", "https://exa mple.com", "ftp://example.com/file", "https://x.c"]) {
        const error = await captureErrorText(
          dbs.staff.db.insert(directoryStaffAds).values({ linkUrl, businessName: "x", ...MARKET, placement: "side", spot: 1, weekStart: WEEK, placedByUserId: STAFF }),
        );
        expect(error, linkUrl).toContain("directory_staff_ads_link_url_check");
      }
      const both = await captureErrorText(
        dbs.staff.db.insert(directoryStaffAds).values({
          listingKey: SALON_KEY,
          linkUrl: "https://example.com/x",
          businessName: "x",
          ...MARKET,
          placement: "side",
          spot: 1,
          weekStart: WEEK,
          placedByUserId: STAFF,
        }),
      );
      expect(both).toContain("directory_staff_ads_target_check");
    });
  });

  it("takes a whole run down at once, so every week's spot is free again straight away", async () => {
    await placeStaffAds(dbs.staff.db, staffAd({ weeks: 4 }));
    const run = await listStaffAds(dbs.staff.db, WEEK);
    expect(run).toHaveLength(4);
    expect(await removeStaffAds(dbs.staff.db, { ids: run.map((ad) => ad.id), staffId: STAFF, now: WEDNESDAY })).toEqual({ removed: 4, droppedStorageKeys: [] });
    expect(await removeStaffAds(dbs.staff.db, { ids: run.map((ad) => ad.id), staffId: STAFF, now: WEDNESDAY })).toEqual({ removed: 0, droppedStorageKeys: [] });
    expect(await removeStaffAds(dbs.staff.db, { ids: [], staffId: STAFF, now: WEDNESDAY })).toEqual({ removed: 0, droppedStorageKeys: [] });
    expect(await listStaffAds(dbs.staff.db, WEEK)).toEqual([]);
    expect(await placeStaffAds(dbs.staff.db, staffAd({ weeks: 4, businessName: "Again" }))).toEqual({ kind: "placed", weeks: 4 });
  });

  describe("a picture staff uploaded", () => {
    const PICTURE = "0192f3c4-0000-7000-8000-0000000000a1";
    const OTHER = "0192f3c4-0000-7000-8000-0000000000a2";
    const pictureOf = (id: string): NewStaffAdPicture => ({
      id,
      storageKey: `staff-ads/${id}/display`,
      mimeType: "image/webp",
      bytes: 51_200,
      width: 960,
      height: 600,
      sha256: "a".repeat(64),
    });

    it("is shared by every week of the booking and read with the ad, in the shape of its spot", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ weeks: 2, spot: 2, picture: pictureOf(PICTURE) }));
      await placeStaffAds(dbs.staff.db, staffAd({ spot: 1, picture: pictureOf(OTHER), businessName: "Other" }));
      expect((await listStaffAds(dbs.staff.db, WEEK)).map((ad) => ad.pictureId)).toEqual([OTHER, PICTURE, PICTURE]);
      const live = await readLiveDirectoryAds(dbs.staff.db, MARKET, IN_THE_WEEK);
      expect(live.side.map((ad) => [ad.name, ad.picture])).toEqual([
        ["Other", { id: OTHER, shape: "tall" }],
        ["Glow Salon", { id: PICTURE, shape: "wide" }],
      ]);
      expect(adPictureShape("home", 1)).toBe("tall");
      expect(adPictureShape("home", 3)).toBe("wide");
      expect(adPictureShape("profile", 1)).toBe("wide");
      expect(adPictureShape("side", 2)).toBe("wide");
    });

    it("is not recorded when the ad is not placed", async () => {
      await placeStaffAds(dbs.staff.db, staffAd());
      expect(await placeStaffAds(dbs.staff.db, staffAd({ picture: pictureOf(PICTURE) }))).toMatchObject({ kind: "spot-taken" });
      expect(await findStaffAdPictureFileForStaff(dbs.staff.db, PICTURE)).toBeNull();
    });

    it("is served to the website only while an ad that uses it is up", async () => {
      await placeStaffAds(dbs.staff.db, staffAd({ weeks: 2, picture: pictureOf(PICTURE) }));
      expect(await findLiveStaffAdPictureFile(dbs.staff.db, PICTURE)).toEqual({ storageKey: `staff-ads/${PICTURE}/display`, mimeType: "image/webp", sha256: "a".repeat(64) });
      expect(await findLiveStaffAdPictureFile(dbs.staff.db, "not-a-uuid")).toBeNull();
      const [first, second] = await listStaffAds(dbs.staff.db, WEEK);
      // One week down, one still up: the picture stays, and no file is dropped.
      expect(await removeStaffAds(dbs.staff.db, { ids: [first?.id ?? ""], staffId: STAFF, now: WEDNESDAY })).toEqual({ removed: 1, droppedStorageKeys: [] });
      expect(await findLiveStaffAdPictureFile(dbs.staff.db, PICTURE)).not.toBeNull();
      // The last week down: the picture is removed and its file's key handed back, once.
      expect(await removeStaffAds(dbs.staff.db, { ids: [second?.id ?? ""], staffId: STAFF, now: WEDNESDAY })).toEqual({ removed: 1, droppedStorageKeys: [`staff-ads/${PICTURE}/display`] });
      expect(await findLiveStaffAdPictureFile(dbs.staff.db, PICTURE)).toBeNull();
      expect(await findStaffAdPictureFileForStaff(dbs.staff.db, PICTURE)).toBeNull();
    });

    it("refuses a storage key that is not built from its id", async () => {
      const error = await captureErrorText(
        dbs.staff.db.insert(directoryStaffAdPictures).values({ ...pictureOf(PICTURE), storageKey: "staff-ads/elsewhere/display", uploadedByUserId: STAFF }),
      );
      expect(error).toContain("directory_staff_ad_pictures_storage_key_check");
    });

    it("may be read, added and marked removed by both staff role names, and deleted by neither", async () => {
      // 0155 granted only the legacy webfold_staff; the staff connection logs in as firstfold_staff (0132, 0157).
      for (const role of ["firstfold_staff", "webfold_staff"] as const) {
        for (const [privilege, expected] of [["SELECT", true], ["INSERT", true], ["UPDATE", true], ["DELETE", false]] as const) {
          const result = await dbs.owner.db.execute<{ allowed: boolean }>(
            sql`select has_table_privilege(${role}, 'public.directory_staff_ad_pictures', ${privilege}) as allowed`,
          );
          expect(result.rows[0]?.allowed, `${role} ${privilege}`).toBe(expected);
        }
      }
      const policies = await dbs.owner.db.execute<{ role: string }>(sql`
        select unnest(roles)::text as role from pg_policies
        where schemaname = 'public' and tablename = 'directory_staff_ad_pictures'
        order by 1
      `);
      expect(policies.rows.map((row) => row.role)).toEqual(["firstfold_staff", "webfold_staff"]);
    });
  });

  it("lists the weeks staff hold in a market and on its city's home page, for 'booked until'", async () => {
    await placeStaffAds(dbs.staff.db, staffAd({ weeks: 3 }));
    await placeStaffAds(dbs.staff.db, staffAd({ placement: "home", spot: 4, weeks: 2 }));
    // A different market's ad is no one else's business.
    await placeStaffAds(dbs.staff.db, staffAd({ market: { ...MARKET, areaSlug: "vartak-nagar" }, spot: 2 }));
    expect(await listStaffHeldSpots(dbs.staff.db, MARKET, WEEK)).toEqual([
      { placement: "side", spot: 1, weekStart: "2026-10-05" },
      { placement: "home", spot: 4, weekStart: "2026-10-05" },
      { placement: "side", spot: 1, weekStart: "2026-10-12" },
      { placement: "home", spot: 4, weekStart: "2026-10-12" },
      { placement: "side", spot: 1, weekStart: "2026-10-19" },
    ]);
    expect(await listStaffHeldSpots(dbs.staff.db, MARKET, "2026-10-19")).toEqual([{ placement: "side", spot: 1, weekStart: "2026-10-19" }]);
  });

  it("is closed to the customer role", async () => {
    const error = await captureErrorText(asBusiness(0, (tx) => tx.select().from(directoryStaffAds)));
    expect(error).toMatch(/permission denied/);
  });
});
