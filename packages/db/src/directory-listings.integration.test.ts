import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openAccountClosure, restoreAccountClosure } from "./queries/account-closures";
import {
  findListingPlacement,
  findOwnListing,
  hasLiveProject,
  listingPath,
  ListingAddressTakenError,
  listLiveDirectoryListings,
  saveListingPlacement,
  updateOwnListingContent,
  type ListingPlacementInput,
} from "./queries/directory-listings";
import {
  businesses,
  businessMembers,
  businessProfiles,
  directoryListings,
  listingContent,
  projects,
  users,
} from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const NOW = new Date("2026-09-29T10:00:00.000Z");

const PLACEMENT: ListingPlacementInput = {
  categorySlug: "dentists",
  stateCode: "mh",
  citySlug: "thane",
  areaSlug: "naupada",
  slug: "smile-dental-clinic",
  lat: 19.19,
  lon: 72.97,
  pinLabel: "Gokhale Road, near Thane station",
  whatsappPhone: null,
  bookingUrl: null,
  replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental",
  takeOverPlaceId: null,
};

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

function asA<T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, work);
}

function asB<T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: OWNER_B, businessId: businessB }, work);
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
    { id: OWNER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: OWNER_B, name: "Ben Ortiz", email: "ben@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "smile-dental", name: "Smile Dental Clinic" },
      { slug: "harbour-salon", name: "Harbour Salon" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "smile-dental")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "harbour-salon")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
  await dbs.staff.db.insert(businessProfiles).values({
    businessId: businessA,
    displayName: "Smile Dental Clinic",
    phone: "+919000000000",
    addressLine1: "12 Gokhale Road",
    city: "Thane",
    postalCode: "400602",
    googleBusinessUrl: "https://g.page/smile-dental",
  });
});

describe("listingPath", () => {
  it("builds the /in address", () => {
    expect(listingPath(PLACEMENT)).toBe("/in/dentists/mh/thane/naupada/smile-dental-clinic");
  });
});

describe("saveListingPlacement", () => {
  it("creates the placement and an empty content row", async () => {
    const saved = await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    // takeOverPlaceId says which business a new listing is; it is not stored on the listing.
    const { takeOverPlaceId, ...stored } = PLACEMENT;
    expect(takeOverPlaceId).toBeNull();
    expect(saved).toMatchObject({ ...stored, businessId: businessA, previousPaths: [] });
    const content = await dbs.staff.db.select().from(listingContent);
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({ businessId: businessA, about: null, tags: [], visible: true, showBook: false });
  });

  it("remembers the old address when the address changes, and not when it does not", async () => {
    await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    await saveListingPlacement(dbs.staff.db, businessA, { ...PLACEMENT, pinLabel: "Moved the label" }, NOW);
    expect((await findListingPlacement(dbs.staff.db, businessA))?.previousPaths).toEqual([]);

    const moved = await saveListingPlacement(dbs.staff.db, businessA, { ...PLACEMENT, areaSlug: "panch-pakhadi" }, NOW);
    expect(moved.previousPaths).toEqual(["/in/dentists/mh/thane/naupada/smile-dental-clinic"]);

    const back = await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    expect(back.previousPaths).toEqual(["/in/dentists/mh/thane/panch-pakhadi/smile-dental-clinic"]);
  });

  it("refuses an address another business already has", async () => {
    await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    await expect(saveListingPlacement(dbs.staff.db, businessB, PLACEMENT, NOW)).rejects.toBeInstanceOf(
      ListingAddressTakenError,
    );
  });
});

