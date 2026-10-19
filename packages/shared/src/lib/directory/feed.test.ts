import type { DirectoryListingRow, SiteFacts } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { buildAddedFeedListing, buildAddedProfile, buildFeedListing, FEED_POSTAL_NAME_MAX, socialsOf, type FeedPlace } from "./feed";

const ROW: DirectoryListingRow = {
  businessId: "biz-1",
  placement: {
    businessId: "biz-1",
    categorySlug: "dentists",
    stateCode: "mh",
    citySlug: "thane",
    areaSlug: "naupada",
    slug: "smile-dental-clinic",
    lat: 19.19,
    lon: 72.97,
    pinLabel: "Gokhale Road",
    whatsappPhone: null,
    bookingUrl: "https://smiledental.in/book",
    replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental",
    previousPaths: ["/in/dentists/mh/thane/panch-pakhadi/smile-dental-clinic"],
    placeId: null,
  },
  content: {
    about: "Gentle family dentistry.",
    tagline: null,
    taglineColour: "rose",
    tags: ["Braces"],
    buttons: { call: true, whatsapp: true, book: true, directions: true, website: true },
    visible: true,
  },
  name: "Smile Dental Clinic",
  streetAddress: "12 Gokhale Road, Thane 400602",
  phone: "+919000000000",
  websiteUrl: "https://smiledental.in",
  googleProfileUrl: "https://g.page/smile-dental",
};

