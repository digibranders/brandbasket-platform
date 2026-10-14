import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addBusinessListing,
  createListingAccountBusiness,
  createUnlistedAccountBusiness,
  decideDirectoryClaim,
  findClaimForBusiness,
  listConfirmedAddedBusinesses,
  publishAddedBusiness,
} from "./queries/directory-ads";
import {
  findDirectoryProfile,
  saveBusinessDetails,
  setContactOptions,
  setPageTabs,
  turnOnPageTab,
  setFeaturedVideo,
  setTrustInformation,
  type BusinessDetails,
} from "./queries/directory-business-profiles";
import { upsertPincodes } from "./queries/india-pincodes";
import { listDirectoryPictures, newDirectoryPictureId, recordDirectoryPicture } from "./queries/directory-pictures";
import { businesses, directoryPlaces, directoryVerifications, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-profile";
const STAFF = "staff-1";
const NOW = new Date("2026-10-01T06:00:00.000Z");
const LATER = new Date("2026-10-01T07:00:00.000Z");

const DETAILS: BusinessDetails = {
  businessName: "Gentle Dental",
  slug: "gentle-dental",
  streetAddress: "12 Gokhale Road, near Thane station",
  phone: "+919820077001",
  whatsapp: "+919820077002",
  mapsUrl: "https://www.google.com/maps/place/Gentle+Dental/@19.1943,72.9706,17z",
  pin: { latitude: 19.1943, longitude: 72.9706 },
  websiteUrl: "https://gentledental.in",
  about: "Family dentist since 2004.",
  establishedYear: 2004,
  serviceArea: "Thane, Mumbra and Kalwa",
  email: "hello@gentledental.in",
  gstNumber: null,
  directionsNote: "Opposite the post office, first floor",
  instagramUrl: "https://instagram.com/gentledental",
  facebookUrl: null,
  linkedinUrl: null,
  holidayHours: "Closed on Diwali",
  open24x7: false,
};

const PICKS = { stateCode: "mh", categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada", postal: null } as const;

let dbs: TestDatabases;

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
    { id: OWNER, name: "Owner", email: "owner@example.com", emailVerified: true },
  ]);
});

async function newAccount(userId = OWNER): Promise<string> {
  return (await createUnlistedAccountBusiness(dbs.staff.db, { userId, businessName: "Owner" })).businessId;
}

async function addListing(businessId: string): Promise<void> {
  const outcome = await addBusinessListing(
    dbs.staff.db,
    { businessId, ...PICKS, slug: DETAILS.slug, businessName: DETAILS.businessName, streetAddress: DETAILS.streetAddress, phone: DETAILS.phone },
    NOW,
  );
  if (outcome.kind !== "added") throw new Error(`Adding the listing was refused: ${outcome.reason}`);
}

async function businessName(businessId: string): Promise<string | undefined> {
  const rows = await dbs.staff.db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId));
  return rows[0]?.name;
}