describe("the customer's own listing", () => {
  beforeEach(async () => {
    await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
  });

  it("reads its own listing and nobody else's", async () => {
    const own = await asA((tx) => findOwnListing(tx));
    expect(own?.placement.slug).toBe("smile-dental-clinic");
    expect(own?.content).toEqual({
      about: null,
      tagline: null,
      taglineColour: "rose",
      tags: [],
      buttons: { call: true, whatsapp: true, book: false, directions: true, website: true },
      visible: true,
    });
    expect(await asB((tx) => findOwnListing(tx))).toBeNull();
  });

  it("updates its own content", async () => {
    const updated = await asA((tx) =>
      updateOwnListingContent(tx, { about: "Gentle family dentistry.", tags: ["Braces"], visible: false }, NOW),
    );
    expect(updated).toBe(true);
    const own = await asA((tx) => findOwnListing(tx));
    expect(own?.content).toMatchObject({ about: "Gentle family dentistry.", tags: ["Braces"], visible: false });
  });

  it("saves its tagline and colour, and clears the tagline again", async () => {
    const saved = await asA((tx) => updateOwnListingContent(tx, { tagline: "Gentle dentistry", taglineColour: "sage" }, NOW));
    expect(saved).toBe(true);
    expect((await asA((tx) => findOwnListing(tx)))?.content).toMatchObject({ tagline: "Gentle dentistry", taglineColour: "sage" });

    await asA((tx) => updateOwnListingContent(tx, { tagline: null }, NOW));
    expect((await asA((tx) => findOwnListing(tx)))?.content).toMatchObject({ tagline: null, taglineColour: "sage" });
  });

  it("refuses a tagline that is too long, has a line break, or a colour that is not offered", async () => {
    const tooLong = await captureErrorText(asA((tx) => updateOwnListingContent(tx, { tagline: "a".repeat(81) }, NOW)));
    expect(tooLong).toMatch(/listing_content_tagline_check/);
    const lines = await captureErrorText(asA((tx) => updateOwnListingContent(tx, { tagline: "one\ntwo" }, NOW)));
    expect(lines).toMatch(/listing_content_tagline_check/);
    const colour = await captureErrorText(asA((tx) => updateOwnListingContent(tx, { taglineColour: "neon" }, NOW)));
    expect(colour).toMatch(/listing_content_tagline_colour_check/);
  });

  it("returns false for a business with no listing", async () => {
    expect(await asB((tx) => updateOwnListingContent(tx, { about: "Hello" }, NOW))).toBe(false);
  });

  it("cannot change the placement, or insert or delete content", async () => {
    const updatePlacement = await captureErrorText(
      asA((tx) => tx.update(directoryListings).set({ slug: "hijacked" })),
    );
    expect(updatePlacement).toMatch(/permission denied/);
    const insert = await captureErrorText(asB((tx) => tx.insert(listingContent).values({ businessId: businessB })));
    expect(insert).toMatch(/permission denied/);
    const remove = await captureErrorText(asA((tx) => tx.delete(listingContent)));
    expect(remove).toMatch(/permission denied/);
  });

  it("cannot see or update another business's listing", async () => {
    expect(await asB((tx) => tx.select().from(directoryListings))).toEqual([]);
    expect(await asB((tx) => tx.select().from(listingContent))).toEqual([]);

    const crossUpdate = await asB((tx) =>
      tx.update(listingContent).set({ about: "x" }).where(eq(listingContent.businessId, businessA)).returning(),
    );
    expect(crossUpdate).toEqual([]);
    const contentA = await dbs.staff.db.select().from(listingContent).where(eq(listingContent.businessId, businessA));
    expect(contentA[0]?.about).toBeNull();
  });

  it("cannot move its content to another business or insert a placement", async () => {
    const move = await captureErrorText(asA((tx) => tx.update(listingContent).set({ businessId: businessB })));
    expect(move).toMatch(/permission denied/);
    const insertPlacement = await captureErrorText(
      asA((tx) => tx.insert(directoryListings).values({ businessId: businessA, ...PLACEMENT, slug: "other" })),
    );
    expect(insertPlacement).toMatch(/permission denied/);
  });

  it("holds the database checks on about and tags", async () => {
    const tooLong = await captureErrorText(asA((tx) => updateOwnListingContent(tx, { about: "a".repeat(161) }, NOW)));
    expect(tooLong).toMatch(/listing_content_about_check/);
    const tooMany = await captureErrorText(
      asA((tx) => updateOwnListingContent(tx, { tags: Array.from({ length: 9 }, (_, index) => `t${index}`) }, NOW)),
    );
    expect(tooMany).toMatch(/listing_content_tags_check/);
  });
});

describe("hasLiveProject and the feed rows", () => {
  it("lists only businesses with a live project, with their profile", async () => {
    await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    expect(await hasLiveProject(dbs.staff.db, businessA)).toBe(false);
    expect(await listLiveDirectoryListings(dbs.staff.db)).toEqual([]);

    await dbs.staff.db.insert(projects).values({ businessId: businessA, status: "live" });
    expect(await hasLiveProject(dbs.staff.db, businessA)).toBe(true);
    expect(await asA((tx) => hasLiveProject(tx, businessA))).toBe(true);

    const rows = await listLiveDirectoryListings(dbs.staff.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessId: businessA,
      name: "Smile Dental Clinic",
      phone: "+919000000000",
      streetAddress: "12 Gokhale Road, Thane 400602",
      websiteUrl: null,
      googleProfileUrl: "https://g.page/smile-dental",
      placement: { slug: "smile-dental-clinic" },
      content: { visible: true },
    });
  });

  it("takes a closing account's listing out of the feed, and puts it back when the account is restored", async () => {
    await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    await dbs.staff.db.insert(projects).values({ businessId: businessA, status: "live" });
    expect(await listLiveDirectoryListings(dbs.staff.db)).toHaveLength(1);

    await dbs.owner.db.insert(users).values({ id: "closing-owner", name: "Owner", email: "closing-owner@example.com", emailVerified: true });
    await openAccountClosure(dbs.staff.db, { userId: "closing-owner", businessId: businessA, now: NOW, eraseAfter: new Date(NOW.getTime() + 86_400_000) });
    expect(await listLiveDirectoryListings(dbs.staff.db)).toEqual([]);

    await restoreAccountClosure(dbs.staff.db, { userId: "closing-owner", now: NOW });
    expect(await listLiveDirectoryListings(dbs.staff.db)).toHaveLength(1);
  });
});
