import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findBillingState,
  findDirectoryProfile,
  findPlaces,
  isModuleEnabled,
  listApprovedClaimedBusinesses,
  listBusinessFaqs,
  listBusinessProducts,
  listBusinessServices,
  listConfirmedAddedBusinesses,
  listExtraCategoriesByBusiness,
  listLegacyKeysByPlace,
  listLiveDirectoryListings,
  readLiveDirectoryPictures,
  readSiteFacts,
  type Database,
  type DirectoryListingRow,
  type DirectoryPlace,
  type SiteFacts,
} from "@firstfold/db";
import { readDirectoryFeed } from "./directory-feed";

vi.mock("server-only", () => ({}));
vi.mock("@firstfold/db", () => ({
  findBillingState: vi.fn(),
  findDirectoryProfile: vi.fn(),
  findPlaces: vi.fn(),
  isModuleEnabled: vi.fn(),
  listApprovedClaimedBusinesses: vi.fn(),
  listBusinessFaqs: vi.fn(),
  listBusinessProducts: vi.fn(),
  listBusinessServices: vi.fn(),
  listConfirmedAddedBusinesses: vi.fn(),
  listExtraCategoriesByBusiness: vi.fn(),
  listLegacyKeysByPlace: vi.fn(),
  listLiveDirectoryListings: vi.fn(),
  readLiveDirectoryPictures: vi.fn(),
  readSiteFacts: vi.fn(),
}));

const mockedListRows = vi.mocked(listLiveDirectoryListings);
const mockedListAdded = vi.mocked(listConfirmedAddedBusinesses);
const mockedListClaimed = vi.mocked(listApprovedClaimedBusinesses);
const mockedExtras = vi.mocked(listExtraCategoriesByBusiness);
const mockedReadPictures = vi.mocked(readLiveDirectoryPictures);
const mockedFindBilling = vi.mocked(findBillingState);
const mockedReadFacts = vi.mocked(readSiteFacts);
const mockedIsModuleEnabled = vi.mocked(isModuleEnabled);
const mockedFindPlaces = vi.mocked(findPlaces);
const mockedLegacyKeys = vi.mocked(listLegacyKeysByPlace);
const mockedFindProfile = vi.mocked(findDirectoryProfile);
const mockedServices = vi.mocked(listBusinessServices);
const mockedProducts = vi.mocked(listBusinessProducts);
const mockedFaqs = vi.mocked(listBusinessFaqs);

const DB = {} as Database;

/** What an added business sends when its owner has filled in nothing (facts() has no hours or time zone in this file). */
const EMPTY_PROFILE = expect.objectContaining({ services: [], products: [], faqs: [], paymentMethods: [], licences: [] });

/** 01:30 on 30 September in India, still 29 September in UTC and in the Americas. */
const NOW = new Date("2026-09-29T20:00:00.000Z");
const PAID_THROUGH = new Date("2026-10-29T00:00:00.000Z");

function place(id: string, citySlug: string, urlSlug: string): DirectoryPlace {
  return { id, origin: "open_data", stateCode: "mh", citySlug, urlSlug, urlLockedAt: NOW };
}

function listingRow(
  businessId: string,
  overrides: { readonly visible?: boolean; readonly placeId?: string } = {},
): DirectoryListingRow {
  return {
    businessId,
    placement: {
      businessId,
      categorySlug: "dentists",
      stateCode: "mh",
      citySlug: "thane",
      areaSlug: "naupada",
      slug: `clinic-${businessId}`,
      lat: 19.19,
      lon: 72.97,
      pinLabel: "Gokhale Road",
      whatsappPhone: null,
      bookingUrl: null,
      replacesSourcePath: null,
      previousPaths: [],
      placeId: overrides.placeId ?? null,
    },
    content: {
      about: "Gentle family dentistry.",
      tagline: null,
      taglineColour: "rose",
      tags: ["Braces"],
      buttons: { call: false, whatsapp: false, book: false, directions: false, website: false },
      visible: overrides.visible ?? true,
    },
    name: `Clinic ${businessId}`,
    streetAddress: "12 Gokhale Road, Thane 400602",
    phone: null,
    websiteUrl: null,
    googleProfileUrl: null,
  };
}

function facts(overrides: Partial<SiteFacts> = {}): SiteFacts {
  return { timeZone: "Asia/Kolkata", hours: [], closures: [], announcement: null, ...overrides };
}