describe("saveBusinessDetails", () => {
  it("keeps an optional GST number for the owner, and the database refuses one that is not a GSTIN", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: { ...DETAILS, gstNumber: "27AAPFU0939F1ZV" }, now: NOW });
    const kept = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(kept?.gstNumber).toBe("27AAPFU0939F1ZV");

    await saveBusinessDetails(dbs.staff.db, { businessId, details: { ...DETAILS, gstNumber: null }, now: LATER });
    const cleared = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(cleared?.gstNumber).toBeNull();

    await expect(saveBusinessDetails(dbs.staff.db, { businessId, details: { ...DETAILS, gstNumber: "not-a-gstin" }, now: LATER })).rejects.toThrow();
  });

  it("writes the profile and the business's name before there is a listing, readable by the owner alone", async () => {
    const businessId = await newAccount();
    expect(await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW })).toEqual({ kind: "saved" });

    const own = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(own).toMatchObject({
      streetAddress: DETAILS.streetAddress,
      phone: DETAILS.phone,
      whatsapp: DETAILS.whatsapp,
      pin: DETAILS.pin,
      websiteUrl: DETAILS.websiteUrl,
      about: DETAILS.about,
      youtubeVideoId: null,
      establishedYear: 2004,
      serviceArea: "Thane, Mumbra and Kalwa",
      email: "hello@gentledental.in",
      gstNumber: null,
      directionsNote: "Opposite the post office, first floor",
      instagramUrl: "https://instagram.com/gentledental",
      holidayHours: "Closed on Diwali",
      open24x7: false,
      // A new profile offers the buttons that need nothing set up, and has no payment methods or licences yet.
      contactOptions: ["call", "whatsapp", "directions", "website"],
      // ...and no optional tab on its public page until the owner turns one on.
      pageTabs: [],
      paymentMethods: [],
      licences: [],
    });
    expect(await businessName(businessId)).toBe("Gentle Dental");

    await dbs.staff.db.insert(users).values({ id: "someone-else", name: "Else", email: "else@example.com" });
    const otherBusiness = await newAccount("someone-else");
    const peek = await withTenantScope(dbs.app.db, { userId: "someone-else", businessId: otherBusiness }, (tx) =>
      findDirectoryProfile(tx, businessId),
    );
    expect(peek).toBeNull();
  });

  it("saves again over the same row, clearing what was emptied", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    await saveBusinessDetails(dbs.staff.db, {
      businessId,
      details: { ...DETAILS, whatsapp: null, mapsUrl: null, pin: null, websiteUrl: null, about: null },
      now: LATER,
    });
    expect(await findDirectoryProfile(dbs.staff.db, businessId)).toMatchObject({ whatsapp: null, mapsUrl: null, pin: null, about: null });
  });

  it("changes a listing not published yet as its add form would, keeping its Business ID", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    await addListing(businessId);
    const before = await findClaimForBusiness(dbs.staff.db, businessId);

    await saveBusinessDetails(dbs.staff.db, {
      businessId,
      details: { ...DETAILS, businessName: "Gentle Smiles", slug: "gentle-smiles", phone: "+919820077009", websiteUrl: null },
      now: LATER,
    });
    const after = await findClaimForBusiness(dbs.staff.db, businessId);
    expect(after).toMatchObject({
      businessName: "Gentle Smiles",
      listingKey: "dentists/thane/naupada/gentle-smiles",
      phone: "+919820077009",
      websiteUrl: null,
      placeId: before?.placeId,
    });
    expect(after?.placeId).toMatch(/^[2-9]/);
  });

  it("keeps a business outside the opened districts in its own state, with its PIN, when its details change", async () => {
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
      ],
      NOW,
    );
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    const outcome = await addBusinessListing(
      dbs.staff.db,
      {
        businessId,
        stateCode: "wb",
        categorySlug: "dentists",
        citySlug: "wb-north-24-parganas",
        areaSlug: "salt-lake-sector-v",
        slug: DETAILS.slug,
        businessName: DETAILS.businessName,
        streetAddress: "AB-12, Sector V",
        phone: DETAILS.phone,
        postal: { pincode: "700091", localityName: "Salt Lake Sector V" },
      },
      NOW,
    );
    if (outcome.kind !== "added") throw new Error(`Adding the listing was refused: ${outcome.reason}`);

    await saveBusinessDetails(dbs.staff.db, {
      businessId,
      details: { ...DETAILS, businessName: "Gentle Smiles", slug: "gentle-smiles" },
      now: LATER,
    });
    const after = await findClaimForBusiness(dbs.staff.db, businessId);
    expect(after).toMatchObject({
      listingKey: "dentists/wb-north-24-parganas/salt-lake-sector-v/gentle-smiles",
      pincode: "700091",
      localityName: "Salt Lake Sector V",
    });
    const place = await dbs.staff.db
      .select({ stateCode: directoryPlaces.stateCode, urlSlug: directoryPlaces.urlSlug })
      .from(directoryPlaces)
      .where(eq(directoryPlaces.id, after?.placeId ?? ""));
    expect(place).toEqual([{ stateCode: "wb", urlSlug: "gentle-smiles" }]);
  });

  it("changes a published business's name, address and number but not its address on the web", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    await addListing(businessId);
    await publishAddedBusiness(dbs.staff.db, { businessId, userId: OWNER, now: NOW });

    await saveBusinessDetails(dbs.staff.db, {
      businessId,
      details: { ...DETAILS, businessName: "Gentle Smiles", slug: "gentle-smiles", streetAddress: "14 Gokhale Road" },
      now: LATER,
    });
    expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({
      businessName: "Gentle Smiles",
      streetAddress: "14 Gokhale Road",
      listingKey: "dentists/thane/naupada/gentle-dental",
      status: "approved",
    });
  });

  it("keeps a claimed listing's directory name and number, and takes its website", async () => {
    const created = await createListingAccountBusiness(dbs.staff.db, {
      userId: OWNER,
      listingKey: "dentists/thane/naupada/smile-dental",
      businessName: "Smile Dental",
      phone: "+919820000000",
    });
    await saveBusinessDetails(dbs.staff.db, { businessId: created.businessId, details: DETAILS, now: NOW });
    expect(await findClaimForBusiness(dbs.staff.db, created.businessId)).toMatchObject({
      businessName: "Smile Dental",
      phone: "+919820000000",
      streetAddress: null,
      websiteUrl: DETAILS.websiteUrl,
    });
  });

  it("saves a claimed listing's profile without its name, address or number, which stay the directory's", async () => {
    const created = await createListingAccountBusiness(dbs.staff.db, {
      userId: OWNER,
      listingKey: "dentists/thane/naupada/smile-dental",
      businessName: "Smile Dental",
      phone: "+919820000000",
    });
    const blank = { ...DETAILS, businessName: "", slug: "", streetAddress: "", phone: "", mapsUrl: null, pin: null };
    expect(await saveBusinessDetails(dbs.staff.db, { businessId: created.businessId, details: blank, now: NOW })).toEqual({ kind: "saved" });

    expect(await findDirectoryProfile(dbs.staff.db, created.businessId)).toMatchObject({
      streetAddress: "",
      phone: "+919820000000",
      about: DETAILS.about,
      establishedYear: DETAILS.establishedYear,
      instagramUrl: DETAILS.instagramUrl,
    });
    const [row] = await dbs.staff.db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, created.businessId));
    expect(row?.name).toBe("Smile Dental");
    expect(await findClaimForBusiness(dbs.staff.db, created.businessId)).toMatchObject({ businessName: "Smile Dental", phone: "+919820000000" });

    // Typing them anyway changes nothing either: the directory's are the ones that show.
    await saveBusinessDetails(dbs.staff.db, { businessId: created.businessId, details: { ...DETAILS, businessName: "Hijacked", phone: "+919811111111" }, now: LATER });
    expect(await findDirectoryProfile(dbs.staff.db, created.businessId)).toMatchObject({ phone: "+919820000000" });
    const [after] = await dbs.staff.db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, created.businessId));
    expect(after?.name).toBe("Smile Dental");
  });

  it("refuses a business staff took down", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    await addListing(businessId);
    const claim = await findClaimForBusiness(dbs.staff.db, businessId);
    await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: false, staffId: STAFF, now: NOW });
    expect(await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: LATER })).toEqual({
      kind: "refused",
      reason: "taken-down",
    });

  });

  it("lets a website client that brought its claim save its Business profile", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    await addListing(businessId);

    await dbs.staff.db.update(businesses).set({ kind: "website" }).where(eq(businesses.id, businessId));
    expect(await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: LATER })).toEqual({ kind: "saved" });
  });

  it("refuses a website client that has no claim", async () => {
    const businessId = await newAccount();
    await dbs.staff.db.update(businesses).set({ kind: "website" }).where(eq(businesses.id, businessId));
    expect(await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: LATER })).toEqual({
      kind: "refused",
      reason: "not-listing-account",
    });
  });
});