const FACTS: SiteFacts = {
  timeZone: "Asia/Kolkata",
  hours: [
    { id: "h1", dayOfWeek: 0, opensAt: "10:00:00", closesAt: "13:30:00", closed: false, openAllDay: false },
    { id: "h2", dayOfWeek: 0, opensAt: "17:00:00", closesAt: "21:00:00", closed: false, openAllDay: false },
    { id: "h3", dayOfWeek: 5, opensAt: null, closesAt: null, closed: false, openAllDay: true },
    { id: "h4", dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
  ],
  closures: [
    { id: "c1", startsOn: "2026-09-01", endsOn: "2026-09-02", note: null },
    { id: "c2", startsOn: "2026-10-02", endsOn: "2026-10-02", note: "Holiday" },
  ],
  announcement: { message: "Closed on 2 Oct", startsOn: "2026-09-28", endsOn: "2026-10-02" },
};

const TODAY = "2026-09-29";

/** The place registry's record of ROW's business: its permanent id, locked URL label and old addresses. */
const PLACE: FeedPlace = {
  id: "k7m2q9a",
  citySlug: "thane",
  urlSlug: "smile-dental",
  legacyKeys: ["dentists/thane/naupada/smile-dental"],
};

describe("buildFeedListing", () => {
  it("shapes a featured listing", () => {
    expect(buildFeedListing({ row: ROW, facts: FACTS, paid: true, bookingEnabled: true, today: TODAY, place: PLACE })).toEqual({
      address: { category: "dentists", state: "mh", city: "thane", area: "naupada", slug: "smile-dental-clinic" },
      previousAddresses: ["/in/dentists/mh/thane/panch-pakhadi/smile-dental-clinic"],
      replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental",
      id: "k7m2q9a",
      url: { city: "thane", slug: "smile-dental" },
      legacyKeys: ["dentists/thane/naupada/smile-dental"],
      tier: "featured",
      name: "Smile Dental Clinic",
      streetAddress: "12 Gokhale Road, Thane 400602",
      lat: 19.19,
      lon: 72.97,
      about: "Gentle family dentistry.",
      tags: ["Braces"],
      timeZone: "Asia/Kolkata",
      hours: [
        { day: 0, opens: "10:00", closes: "13:30" },
        { day: 0, opens: "17:00", closes: "21:00" },
        { day: 5, opens: "00:00", closes: "24:00" },
      ],
      closures: [{ startsOn: "2026-10-02", endsOn: "2026-10-02", reason: "Holiday" }],
      announcement: { message: "Closed on 2 Oct", endsOn: "2026-10-02" },
      buttons: {
        call: "tel:+919000000000",
        whatsapp: "https://wa.me/919000000000",
        book: "https://smiledental.in/book",
        directions: "https://www.google.com/maps/dir/?api=1&destination=19.19,72.97",
        website: "https://smiledental.in",
      },
      googleProfileUrl: "https://g.page/smile-dental",
    });
  });

  it("carries the place's permanent id, locked URL label and old addresses", () => {
    const place: FeedPlace = { id: "b3cdefg", citySlug: "mumbai", urlSlug: "smile-dental-care", legacyKeys: ["a/b/c/d", "e/f/g/h"] };
    const listing = buildFeedListing({ row: ROW, facts: FACTS, paid: true, bookingEnabled: true, today: TODAY, place });
    expect(listing).toMatchObject({
      id: "b3cdefg",
      // The place's locked label, not the listing's own address (thane / smile-dental-clinic).
      url: { city: "mumbai", slug: "smile-dental-care" },
      legacyKeys: ["a/b/c/d", "e/f/g/h"],
    });
  });

  it.each([true, false])("serialises a listing without a place as it was before ids (paid: %s)", (paid) => {
    const listing = buildFeedListing({ row: ROW, facts: FACTS, paid, bookingEnabled: true, today: TODAY, place: null });
    expect(listing).not.toBeNull();
    expect(listing).not.toHaveProperty("id");
    expect(listing).not.toHaveProperty("url");
    expect(listing).not.toHaveProperty("legacyKeys");
    expect(listing?.address).toEqual({ category: "dentists", state: "mh", city: "thane", area: "naupada", slug: "smile-dental-clinic" });
    expect(listing?.previousAddresses).toEqual(["/in/dentists/mh/thane/panch-pakhadi/smile-dental-clinic"]);
  });

  it("passes on the Google profile only when it is an https address", () => {
    for (const googleProfileUrl of [null, "", "   ", "http://g.page/smile-dental", "javascript:alert(1)"]) {
      const row: DirectoryListingRow = { ...ROW, googleProfileUrl };
      const listing = buildFeedListing({ row, facts: FACTS, paid: true, bookingEnabled: true, today: TODAY, place: PLACE });
      expect(listing).not.toHaveProperty("googleProfileUrl");
    }
  });

  it("drops buttons that are off or have nowhere to go", () => {
    const row: DirectoryListingRow = {
      ...ROW,
      content: {
        ...ROW.content,
        buttons: { call: false, whatsapp: true, book: true, directions: true, website: true },
      },
      phone: null,
      websiteUrl: null,
      placement: { ...ROW.placement, whatsappPhone: "+919000000001" },
    };
    const listing = buildFeedListing({ row, facts: FACTS, paid: true, bookingEnabled: false, today: TODAY, place: PLACE });
    expect(listing?.buttons).toEqual({
      whatsapp: "https://wa.me/919000000001",
      directions: "https://www.google.com/maps/dir/?api=1&destination=19.19,72.97",
    });
  });

  it("hides an announcement that is not showing today", () => {
    const facts: SiteFacts = {
      ...FACTS,
      announcement: { message: "Later", startsOn: "2026-10-05", endsOn: "2026-10-06" },
    };
    const listing = buildFeedListing({ row: ROW, facts, paid: true, bookingEnabled: true, today: TODAY, place: PLACE });
    expect(listing?.announcement).toBeNull();
  });

  it("is basic when payment has lapsed", () => {
    expect(buildFeedListing({ row: ROW, facts: FACTS, paid: false, bookingEnabled: true, today: TODAY, place: PLACE })).toEqual({
      address: { category: "dentists", state: "mh", city: "thane", area: "naupada", slug: "smile-dental-clinic" },
      previousAddresses: ["/in/dentists/mh/thane/panch-pakhadi/smile-dental-clinic"],
      replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental",
      id: "k7m2q9a",
      url: { city: "thane", slug: "smile-dental" },
      legacyKeys: ["dentists/thane/naupada/smile-dental"],
      tier: "basic",
      name: "Smile Dental Clinic",
      streetAddress: "12 Gokhale Road, Thane 400602",
      lat: 19.19,
      lon: 72.97,
    });
  });

  it("leaves a hidden listing out", () => {
    const row: DirectoryListingRow = { ...ROW, content: { ...ROW.content, visible: false } };
    expect(buildFeedListing({ row, facts: FACTS, paid: true, bookingEnabled: true, today: TODAY, place: PLACE })).toBeNull();
  });

  it("drops Call and WhatsApp when the phone is empty", () => {
    const row: DirectoryListingRow = { ...ROW, phone: "" };
    const listing = buildFeedListing({ row, facts: FACTS, paid: true, bookingEnabled: true, today: TODAY, place: PLACE });
    expect(listing?.buttons).not.toHaveProperty("call");
    expect(listing?.buttons).not.toHaveProperty("whatsapp");
  });

  it("strips spaces from the phone number in the call and WhatsApp links", () => {
    const row: DirectoryListingRow = { ...ROW, phone: "+91 98765 43210" };
    const listing = buildFeedListing({ row, facts: FACTS, paid: true, bookingEnabled: true, today: TODAY, place: PLACE });
    expect(listing?.buttons).toMatchObject({
      call: "tel:+919876543210",
      whatsapp: "https://wa.me/919876543210",
    });
  });

  it("shows an announcement that starts today", () => {
    const facts: SiteFacts = {
      ...FACTS,
      announcement: { message: "From today", startsOn: TODAY, endsOn: "2026-10-05" },
    };
    const listing = buildFeedListing({ row: ROW, facts, paid: true, bookingEnabled: true, today: TODAY, place: PLACE });
    expect(listing?.announcement).toEqual({ message: "From today", endsOn: "2026-10-05" });
  });

  it("shows an announcement that ends today", () => {
    const facts: SiteFacts = {
      ...FACTS,
      announcement: { message: "Last day", startsOn: "2026-09-20", endsOn: TODAY },
    };
    const listing = buildFeedListing({ row: ROW, facts, paid: true, bookingEnabled: true, today: TODAY, place: PLACE });
    expect(listing?.announcement).toEqual({ message: "Last day", endsOn: TODAY });
  });

  it("keeps a closure that ends today", () => {
    const facts: SiteFacts = {
      ...FACTS,
      closures: [{ id: "c3", startsOn: "2026-09-27", endsOn: TODAY, note: null }],
    };
    const listing = buildFeedListing({ row: ROW, facts, paid: true, bookingEnabled: true, today: TODAY, place: PLACE });
    expect(listing?.closures).toEqual([{ startsOn: "2026-09-27", endsOn: TODAY }]);
  });

  it("leaves a hidden listing out even when payment has lapsed", () => {
    const row: DirectoryListingRow = { ...ROW, content: { ...ROW.content, visible: false } };
    expect(buildFeedListing({ row, facts: FACTS, paid: false, bookingEnabled: true, today: TODAY, place: PLACE })).toBeNull();
  });

  it("passes the tagline and its colour on, and leaves them out when there is none", () => {
    const withTagline: DirectoryListingRow = { ...ROW, content: { ...ROW.content, tagline: "Gentle dentistry", taglineColour: "sage" } };
    const input = { facts: FACTS, paid: true, bookingEnabled: true, today: TODAY, place: PLACE };
    expect(buildFeedListing({ ...input, row: withTagline })?.tagline).toEqual({ text: "Gentle dentistry", colour: "sage" });
    expect(buildFeedListing({ ...input, row: ROW })).not.toHaveProperty("tagline");
  });

  it("omits about and timeZone when there is nothing to say", () => {
    const row: DirectoryListingRow = { ...ROW, content: { ...ROW.content, about: null } };
    const facts: SiteFacts = { ...FACTS, timeZone: null };
    const listing = buildFeedListing({ row, facts, paid: true, bookingEnabled: true, today: TODAY, place: PLACE });
    expect(listing).not.toBeNull();
    expect(listing).not.toHaveProperty("about");
    expect(listing).not.toHaveProperty("timeZone");
  });
});

describe("buildAddedFeedListing", () => {
  const confirmedAt = new Date("2026-09-30T11:33:00.000Z");
  const ADDED_PLACE: FeedPlace = {
    id: "3bcdefg",
    citySlug: "thane",
    urlSlug: "sunrise-bakery",
    legacyKeys: ["bakery-stores/thane/naupada/sunrise-bakery"],
  };

  it("shapes a confirmed owner-added business from its key", () => {
    expect(
      buildAddedFeedListing({
        businessId: "biz-added",
        listingKey: "bakery-stores/thane/naupada/sunrise-bakery",
        placeId: null,
        businessName: "Sunrise Bakery",
        streetAddress: "Shop 4, Ram Maruti Road",
        phone: "+919820041002",
        websiteUrl: "http://sunrisebakery.example/",
        confirmedAt,
        verified: true,
        stateCode: "mh",
        postal: null,
        pin: null,
      }, "01a0f195-9513-727c-b285-348ab89ee1e6", ADDED_PLACE),
    ).toEqual({
      address: { category: "bakery-stores", state: "mh", city: "thane", area: "naupada", slug: "sunrise-bakery" },
      name: "Sunrise Bakery",
      streetAddress: "Shop 4, Ram Maruti Road",
      phone: "+919820041002",
      confirmedAt: "2026-09-30T11:33:00.000Z",
      verified: true,
      photo: "01a0f195-9513-727c-b285-348ab89ee1e6",
      website: "http://sunrisebakery.example/",
      id: "3bcdefg",
      url: { city: "thane", slug: "sunrise-bakery" },
      legacyKeys: ["bakery-stores/thane/naupada/sunrise-bakery"],
    });
  });

  it("serialises an added business without a place as it was before ids", () => {
    const listing = buildAddedFeedListing(
      { businessId: "biz-added", listingKey: "cafes/thane/charai/sunrise", placeId: null, businessName: "Sunrise", streetAddress: null, phone: "+919820041002", websiteUrl: null, confirmedAt, verified: true, stateCode: "mh", postal: null, pin: null },
      null,
      null,
    );
    expect(listing).not.toBeNull();
    expect(listing).not.toHaveProperty("id");
    expect(listing).not.toHaveProperty("url");
    expect(listing).not.toHaveProperty("legacyKeys");
  });

  it("sends whether Brandbasket verified the business, so an owner-published one is not called Verified", () => {
    const business = { businessId: "biz-added", listingKey: "cafes/thane/charai/sunrise", placeId: null, businessName: "Sunrise", streetAddress: null, phone: "+919820041002", websiteUrl: null, confirmedAt, stateCode: "mh", postal: null, pin: null };
    expect(buildAddedFeedListing({ ...business, verified: false }, null, null)).toMatchObject({ verified: false });
    expect(buildAddedFeedListing({ ...business, verified: true }, null, null)).toMatchObject({ verified: true });
  });

  it("sends an empty street address when the owner gave none", () => {
    const listing = buildAddedFeedListing({
      businessId: "biz-added",
      listingKey: "cafes/thane/charai/sunrise",
      placeId: null,
      businessName: "Sunrise",
      streetAddress: null,
      phone: "+919820041002",
      websiteUrl: null,
      confirmedAt,
      verified: true,
      stateCode: "mh",
      postal: null,
      pin: null,
    }, null, null);
    expect(listing?.streetAddress).toBe("");
    expect(listing?.photo).toBeNull();
    expect(listing).not.toHaveProperty("website");
  });

  it("drops a website that is not a web address", () => {
    const listing = buildAddedFeedListing(
      { businessId: "biz-added", listingKey: "cafes/thane/charai/sunrise", placeId: null, businessName: "Sunrise", streetAddress: null, phone: "+919820041002", websiteUrl: "javascript:alert(1)", confirmedAt, verified: true, stateCode: "mh", postal: null, pin: null },
      null,
      null,
    );
    expect(listing).not.toHaveProperty("website");
  });

  it.each(["cafes/thane/charai", "cafes/thane/charai/sunrise/extra", "cafes//charai/sunrise"])(
    "leaves out a key that is not a full address: %s",
    (listingKey) => {
      expect(
        buildAddedFeedListing({ businessId: "biz-added", listingKey, placeId: null, businessName: "Sunrise", streetAddress: null, phone: "+919820041002", websiteUrl: null, confirmedAt, verified: true, stateCode: "mh", postal: null, pin: null }, null, null),
      ).toBeNull();
    },
  );

  it("sends the extra categories on an added business only when it has some", () => {
    const business = { businessId: "biz-added", listingKey: "cafes/thane/charai/sunrise", placeId: null, businessName: "Sunrise", streetAddress: null, phone: "+919820041002", websiteUrl: null, confirmedAt, verified: true, stateCode: "mh", postal: null, pin: null };
    expect(buildAddedFeedListing(business, null, null, ["bakeries", "restaurants"])?.alsoCategories).toEqual(["bakeries", "restaurants"]);
    expect(buildAddedFeedListing(business, null, null, [])).not.toHaveProperty("alsoCategories");
    expect(buildAddedFeedListing(business, null, null)).not.toHaveProperty("alsoCategories");
  });

  const ADDED_BUSINESS = {
    businessId: "biz-added",
    listingKey: "cafes/thane/charai/sunrise",
    placeId: null,
    businessName: "Sunrise",
    streetAddress: null,
    phone: "+919820041002",
    websiteUrl: null,
    confirmedAt,
    verified: true,
    stateCode: "mh",
    postal: null,
    pin: null,
  } as const;

  it("sends the pin from its owner's Google Maps link, and none when there is no pin", () => {
    const pinned = buildAddedFeedListing({ ...ADDED_BUSINESS, pin: { lat: 19.1943, lon: 72.9706 } }, null, null);
    expect(pinned?.pin).toEqual({ lat: 19.1943, lon: 72.9706 });
    expect(buildAddedFeedListing(ADDED_BUSINESS, null, null)).not.toHaveProperty("pin");
  });

  it("sends an elsewhere business with its own state and its postal block", () => {
    const entry = buildAddedFeedListing(
      {
        ...ADDED_BUSINESS,
        businessId: "biz-added",
        listingKey: "dentists/wb-north-24-parganas/salt-lake-sector-v/smile-dental",
        stateCode: "wb",
        postal: { pincode: "700091", localityName: "Salt Lake Sector V", districtName: "North 24 Parganas" },
      },
      null,
      null,
    );
    expect(entry?.address).toEqual({
      category: "dentists",
      state: "wb",
      city: "wb-north-24-parganas",
      area: "salt-lake-sector-v",
      slug: "smile-dental",
    });
    expect(entry?.postal).toEqual({
      pincode: "700091",
      locality: "Salt Lake Sector V",
      district: "North 24 Parganas",
      state: "West Bengal",
    });
  });

  it("cuts a postal name to the website's length, so one long name can't cost the business its page", () => {
    const long = `Salt Lake ${"Sector ".repeat(30)}`.trim();
    const entry = buildAddedFeedListing(
      {
        ...ADDED_BUSINESS,
        businessId: "biz-added",
        listingKey: "dentists/wb-north-24-parganas/salt-lake-sector-v/smile-dental",
        stateCode: "wb",
        postal: { pincode: "700091", localityName: long, districtName: "North 24 Parganas" },
      },
      null,
      null,
    );
    expect(entry?.postal?.locality).toBe(long.slice(0, FEED_POSTAL_NAME_MAX).trimEnd());
    expect(entry?.postal?.locality.length).toBeLessThanOrEqual(FEED_POSTAL_NAME_MAX);
  });

  it("a Thane business has no postal block and state mh", () => {
    const entry = buildAddedFeedListing(ADDED_BUSINESS, null, null);
    expect(entry?.address.state).toBe("mh");
    expect(entry).not.toHaveProperty("postal");
  });
});

describe("buildAddedProfile", () => {
  const profile = {
    businessId: "biz-added",
    streetAddress: "1 Main Road",
    phone: "+919820041002",
    whatsapp: null,
    mapsUrl: null,
    pin: null,
    websiteUrl: null,
    about: "  Family dentist since 2010.  ",
    youtubeVideoId: "dQw4w9WgXcQ",
    establishedYear: 2010,
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
    pageTabs: ["trust", "services"],
    servicesLabel: null,
    productsLabel: null,
    paymentMethods: ["upi", "cash"],
    licences: ["MDS, Mumbai University"],
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  } as const;

  it("sends what the owner filled in on every tab, trimmed, with blanks left out", () => {
    const built = buildAddedProfile({
      profile,
      facts: FACTS,
      services: [
        { id: "s1", category: "Cleaning", name: "Scaling", summary: "Removes plaque", description: null, priceInr: 800, durationMinutes: 30, serviceArea: null },
        { id: "s2", category: "Cleaning", name: "Polishing", summary: null, description: "Gentle", priceInr: null, durationMinutes: null, serviceArea: "Thane" },
      ],
      products: [
        { id: "p1", name: "Toothbrush", description: null, priceInr: 99, category: "Care", availability: "in_stock", photoId: null },
        { id: "p2", name: "Floss", description: null, priceInr: null, category: null, availability: "made_to_order", photoId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b" },
      ],
      faqs: [{ id: "q1", question: "Do you take walk-ins?", answer: "Yes." }],
      gallery: ["3f1c0a52-8e0b-4d54-9d8e-0a1b2c3d4e5f"],
      today: "2026-10-10",
    });
    expect(built.about).toBe("Family dentist since 2010.");
    expect(built.hours.length).toBeGreaterThan(0);
    expect(built.timeZone).toBe("Asia/Kolkata");
    expect(built.services).toEqual([
      { category: "Cleaning", name: "Scaling", summary: "Removes plaque", priceInr: 800, durationMinutes: 30 },
      { category: "Cleaning", name: "Polishing", description: "Gentle", serviceArea: "Thane" },
    ]);
    expect(built.products).toEqual([
      { name: "Toothbrush", priceInr: 99, category: "Care", availability: "in_stock" },
      { name: "Floss", availability: "made_to_order", photo: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b" },
    ]);
    expect(built.faqs).toEqual([{ question: "Do you take walk-ins?", answer: "Yes." }]);
    expect(built).toMatchObject({ youtubeVideoId: "dQw4w9WgXcQ", establishedYear: 2010, paymentMethods: ["upi", "cash"], licences: ["MDS, Mumbai University"] });
    // The owner's optional tabs, once each in the standard order; the gallery photos by id.
    expect(built.pageTabs).toEqual(["services", "trust"]);
    expect(built.gallery).toEqual(["3f1c0a52-8e0b-4d54-9d8e-0a1b2c3d4e5f"]);
    expect(built).not.toHaveProperty("open24x7");
    expect(built).not.toHaveProperty("serviceArea");
    // The owner kept the usual words: nothing is said about names.
    expect(built).not.toHaveProperty("pageTabLabels");
  });

  it("sends the owner's own words for Services and Products, only those they set", () => {
    const facts = { timeZone: null, hours: [], closures: [], announcement: null };
    const menu = buildAddedProfile({ profile: { ...profile, servicesLabel: "Menu", productsLabel: null }, facts, services: [], products: [], today: "2026-10-10" });
    expect(menu.pageTabLabels).toEqual({ services: "Menu" });
    const both = buildAddedProfile({ profile: { ...profile, servicesLabel: "Treatments", productsLabel: "Medicines" }, facts, services: [], products: [], today: "2026-10-10" });
    expect(both.pageTabLabels).toEqual({ services: "Treatments", products: "Medicines" });
  });

  it("still sends a block, with empty lists, when the owner has filled in nothing", () => {
    const built = buildAddedProfile({ profile: null, facts: { timeZone: null, hours: [], closures: [], announcement: null }, services: [], products: [], today: "2026-10-10" });
    expect(built).toEqual({ hours: [], services: [], products: [], faqs: [], paymentMethods: [], licences: [], pageTabs: [] });
  });

  it("goes onto the added listing", () => {
    const business = {
      businessId: "biz-added",
      listingKey: "cafes/thane/charai/sunrise",
      placeId: null,
      businessName: "Sunrise",
      streetAddress: null,
      phone: "+919820041002",
      websiteUrl: null,
      confirmedAt: new Date("2026-09-30T10:00:00Z"),
      verified: true,
      stateCode: "mh",
      postal: null,
      pin: null,
    } as const;
    const block = buildAddedProfile({ profile: null, facts: { timeZone: null, hours: [], closures: [], announcement: null }, services: [], products: [], today: "2026-10-10" });
    expect(buildAddedFeedListing(business, null, null, undefined, block)?.profile).toEqual(block);
    expect(buildAddedFeedListing(business, null, null)).not.toHaveProperty("profile");
  });
});

describe("holidays in the feed", () => {
  const facts = {
    timeZone: "Asia/Kolkata",
    hours: [],
    closures: [
      { id: "a", startsOn: "2026-09-01", endsOn: "2026-09-02", note: "Gone by", opensAt: null, closesAt: null },
      { id: "b", startsOn: "2026-11-08", endsOn: "2026-11-09", note: "Diwali", opensAt: null, closesAt: null },
      { id: "c", startsOn: "2026-11-10", endsOn: "2026-11-10", note: null, opensAt: "10:00", closesAt: "14:00" },
    ],
    announcement: null,
  } as const;

  it("sends the holidays still ahead, with a reason only when given and hours only for a half day", () => {
    const built = buildAddedProfile({ profile: null, facts, services: [], products: [], today: "2026-10-10" });
    expect(built.closures).toEqual([
      { startsOn: "2026-11-08", endsOn: "2026-11-09", reason: "Diwali" },
      { startsOn: "2026-11-10", endsOn: "2026-11-10", opens: "10:00", closes: "14:00" },
    ]);
  });

  it("leaves the field out when none is ahead", () => {
    expect(buildAddedProfile({ profile: null, facts, services: [], products: [], today: "2026-12-01" })).not.toHaveProperty("closures");
  });
});

describe("socialsOf", () => {
  it("keeps https links on each network's own domain", () => {
    expect(
      socialsOf({
        instagramUrl: "https://www.instagram.com/smile.dental/",
        facebookUrl: "https://facebook.com/smiledental",
        linkedinUrl: "https://in.linkedin.com/company/smile-dental",
      }),
    ).toEqual({
      instagram: "https://www.instagram.com/smile.dental/",
      facebook: "https://facebook.com/smiledental",
      linkedin: "https://in.linkedin.com/company/smile-dental",
    });
  });

  it("drops a link that is blank, not https or on another site", () => {
    expect(
      socialsOf({ instagramUrl: "  ", facebookUrl: "http://facebook.com/x", linkedinUrl: "https://evil.example/linkedin.com" }),
    ).toEqual({});
    expect(socialsOf({ instagramUrl: "https://notinstagram.com/x" })).toEqual({});
    expect(socialsOf(null)).toEqual({});
  });
});

describe("an added business's email in the feed", () => {
  const facts = { timeZone: "Asia/Kolkata", hours: [], closures: [], announcement: null } as const;
  const profile = { email: " hello@gentledental.in " } as never;

  it("sends the owner's email, trimmed, and leaves the field out when there is none", () => {
    expect(buildAddedProfile({ profile, facts, services: [], products: [], today: "2026-10-10" }).email).toBe("hello@gentledental.in");
    expect(buildAddedProfile({ profile: null, facts, services: [], products: [], today: "2026-10-10" })).not.toHaveProperty("email");
  });
});

describe("an added business's GST number in the feed", () => {
  const facts = { timeZone: "Asia/Kolkata", hours: [], closures: [], announcement: null } as const;
  const input = { facts, services: [], products: [], today: "2026-10-12" } as const;

  it("sends the owner's GST number, trimmed", () => {
    const profile = { gstNumber: " 27AAPFU0939F1ZV " } as never;
    expect(buildAddedProfile({ ...input, profile }).gstNumber).toBe("27AAPFU0939F1ZV");
  });

  it("leaves the field out when there is no number, a blank one, or no profile", () => {
    expect(buildAddedProfile({ ...input, profile: { gstNumber: null } as never })).not.toHaveProperty("gstNumber");
    expect(buildAddedProfile({ ...input, profile: { gstNumber: "   " } as never })).not.toHaveProperty("gstNumber");
    expect(buildAddedProfile({ ...input, profile: null })).not.toHaveProperty("gstNumber");
  });
});