function paidBilling(): Awaited<ReturnType<typeof findBillingState>> {
  return { subscription: { status: "active", paidThroughAt: PAID_THROUGH } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFindBilling.mockResolvedValue(paidBilling());
  mockedReadFacts.mockResolvedValue(facts());
  mockedIsModuleEnabled.mockResolvedValue(false);
  mockedListRows.mockResolvedValue([]);
  mockedListAdded.mockResolvedValue([]);
  mockedListClaimed.mockResolvedValue([]);
  mockedReadPictures.mockResolvedValue(new Map());
  mockedFindPlaces.mockResolvedValue(new Map());
  mockedLegacyKeys.mockResolvedValue(new Map());
  mockedExtras.mockResolvedValue(new Map());
  mockedFindProfile.mockResolvedValue(null);
  mockedServices.mockResolvedValue([]);
  mockedProducts.mockResolvedValue([]);
  mockedFaqs.mockResolvedValue([]);
});

describe("readDirectoryFeed", () => {
  it("publishes a paid, visible listing as featured", async () => {
    mockedListRows.mockResolvedValue([listingRow("biz-1")]);
    const feed = await readDirectoryFeed(DB, NOW);
    expect(feed.version).toBe(1);
    expect(feed.generatedAt).toBe("2026-09-29T20:00:00.000Z");
    expect(feed.listings).toHaveLength(1);
    expect(feed.listings[0]).toMatchObject({
      tier: "featured",
      name: "Clinic biz-1",
      about: "Gentle family dentistry.",
    });
  });

  it("falls back to the basic tier when the business has no billing state", async () => {
    mockedListRows.mockResolvedValue([listingRow("biz-1")]);
    mockedFindBilling.mockResolvedValue(null);
    const feed = await readDirectoryFeed(DB, NOW);
    expect(feed.listings).toHaveLength(1);
    expect(feed.listings[0]?.tier).toBe("basic");
    expect(feed.listings[0]).not.toHaveProperty("about");
  });

  it("falls back to the basic tier when the subscription has run out", async () => {
    mockedListRows.mockResolvedValue([listingRow("biz-1")]);
    mockedFindBilling.mockResolvedValue({
      subscription: { status: "active", paidThroughAt: new Date("2026-09-01T00:00:00.000Z") },
    } as never);
    const feed = await readDirectoryFeed(DB, NOW);
    expect(feed.listings[0]?.tier).toBe("basic");
  });

  it("leaves out a listing the client has hidden, keeping the others", async () => {
    mockedListRows.mockResolvedValue([listingRow("biz-1", { visible: false }), listingRow("biz-2")]);
    const feed = await readDirectoryFeed(DB, NOW);
    expect(feed.listings.map((listing) => listing.name)).toEqual(["Clinic biz-2"]);
  });

  it("sends the extra categories a business also lists in, on its listing and on an added business, and none otherwise", async () => {
    mockedListRows.mockResolvedValue([listingRow("biz-1"), listingRow("biz-2")]);
    const confirmedAt = new Date("2026-09-30T11:33:00.000Z");
    mockedListAdded.mockResolvedValue([
      { businessId: "added-x", listingKey: "cafes/thane/charai/sunrise-cafe", placeId: null, businessName: "Sunrise Cafe", streetAddress: null, phone: "+919820041003", websiteUrl: null, confirmedAt, verified: true, stateCode: "mh", postal: null, pin: null },
    ]);
    mockedExtras.mockResolvedValue(
      new Map([
        ["biz-1", ["cosmetic-dentists", "emergency-dentists"]],
        ["added-x", ["bakery-stores"]],
      ]),
    );
    const feed = await readDirectoryFeed(DB, NOW);
    expect(feed.listings[0]?.alsoCategories).toEqual(["cosmetic-dentists", "emergency-dentists"]);
    expect(feed.listings[1]).not.toHaveProperty("alsoCategories");
    expect(feed.added?.[0]?.alsoCategories).toEqual(["bakery-stores"]);
  });

  it("returns an empty feed when nothing is live", async () => {
    mockedListRows.mockResolvedValue([]);
    const feed = await readDirectoryFeed(DB, NOW);
    expect(feed.listings).toEqual([]);
    expect(feed.added).toEqual([]);
  });

  it("publishes each owner-added business staff confirmed, with its approved listing photo", async () => {
    const confirmedAt = new Date("2026-09-30T11:33:00.000Z");
    const withPhoto = "bakery-stores/thane/naupada/sunrise-bakery";
    const without = "cafes/thane/charai/sunrise-cafe";
    mockedListAdded.mockResolvedValue([
      // The backfill gave the bakery its place; the cafe was added since and has none yet.
      { businessId: "added-1", listingKey: withPhoto, placeId: "3bcdefg", businessName: "Sunrise Bakery", streetAddress: "Shop 4, Ram Maruti Road", phone: "+919820041002", websiteUrl: "https://sunrisebakery.example/", confirmedAt, verified: true, stateCode: "mh", postal: null, pin: null },
      { businessId: "added-2", listingKey: without, placeId: null, businessName: "Sunrise Cafe", streetAddress: null, phone: "+919820041003", websiteUrl: null, confirmedAt, verified: true, stateCode: "mh", postal: null, pin: null },
    ]);
    const photo = "01a0f195-9513-727c-b285-348ab89ee1e6";
    mockedReadPictures.mockResolvedValue(new Map([["3bcdefg", { listing: photo, ad_tall: null, ad_wide: null }]]));

    const feed = await readDirectoryFeed(DB, NOW);

    expect(mockedReadPictures).toHaveBeenCalledWith(DB, { placeIds: ["3bcdefg"], unplacedKeys: [without] });
    expect(feed.added).toEqual([
      {
        address: { category: "bakery-stores", state: "mh", city: "thane", area: "naupada", slug: "sunrise-bakery" },
        name: "Sunrise Bakery",
        streetAddress: "Shop 4, Ram Maruti Road",
        phone: "+919820041002",
        confirmedAt: "2026-09-30T11:33:00.000Z",
        verified: true,
        photo,
        website: "https://sunrisebakery.example/",
        profile: EMPTY_PROFILE,
      },
      {
        address: { category: "cafes", state: "mh", city: "thane", area: "charai", slug: "sunrise-cafe" },
        name: "Sunrise Cafe",
        streetAddress: "",
        phone: "+919820041003",
        confirmedAt: "2026-09-30T11:33:00.000Z",
        verified: true,
        photo: null,
        profile: EMPTY_PROFILE,
      },
    ]);
  });

  it("sends an owner-added business's services, products and profile details", async () => {
    mockedListAdded.mockResolvedValue([
      { businessId: "added-1", listingKey: "bakery-stores/thane/naupada/sunrise-bakery", placeId: null, businessName: "Sunrise Bakery", streetAddress: null, phone: "+919820041002", websiteUrl: null, confirmedAt: NOW, verified: false, stateCode: "mh", postal: null, pin: null },
    ]);
    mockedFindProfile.mockResolvedValue({
      businessId: "added-1",
      streetAddress: "Shop 4",
      phone: "+919820041002",
      whatsapp: null,
      mapsUrl: null,
      pin: null,
      websiteUrl: null,
      about: "Fresh bread.",
      youtubeVideoId: null,
      establishedYear: 2012,
      serviceArea: null,
      email: null,
      gstNumber: null,
      directionsNote: null,
      instagramUrl: null,
      facebookUrl: null,
      linkedinUrl: null,
      holidayHours: null,
      open24x7: false,
      contactOptions: ["call"],
      pageTabs: ["services"],
      servicesLabel: "Bakes",
      productsLabel: null,
      paymentMethods: ["upi"],
      licences: [],
      updatedAt: NOW,
    });
    mockedServices.mockResolvedValue([{ id: "s1", category: "Cakes", name: "Custom cake", summary: null, description: null, priceInr: 1200, durationMinutes: null, serviceArea: null }]);
    mockedProducts.mockResolvedValue([{ id: "p1", name: "Sourdough", description: null, priceInr: 120, category: null, availability: "in_stock", photoId: null }]);
    mockedFaqs.mockResolvedValue([{ id: "f1", question: "Do you deliver?", answer: "Yes, within 5 km." }]);

    const galleryOne = "11111111-1111-4111-8111-111111111111";
    const galleryThree = "33333333-3333-4333-8333-333333333333";
    mockedReadPictures.mockResolvedValue(new Map([["bakery-stores/thane/naupada/sunrise-bakery", { gallery_1: galleryOne, gallery_2: null, gallery_3: galleryThree }]]));

    const feed = await readDirectoryFeed(DB, NOW);

    expect(mockedServices).toHaveBeenCalledWith(DB, "added-1");
    expect(feed.added?.[0]?.profile).toMatchObject({
      // The owner's optional tabs, and their approved gallery photos in slot order.
      pageTabs: ["services"],
      gallery: [galleryOne, galleryThree],
      about: "Fresh bread.",
      establishedYear: 2012,
      paymentMethods: ["upi"],
      services: [{ category: "Cakes", name: "Custom cake", priceInr: 1200 }],
      products: [{ name: "Sourdough", priceInr: 120, availability: "in_stock" }],
      faqs: [{ question: "Do you deliver?", answer: "Yes, within 5 km." }],
    });
  });

  it("sends the profile a claimed business's owner filled in, under its place id, with its gallery read by place", async () => {
    mockedListClaimed.mockResolvedValue([{ businessId: "claimed-1", listingKey: "dentists/thane/naupada/smile-dental", placeId: "k7m2q9a" }]);
    mockedFindProfile.mockResolvedValue({
      businessId: "claimed-1",
      streetAddress: "Shop 4",
      phone: "+919820041002",
      whatsapp: null,
      mapsUrl: null,
      pin: null,
      websiteUrl: null,
      about: "Gentle family dentistry.",
      youtubeVideoId: null,
      establishedYear: 2011,
      serviceArea: null,
      email: null,
      gstNumber: null,
      directionsNote: null,
      instagramUrl: "https://instagram.com/smile",
      facebookUrl: null,
      linkedinUrl: null,
      holidayHours: null,
      open24x7: false,
      contactOptions: ["call"],
      pageTabs: ["services", "faq"],
      servicesLabel: null,
      productsLabel: null,
      paymentMethods: [],
      licences: [],
      updatedAt: NOW,
    });
    mockedServices.mockResolvedValue([{ id: "s1", category: "Cleaning", name: "Scaling", summary: null, description: null, priceInr: 1500, durationMinutes: 45, serviceArea: null }]);
    mockedFaqs.mockResolvedValue([{ id: "f1", question: "Walk-ins?", answer: "Yes." }]);
    const galleryOne = "11111111-1111-4111-8111-111111111111";
    mockedReadPictures.mockResolvedValue(new Map([["k7m2q9a", { gallery_1: galleryOne }]]));

    const feed = await readDirectoryFeed(DB, NOW);

    expect(mockedReadPictures).toHaveBeenCalledWith(DB, { placeIds: ["k7m2q9a"], unplacedKeys: [] });
    expect(mockedServices).toHaveBeenCalledWith(DB, "claimed-1");
    expect(feed.claimed).toEqual([
      {
        id: "k7m2q9a",
        profile: expect.objectContaining({
          about: "Gentle family dentistry.",
          establishedYear: 2011,
          pageTabs: ["services", "faq"],
          socials: { instagram: "https://instagram.com/smile" },
          services: [expect.objectContaining({ name: "Scaling", priceInr: 1500 })],
          faqs: [{ question: "Walk-ins?", answer: "Yes." }],
          gallery: [galleryOne],
        }),
      },
    ]);
    // A claim is not an added business: the directory's own name, address and phone stay, so none is sent.
    expect(feed.added).toEqual([]);
    expect(feed.claimed?.[0]).not.toHaveProperty("name");
    expect(feed.claimed?.[0]).not.toHaveProperty("phone");
  });

  it("sends an empty list of claimed profiles when no claim is approved", async () => {
    expect((await readDirectoryFeed(DB, NOW)).claimed).toEqual([]);
  });

  it("sends a placed listing's permanent id, locked URL and old addresses, found in one read each for the whole feed", async () => {
    mockedListRows.mockResolvedValue([
      listingRow("biz-1", { placeId: "k7m2q9a" }),
      listingRow("biz-2", { placeId: "b3cdefg" }),
      listingRow("biz-3"),
    ]);
    mockedFindPlaces.mockResolvedValue(
      new Map([
        ["k7m2q9a", place("k7m2q9a", "thane", "smile-dental")],
        ["b3cdefg", place("b3cdefg", "mumbai", "iron-gym")],
      ]),
    );
    mockedLegacyKeys.mockResolvedValue(new Map([["k7m2q9a", ["dentists/thane/naupada/smile-dental"]]]));

    const feed = await readDirectoryFeed(DB, NOW);

    expect(mockedFindPlaces).toHaveBeenCalledTimes(1);
    expect(mockedFindPlaces).toHaveBeenCalledWith(DB, ["k7m2q9a", "b3cdefg"]);
    expect(mockedLegacyKeys).toHaveBeenCalledTimes(1);
    expect(mockedLegacyKeys).toHaveBeenCalledWith(DB, ["k7m2q9a", "b3cdefg"]);
    expect(feed.listings[0]).toMatchObject({
      id: "k7m2q9a",
      url: { city: "thane", slug: "smile-dental" },
      legacyKeys: ["dentists/thane/naupada/smile-dental"],
    });
    // A place with no old address still sends the field, empty.
    expect(feed.listings[1]).toMatchObject({ id: "b3cdefg", url: { city: "mumbai", slug: "iron-gym" }, legacyKeys: [] });
    // A listing the registry does not have yet comes as it did before ids.
    expect(feed.listings[2]).not.toHaveProperty("id");
    expect(feed.listings[2]).not.toHaveProperty("url");
    expect(feed.listings[2]).not.toHaveProperty("legacyKeys");
  });

  it("sends an owner-added business's id and locked URL, reading places once for listings and added together", async () => {
    mockedListRows.mockResolvedValue([listingRow("biz-1", { placeId: "k7m2q9a" })]);
    const confirmedAt = new Date("2026-09-30T11:33:00.000Z");
    mockedListAdded.mockResolvedValue([
      { businessId: "added-3", listingKey: "cafes/thane/charai/sunrise-cafe", placeId: "3bcdefg", businessName: "Sunrise Cafe", streetAddress: null, phone: "+919820041003", websiteUrl: null, confirmedAt, verified: true, stateCode: "mh", postal: null, pin: null },
      { businessId: "added-4", listingKey: "cafes/thane/charai/sunset-cafe", placeId: null, businessName: "Sunset Cafe", streetAddress: null, phone: "+919820041004", websiteUrl: null, confirmedAt, verified: true, stateCode: "mh", postal: null, pin: null },
    ]);
    mockedFindPlaces.mockResolvedValue(
      new Map([
        ["k7m2q9a", place("k7m2q9a", "thane", "smile-dental")],
        ["3bcdefg", { ...place("3bcdefg", "thane", "sunrise-cafe"), origin: "added", urlLockedAt: null }],
      ]),
    );
    mockedLegacyKeys.mockResolvedValue(new Map([["3bcdefg", ["cafes/thane/charai/sunrise-cafe"]]]));

    const feed = await readDirectoryFeed(DB, NOW);

    expect(mockedFindPlaces).toHaveBeenCalledTimes(1);
    expect(mockedFindPlaces).toHaveBeenCalledWith(DB, ["k7m2q9a", "3bcdefg"]);
    expect(feed.added?.[0]).toMatchObject({
      id: "3bcdefg",
      url: { city: "thane", slug: "sunrise-cafe" },
      legacyKeys: ["cafes/thane/charai/sunrise-cafe"],
    });
    expect(feed.added?.[1]).not.toHaveProperty("id");
  });

  it("does not read the registry when no business has a place", async () => {
    mockedListRows.mockResolvedValue([listingRow("biz-1")]);
    const feed = await readDirectoryFeed(DB, NOW);
    expect(feed.listings).toHaveLength(1);
    expect(feed.listings[0]).not.toHaveProperty("id");
    expect(mockedFindPlaces).not.toHaveBeenCalled();
    expect(mockedLegacyKeys).not.toHaveBeenCalled();
  });

  it("reads today in the business's own time zone", async () => {
    mockedListRows.mockResolvedValue([listingRow("biz-1")]);
    // Starts on 30 September: already today in India, still tomorrow in UTC.
    const announcement = { message: "Open late", startsOn: "2026-09-30", endsOn: "2026-09-30" };
    mockedReadFacts.mockResolvedValue(facts({ timeZone: "UTC", announcement }));
    const inUtc = await readDirectoryFeed(DB, NOW);
    expect(inUtc.listings[0]?.announcement).toBeNull();
    mockedReadFacts.mockResolvedValue(facts({ timeZone: "Asia/Kolkata", announcement }));
    const inIndia = await readDirectoryFeed(DB, NOW);
    expect(inIndia.listings[0]?.announcement).toEqual({ message: "Open late", endsOn: "2026-09-30" });
  });

  it("uses UTC for today when the business has no time zone, like the dashboard pages", async () => {
    mockedListRows.mockResolvedValue([listingRow("biz-1")]);
    // Starts on 30 September, which in UTC is still tomorrow.
    const announcement = { message: "Open late", startsOn: "2026-09-30", endsOn: "2026-09-30" };
    mockedReadFacts.mockResolvedValue(facts({ timeZone: null, announcement }));
    const feed = await readDirectoryFeed(DB, NOW);
    expect(feed.listings[0]?.announcement).toBeNull();
    expect(feed.listings[0]).not.toHaveProperty("timeZone");
  });

  it("passes the Appointments module switch through so Book can show", async () => {
    const row = listingRow("biz-1");
    mockedListRows.mockResolvedValue([
      {
        ...row,
        placement: { ...row.placement, bookingUrl: "https://clinic.example/book" },
        content: { ...row.content, buttons: { ...row.content.buttons, book: true } },
      },
    ]);
    mockedIsModuleEnabled.mockResolvedValue(true);
    const feed = await readDirectoryFeed(DB, NOW);
    expect(feed.listings[0]?.buttons).toEqual({ book: "https://clinic.example/book" });
    expect(mockedIsModuleEnabled).toHaveBeenCalledWith(DB, "biz-1", "appointments");
  });
});