describe("setFeaturedVideo", () => {
  it("needs the profile its Details made, and sets and clears the video", async () => {
    const businessId = await newAccount();
    expect(await setFeaturedVideo(dbs.staff.db, { businessId, videoId: "dQw4w9WgXcQ", now: NOW })).toBe(false);
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    expect(await setFeaturedVideo(dbs.staff.db, { businessId, videoId: "dQw4w9WgXcQ", now: NOW })).toBe(true);
    expect((await findDirectoryProfile(dbs.staff.db, businessId))?.youtubeVideoId).toBe("dQw4w9WgXcQ");
    expect(await setFeaturedVideo(dbs.staff.db, { businessId, videoId: null, now: LATER })).toBe(true);
    expect((await findDirectoryProfile(dbs.staff.db, businessId))?.youtubeVideoId).toBeNull();
  });
});

describe("publishAddedBusiness", () => {
  it("puts the business live as the owner's own approval, locks its URL and adds it to the feed", async () => {
    const businessId = await newAccount();
    await addListing(businessId);
    const outcome = await publishAddedBusiness(dbs.staff.db, { businessId, userId: OWNER, now: NOW });
    expect(outcome).toMatchObject({ kind: "published", listingKey: "dentists/thane/naupada/gentle-dental" });

    const claim = await findClaimForBusiness(dbs.staff.db, businessId);
    expect(claim).toMatchObject({ status: "approved", publishedAt: NOW, decidedAt: NOW });
    const place = await dbs.staff.db.select().from(directoryPlaces).where(eq(directoryPlaces.id, claim?.placeId ?? ""));
    expect(place[0]?.urlLockedAt).toEqual(NOW);
    expect((await listConfirmedAddedBusinesses(dbs.staff.db)).map((row) => row.listingKey)).toEqual(["dentists/thane/naupada/gentle-dental"]);
    // Published by its owner only: Claimed, not Verified.
    expect((await listConfirmedAddedBusinesses(dbs.staff.db)).map((row) => row.verified)).toEqual([false]);
  });

  it("sends the pin from its owner's Google Maps link to the directory, and none without one", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    await addListing(businessId);
    await publishAddedBusiness(dbs.staff.db, { businessId, userId: OWNER, now: NOW });
    expect((await listConfirmedAddedBusinesses(dbs.staff.db)).map((row) => row.pin)).toEqual([{ lat: 19.1943, lon: 72.9706 }]);

    await saveBusinessDetails(dbs.staff.db, { businessId, details: { ...DETAILS, mapsUrl: null, pin: null }, now: LATER });
    expect((await listConfirmedAddedBusinesses(dbs.staff.db)).map((row) => row.pin)).toEqual([null]);
  });

  it("is not made verified by other businesses' verifications, only by its own", async () => {
    // Someone else's verification is on the table: a published business must not read as verified because of it.
    await dbs.staff.db.insert(directoryVerifications).values({
      listingKey: "dentists/thane/naupada/someone-else",
      placeId: null,
      businessName: "Someone Else",
      phone: null,
      verifiedAt: NOW,
      verifiedByUserId: STAFF,
    });
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    await addListing(businessId);
    await publishAddedBusiness(dbs.staff.db, { businessId, userId: OWNER, now: NOW });
    expect((await listConfirmedAddedBusinesses(dbs.staff.db)).map((row) => row.verified)).toEqual([false]);

    const claim = await findClaimForBusiness(dbs.staff.db, businessId);
    await dbs.staff.db.insert(directoryVerifications).values({
      listingKey: claim?.listingKey ?? "",
      placeId: claim?.placeId ?? null,
      businessName: DETAILS.businessName,
      phone: DETAILS.phone,
      verifiedAt: LATER,
      verifiedByUserId: STAFF,
    });
    expect((await listConfirmedAddedBusinesses(dbs.staff.db)).map((row) => row.verified)).toEqual([true]);
  });

  it("marks a business verified once staff approve it on a call", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    await addListing(businessId);
    const claim = await findClaimForBusiness(dbs.staff.db, businessId);
    await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: true, staffId: STAFF, now: NOW });
    expect((await listConfirmedAddedBusinesses(dbs.staff.db)).map((row) => row.verified)).toEqual([true]);
  });

  it("refuses with no listing, twice, after a take-down, and for a claimed listing", async () => {
    const businessId = await newAccount();
    expect(await publishAddedBusiness(dbs.staff.db, { businessId, userId: OWNER, now: NOW })).toEqual({ kind: "refused", reason: "no-claim" });
    await addListing(businessId);
    await publishAddedBusiness(dbs.staff.db, { businessId, userId: OWNER, now: NOW });
    expect(await publishAddedBusiness(dbs.staff.db, { businessId, userId: OWNER, now: LATER })).toEqual({
      kind: "refused",
      reason: "already-published",
    });
    const claim = await findClaimForBusiness(dbs.staff.db, businessId);
    await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: false, staffId: STAFF, now: LATER });
    expect(await publishAddedBusiness(dbs.staff.db, { businessId, userId: OWNER, now: LATER })).toEqual({ kind: "refused", reason: "taken-down" });

    await dbs.staff.db.insert(users).values({ id: "claimer", name: "Claimer", email: "claimer@example.com", emailVerified: true });
    const claimed = await createListingAccountBusiness(dbs.staff.db, {
      userId: "claimer",
      listingKey: "dentists/thane/naupada/smile-dental",
      businessName: "Smile Dental",
      phone: "+919820000000",
    });
    expect(await publishAddedBusiness(dbs.staff.db, { businessId: claimed.businessId, userId: "claimer", now: NOW })).toEqual({
      kind: "refused",
      reason: "not-added",
    });
  });

  it("refuses an owner who has confirmed neither email nor phone, and anyone who is not the owner", async () => {
    await dbs.staff.db.update(users).set({ emailVerified: false }).where(eq(users.id, OWNER));
    const businessId = await newAccount();
    await addListing(businessId);
    expect(await publishAddedBusiness(dbs.staff.db, { businessId, userId: OWNER, now: NOW })).toEqual({
      kind: "refused",
      reason: "owner-unconfirmed",
    });
    expect(await publishAddedBusiness(dbs.staff.db, { businessId, userId: STAFF, now: NOW })).toEqual({
      kind: "refused",
      reason: "owner-unconfirmed",
    });
    expect((await findClaimForBusiness(dbs.staff.db, businessId))?.status).toBe("pending");
  });
});

describe("featured photo", () => {
  function picture(businessId: string, goesLive: boolean): Parameters<typeof recordDirectoryPicture>[1] {
    const id = newDirectoryPictureId();
    return {
      id,
      businessId,
      slot: "listing",
      storageKey: `t/${businessId}/${id}/display`,
      mimeType: "image/webp",
      bytes: 1000,
      width: 640,
      height: 640,
      sha256: "a".repeat(64),
      uploadedByUserId: OWNER,
      now: NOW,
      goesLive,
    };
  }

  it("is allowed before the business has a listing, goes live at once and replaces the live one", async () => {
    const businessId = await newAccount();
    const first = await recordDirectoryPicture(dbs.staff.db, picture(businessId, true));
    expect(first).toMatchObject({ kind: "recorded", picture: { status: "approved" }, replacedStorageKeys: [] });

    const second = await recordDirectoryPicture(dbs.staff.db, picture(businessId, true));
    if (first.kind !== "recorded" || second.kind !== "recorded") throw new Error("Expected both pictures recorded");
    expect(second.replacedStorageKeys).toEqual([`t/${businessId}/${first.picture.id}/display`]);
    const left = await listDirectoryPictures(dbs.staff.db, businessId);
    expect(left.map((row) => [row.id, row.status])).toEqual([[second.picture.id, "approved"]]);
  });

  it("still waits for staff without goesLive, and is refused once the business is taken down", async () => {
    const businessId = await newAccount();
    expect(await recordDirectoryPicture(dbs.staff.db, picture(businessId, false))).toMatchObject({ picture: { status: "pending" } });
    await addListing(businessId);
    const claim = await findClaimForBusiness(dbs.staff.db, businessId);
    await decideDirectoryClaim(dbs.staff.db, { claimId: claim?.id ?? "", approve: false, staffId: STAFF, now: NOW });
    expect(await recordDirectoryPicture(dbs.staff.db, picture(businessId, true))).toEqual({ kind: "no-claim" });
  });
});

describe("contact options and trust information", () => {
  it("saves the buttons, payment methods and licences on the profile, and says so when there is no profile yet", async () => {
    const businessId = await newAccount();
    expect(await setContactOptions(dbs.staff.db, { businessId, options: ["call"], now: NOW })).toBe(false);
    expect(await setTrustInformation(dbs.staff.db, { businessId, paymentMethods: ["upi"], licences: ["MCI 12345"], now: NOW })).toBe(false);

    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    expect(await setContactOptions(dbs.staff.db, { businessId, options: ["call", "quote"], now: LATER })).toBe(true);
    expect(await setTrustInformation(dbs.staff.db, { businessId, paymentMethods: ["cash", "upi"], licences: ["MCI 12345", "ISO 9001"], now: LATER })).toBe(true);

    const own = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(own).toMatchObject({
      contactOptions: ["call", "quote"],
      paymentMethods: ["cash", "upi"],
      licences: ["MCI 12345", "ISO 9001"],
    });
  });

  it("is kept by the database: an unknown button, an unknown payment method and too many licences are refused", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    // The platform checks first; these are the database's own checks behind it.
    await expect(setContactOptions(dbs.staff.db, { businessId, options: ["telepathy" as never], now: LATER })).rejects.toThrow();
    await expect(setTrustInformation(dbs.staff.db, { businessId, paymentMethods: ["barter" as never], licences: [], now: LATER })).rejects.toThrow();
    const eleven = Array.from({ length: 11 }, (_, index) => `Licence ${String(index)}`);
    await expect(setTrustInformation(dbs.staff.db, { businessId, paymentMethods: [], licences: eleven, now: LATER })).rejects.toThrow();
  });
});

describe("page tabs", () => {
  it("starts with none on, saves the owner's choice, and says so when there is no profile yet", async () => {
    const businessId = await newAccount();
    expect(await setPageTabs(dbs.staff.db, { businessId, tabs: ["services"], servicesLabel: null, productsLabel: null, now: NOW })).toBe(false);

    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    const fresh = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(fresh?.pageTabs).toEqual([]);

    expect(await setPageTabs(dbs.staff.db, { businessId, tabs: ["offers", "trust"], servicesLabel: null, productsLabel: null, now: LATER })).toBe(true);
    const own = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(own?.pageTabs).toEqual(["offers", "trust"]);

    expect(await setPageTabs(dbs.staff.db, { businessId, tabs: [], servicesLabel: null, productsLabel: null, now: LATER })).toBe(true);
    const cleared = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(cleared?.pageTabs).toEqual([]);
  });

  it("is kept by the database: a fixed or unknown tab is refused", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    await expect(setPageTabs(dbs.staff.db, { businessId, tabs: ["gallery" as never], servicesLabel: null, productsLabel: null, now: LATER })).rejects.toThrow();
    await expect(setPageTabs(dbs.staff.db, { businessId, tabs: ["reviews" as never], servicesLabel: null, productsLabel: null, now: LATER })).rejects.toThrow();
  });

  it("keeps the owner's own words for Services and Products, and drops them when they go back to the usual ones", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    const fresh = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(fresh).toMatchObject({ servicesLabel: null, productsLabel: null });

    expect(await setPageTabs(dbs.staff.db, { businessId, tabs: ["services", "products"], servicesLabel: "Menu", productsLabel: "जेवण", now: LATER })).toBe(true);
    const named = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(named).toMatchObject({ servicesLabel: "Menu", productsLabel: "जेवण", pageTabs: ["services", "products"] });

    expect(await setPageTabs(dbs.staff.db, { businessId, tabs: ["services"], servicesLabel: "Menu", productsLabel: null, now: LATER })).toBe(true);
    const kept = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(kept).toMatchObject({ servicesLabel: "Menu", productsLabel: null });
  });

  it("is kept by the database: an empty, padded, over-long or multi-line name is refused", async () => {
    const businessId = await newAccount();
    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    const save = (servicesLabel: string | null, productsLabel: string | null = null) =>
      setPageTabs(dbs.staff.db, { businessId, tabs: [], servicesLabel, productsLabel, now: LATER });
    await expect(save("")).rejects.toThrow();
    await expect(save(" Menu")).rejects.toThrow();
    await expect(save("x".repeat(25))).rejects.toThrow();
    await expect(save("Menu\nCard")).rejects.toThrow();
    await expect(save(null, "")).rejects.toThrow();
    await expect(save(null, "x".repeat(25))).rejects.toThrow();
    expect(await save("x".repeat(24), "म".repeat(24))).toBe(true);
  });

  it("turns one tab on once, keeps the others, and leaves a tab the owner already has alone", async () => {
    const businessId = await newAccount();
    expect(await turnOnPageTab(dbs.staff.db, { businessId, tab: "services", now: NOW })).toBe(false);

    await saveBusinessDetails(dbs.staff.db, { businessId, details: DETAILS, now: NOW });
    expect(await turnOnPageTab(dbs.staff.db, { businessId, tab: "services", now: LATER })).toBe(true);
    expect(await turnOnPageTab(dbs.staff.db, { businessId, tab: "services", now: LATER })).toBe(false);
    expect(await turnOnPageTab(dbs.staff.db, { businessId, tab: "trust", now: LATER })).toBe(true);
    const own = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findDirectoryProfile(tx, businessId));
    expect(own?.pageTabs).toEqual(["services", "trust"]);
  });
});
