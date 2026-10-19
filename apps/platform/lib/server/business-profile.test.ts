import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addBusinessFaq,
  addBusinessListing,
  addBusinessService,
  findClaimForBusiness,
  findDirectoryProfile,
  findPincode,
  listBusinessFaqs,
  listBusinessServices,
  setClaimWebsite,
  setPageTabs,
  setTrustInformation,
  turnOnPageTab,
  updateAddedBusinessListing,
  withTenantScope,
  type BusinessFaq,
  type BusinessService,
  type Database,
  type DirectoryClaim,
  type DirectoryProfile,
  type PincodeRecord,
} from "@brandbasket/db";
import type { BusinessListingInput } from "@/lib/business-listing-form";
import { getAppDb, getStaffDb } from "./db";
import { lookupPincode, saveOwnFaq, saveOwnListing, saveOwnPageTabs, saveOwnService, saveOwnTrust } from "./business-profile";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  addBusinessFaq: vi.fn(),
  addBusinessListing: vi.fn(),
  addBusinessService: vi.fn(),
  listBusinessFaqs: vi.fn(),
  listBusinessServices: vi.fn(),
  setTrustInformation: vi.fn(),
  turnOnPageTab: vi.fn(),
  findClaimForBusiness: vi.fn(),
  findDirectoryProfile: vi.fn(),
  findPincode: vi.fn(),
  setClaimWebsite: vi.fn(),
  setPageTabs: vi.fn(),
  updateAddedBusinessListing: vi.fn(),
  withTenantScope: vi.fn(),
}));

const APP_DB = { app: true } as unknown as Database;
const STAFF_DB = { staff: true } as unknown as Database;
const TENANT = { userId: "user-1", businessId: "biz-1", businessName: "Smile Dental", role: "owner" } as const;
const CUSTOMER = { tenant: TENANT };

const PROFILE: DirectoryProfile = {
  businessId: TENANT.businessId,
  streetAddress: "12 Gokhale Road",
  phone: "+919876543210",
  whatsapp: null,
  mapsUrl: null,
  pin: null,
  websiteUrl: null,
  about: null,
  youtubeVideoId: null,
  establishedYear: null,
  serviceArea: null,
  email: null,
  gstNumber: null,
  directionsNote: null,
  instagramUrl: null,
  facebookUrl: null,
  linkedinUrl: null,
  holidayHours: null,
  open24x7: false,
  contactOptions: [],
  pageTabs: [],
  servicesLabel: null,
  productsLabel: null,
  paymentMethods: [],
  licences: [],
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

const THANE_PIN: PincodeRecord = {
  pincode: "400602",
  stateCode: "mh",
  districtSlug: "thane",
  districtName: "Thane",
  localities: [{ slug: "naupada", name: "Naupada" }],
};

const SALT_LAKE_PIN: PincodeRecord = {
  pincode: "700091",
  stateCode: "wb",
  districtSlug: "north-24-parganas",
  districtName: "North 24 Parganas",
  localities: [
    { slug: "bidhannagar", name: "Bidhannagar" },
    { slug: "salt-lake-sector-v", name: "Salt Lake Sector V" },
  ],
};

const THANE_PICKS: BusinessListingInput = {
  pincode: "400602",
  place: { kind: "area", citySlug: "thane", areaSlug: "naupada" },
  categorySlug: "dentists",
};

const SALT_LAKE_PICKS: BusinessListingInput = {
  pincode: "700091",
  place: { kind: "locality", localitySlug: "salt-lake-sector-v" },
  categorySlug: "dentists",
};

function pendingAddedClaim(): DirectoryClaim {
  return {
    id: "c1",
    businessId: TENANT.businessId,
    listingKey: "dentists/thane/naupada/smile-dental",
    placeId: "k7m2q9a",
    businessName: "Smile Dental Clinic",
    phone: "+919876543210",
    origin: "added",
    streetAddress: null,
    pincode: null,
    localityName: null,
    websiteUrl: null,
    status: "pending",
    decidedAt: null,
    publishedAt: null,
    tagline: null,
    taglineApproved: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppDb).mockReturnValue(APP_DB);
  vi.mocked(getStaffDb).mockReturnValue(STAFF_DB);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work({} as never));
  vi.mocked(findClaimForBusiness).mockResolvedValue(null);
  vi.mocked(findDirectoryProfile).mockResolvedValue(PROFILE);
  vi.mocked(findPincode).mockResolvedValue(THANE_PIN);
  vi.mocked(addBusinessListing).mockResolvedValue({ kind: "added", claimId: "c1", listingKey: "dentists/thane/naupada/smile-dental" });
  vi.mocked(updateAddedBusinessListing).mockResolvedValue({ kind: "updated", listingKey: "dentists/thane/naupada/smile-dental" });
});

describe("saveOwnListing", () => {
  it("adds a Thane business at its area, in Maharashtra, with no PIN of its own", async () => {
    expect(await saveOwnListing(CUSTOMER, THANE_PICKS)).toEqual({ kind: "saved", added: true });
    expect(findPincode).toHaveBeenCalledWith(APP_DB, "400602");
    expect(addBusinessListing).toHaveBeenCalledWith(
      STAFF_DB,
      {
        businessId: TENANT.businessId,
        stateCode: "mh",
        categorySlug: "dentists",
        citySlug: "thane",
        areaSlug: "naupada",
        slug: "smile-dental",
        businessName: "Smile Dental",
        streetAddress: PROFILE.streetAddress,
        phone: PROFILE.phone,
        postal: null,
      },
      expect.any(Date),
    );
  });

  it("takes an area without a PIN, in Maharashtra, without looking one up", async () => {
    vi.mocked(findClaimForBusiness).mockResolvedValue(pendingAddedClaim());
    expect(await saveOwnListing(CUSTOMER, { ...THANE_PICKS, pincode: null, categorySlug: "clinics" })).toEqual({ kind: "saved", added: false });
    expect(findPincode).not.toHaveBeenCalled();
    expect(updateAddedBusinessListing).toHaveBeenCalledWith(
      STAFF_DB,
      expect.objectContaining({ stateCode: "mh", citySlug: "thane", areaSlug: "naupada", categorySlug: "clinics", postal: null }),
      expect.any(Date),
    );
  });

  it("adds an elsewhere business under <state>-<district> at its locality, with its PIN", async () => {
    vi.mocked(findPincode).mockResolvedValue(SALT_LAKE_PIN);
    expect(await saveOwnListing(CUSTOMER, SALT_LAKE_PICKS)).toEqual({ kind: "saved", added: true });
    expect(addBusinessListing).toHaveBeenCalledWith(
      STAFF_DB,
      expect.objectContaining({
        stateCode: "wb",
        categorySlug: "dentists",
        citySlug: "wb-north-24-parganas",
        areaSlug: "salt-lake-sector-v",
        postal: { pincode: "700091", localityName: "Salt Lake Sector V" },
      }),
      expect.any(Date),
    );
  });

  it("refuses a PIN India Post does not have, on the PIN", async () => {
    vi.mocked(findPincode).mockResolvedValue(null);
    expect(await saveOwnListing(CUSTOMER, THANE_PICKS)).toEqual({
      kind: "refused",
      reason: "pin",
      message: "We couldn't find that PIN code. Check it, or email us and we'll add your business.",
    });
    expect(addBusinessListing).not.toHaveBeenCalled();
  });

  it.each([
    ["an area for a PIN outside the opened districts", SALT_LAKE_PIN, THANE_PICKS],
    ["a locality for a PIN in an opened district", THANE_PIN, { ...SALT_LAKE_PICKS, pincode: "400602" }],
    ["a locality the PIN does not cover", SALT_LAKE_PIN, { ...SALT_LAKE_PICKS, place: { kind: "locality", localitySlug: "naupada" } }],
  ] as const)("refuses %s, on the place", async (_name, record, picks) => {
    vi.mocked(findPincode).mockResolvedValue(record);
    expect(await saveOwnListing(CUSTOMER, picks)).toEqual({
      kind: "refused",
      reason: "place",
      message: "That area isn't in this PIN code. Pick it again.",
    });
    expect(addBusinessListing).not.toHaveBeenCalled();
    expect(updateAddedBusinessListing).not.toHaveBeenCalled();
  });

  it("asks for Details first, before looking up the PIN", async () => {
    vi.mocked(findDirectoryProfile).mockResolvedValue(null);
    expect(await saveOwnListing(CUSTOMER, THANE_PICKS)).toMatchObject({ kind: "refused", reason: "no-details" });
    expect(findPincode).not.toHaveBeenCalled();
  });

  it("moves a pending added business to the resolved place, under the claim's name", async () => {
    vi.mocked(findClaimForBusiness).mockResolvedValue(pendingAddedClaim());
    vi.mocked(findPincode).mockResolvedValue(SALT_LAKE_PIN);
    expect(await saveOwnListing(CUSTOMER, SALT_LAKE_PICKS)).toEqual({ kind: "saved", added: false });
    expect(updateAddedBusinessListing).toHaveBeenCalledWith(
      STAFF_DB,
      expect.objectContaining({
        stateCode: "wb",
        citySlug: "wb-north-24-parganas",
        areaSlug: "salt-lake-sector-v",
        slug: "smile-dental-clinic",
        businessName: "Smile Dental Clinic",
        postal: { pincode: "700091", localityName: "Salt Lake Sector V" },
      }),
      expect.any(Date),
    );
    expect(addBusinessListing).not.toHaveBeenCalled();
  });

  it("lets a published added business move its district, area and category", async () => {
    vi.mocked(findClaimForBusiness).mockResolvedValue({ ...pendingAddedClaim(), status: "approved" });
    vi.mocked(updateAddedBusinessListing).mockResolvedValue({ kind: "updated", listingKey: "dentists/thane/kolshet/smile-dental" });
    expect(await saveOwnListing(CUSTOMER, THANE_PICKS)).toEqual({ kind: "saved", added: false });
    expect(updateAddedBusinessListing).toHaveBeenCalled();
  });

  it.each([
    ["a claimed listing", { origin: "claimed", status: "pending" }],
    ["a claimed listing staff approved", { origin: "claimed", status: "approved" }],
    ["a business staff turned down", { status: "rejected" }],
  ] as const)("keeps %s where it is, without looking up the PIN", async (_name, overrides) => {
    vi.mocked(findClaimForBusiness).mockResolvedValue({ ...pendingAddedClaim(), ...overrides });
    vi.mocked(findPincode).mockResolvedValue(null);
    expect(await saveOwnListing(CUSTOMER, THANE_PICKS)).toEqual({
      kind: "refused",
      reason: "locked",
      message: "Your listing is live, so where it's listed can't be changed here. Ask us for the change.",
    });
    expect(findPincode).not.toHaveBeenCalled();
    expect(updateAddedBusinessListing).not.toHaveBeenCalled();
  });

  it("adds the profile's website to a new listing", async () => {
    vi.mocked(findDirectoryProfile).mockResolvedValue({ ...PROFILE, websiteUrl: "https://smile.example/" });
    await saveOwnListing(CUSTOMER, THANE_PICKS);
    expect(setClaimWebsite).toHaveBeenCalledWith(STAFF_DB, TENANT.businessId, "https://smile.example/");
  });
});

describe("lookupPincode", () => {
  it("looks a PIN up on the customer's connection, spaces dropped", async () => {
    expect(await lookupPincode(" 400 602 ")).toEqual({
      kind: "opened",
      pincode: "400602",
      stateCode: "mh",
      districtSlug: "thane",
      districtName: "Thane",
    });
    expect(findPincode).toHaveBeenCalledWith(APP_DB, "400602");
    expect(getStaffDb).not.toHaveBeenCalled();
  });

  it("offers an elsewhere PIN's localities", async () => {
    vi.mocked(findPincode).mockResolvedValue(SALT_LAKE_PIN);
    expect(await lookupPincode("700091")).toMatchObject({ kind: "elsewhere", stateName: "West Bengal" });
  });

  it("answers not-found for a PIN India Post does not have", async () => {
    vi.mocked(findPincode).mockResolvedValue(null);
    expect(await lookupPincode("999999")).toEqual({ kind: "not-found" });
  });

  it.each([
    ["a number", 400602],
    ["null", null],
    ["undefined", undefined],
    ["an object", { pincode: "400602" }],
    ["an array", ["400602"]],
    ["a string longer than 12 characters", "400602       "],
    ["a string that is not a PIN", "4006"],
  ])("answers not-found, without a lookup, for %s", async (_name, value) => {
    expect(await lookupPincode(value)).toEqual({ kind: "not-found" });
    expect(findPincode).not.toHaveBeenCalled();
  });
});

describe("saveOwnPageTabs", () => {
  const NO_NAMES = { services: null, products: null };

  it("saves the owner's choice on their own business", async () => {
    vi.mocked(setPageTabs).mockResolvedValue(true);
    expect(await saveOwnPageTabs(CUSTOMER, { tabs: ["services", "trust"], labels: NO_NAMES })).toEqual({ kind: "saved" });
    expect(setPageTabs).toHaveBeenCalledWith(
      STAFF_DB,
      expect.objectContaining({ businessId: TENANT.businessId, tabs: ["services", "trust"], servicesLabel: null, productsLabel: null }),
    );
  });

  it("saves the owner's own names for Services and Products with it", async () => {
    vi.mocked(setPageTabs).mockResolvedValue(true);
    expect(await saveOwnPageTabs(CUSTOMER, { tabs: ["services"], labels: { services: "Menu", products: null } })).toEqual({ kind: "saved" });
    expect(setPageTabs).toHaveBeenCalledWith(STAFF_DB, expect.objectContaining({ servicesLabel: "Menu", productsLabel: null }));
  });

  it("is refused, saying why, until the Identity is saved", async () => {
    vi.mocked(setPageTabs).mockResolvedValue(false);
    expect(await saveOwnPageTabs(CUSTOMER, { tabs: [], labels: NO_NAMES })).toEqual({ kind: "refused", message: "Fill in your Identity first, then come back here." });
  });

  it("writes nothing for a business staff have taken down", async () => {
    vi.mocked(findClaimForBusiness).mockResolvedValue({ ...pendingAddedClaim(), status: "rejected" });
    expect((await saveOwnPageTabs(CUSTOMER, { tabs: ["offers"], labels: NO_NAMES })).kind).toBe("refused");
    expect(setPageTabs).not.toHaveBeenCalled();
  });
});

describe("the first of a kind puts its tab on the page", () => {
  const SERVICE = { category: "Cakes", name: "Custom cake", summary: null, description: null, priceInr: 1200, durationMinutes: null, serviceArea: null };
  const one = [{ id: "s1" }] as unknown as readonly BusinessService[];
  const two = [{ id: "s1" }, { id: "s2" }] as unknown as readonly BusinessService[];

  beforeEach(() => {
    vi.mocked(addBusinessService).mockResolvedValue({ kind: "saved", id: "s1" });
    vi.mocked(turnOnPageTab).mockResolvedValue(true);
  });

  it("turns Services on with the first service, and says so", async () => {
    vi.mocked(listBusinessServices).mockResolvedValue(one);
    expect(await saveOwnService(CUSTOMER, null, SERVICE)).toEqual({ kind: "saved", tabOn: "services" });
    expect(turnOnPageTab).toHaveBeenCalledWith(STAFF_DB, expect.objectContaining({ businessId: TENANT.businessId, tab: "services" }));
  });

  it("leaves the tab alone for a second service, so an owner who turned it off keeps it off", async () => {
    vi.mocked(listBusinessServices).mockResolvedValue(two);
    expect(await saveOwnService(CUSTOMER, null, SERVICE)).toEqual({ kind: "saved" });
    expect(turnOnPageTab).not.toHaveBeenCalled();
  });

  it("does not report a tab as turned on when it already was", async () => {
    vi.mocked(listBusinessServices).mockResolvedValue(one);
    vi.mocked(turnOnPageTab).mockResolvedValue(false);
    expect(await saveOwnService(CUSTOMER, null, SERVICE)).toEqual({ kind: "saved" });
  });

  it("turns FAQ on with the first question, and leaves it alone for the second", async () => {
    const faq = { question: "Do you deliver?", answer: "Yes, within 5 km." };
    vi.mocked(addBusinessFaq).mockResolvedValue({ kind: "saved", id: "f1" });
    vi.mocked(listBusinessFaqs).mockResolvedValue([{ id: "f1" }] as unknown as readonly BusinessFaq[]);
    expect(await saveOwnFaq(CUSTOMER, null, faq)).toEqual({ kind: "saved", tabOn: "faq" });
    expect(turnOnPageTab).toHaveBeenCalledWith(STAFF_DB, expect.objectContaining({ businessId: TENANT.businessId, tab: "faq" }));

    vi.mocked(turnOnPageTab).mockClear();
    vi.mocked(listBusinessFaqs).mockResolvedValue([{ id: "f1" }, { id: "f2" }] as unknown as readonly BusinessFaq[]);
    expect(await saveOwnFaq(CUSTOMER, null, faq)).toEqual({ kind: "saved" });
    expect(turnOnPageTab).not.toHaveBeenCalled();
  });

  it("turns Good to know on the first time trust details are given, not when they are edited or cleared", async () => {
    vi.mocked(setTrustInformation).mockResolvedValue(true);
    vi.mocked(findDirectoryProfile).mockResolvedValue({ ...PROFILE, paymentMethods: [], licences: [] });
    expect(await saveOwnTrust(CUSTOMER, { paymentMethods: ["upi"], licences: [] })).toEqual({ kind: "saved", tabOn: "trust" });

    vi.mocked(turnOnPageTab).mockClear();
    vi.mocked(findDirectoryProfile).mockResolvedValue({ ...PROFILE, paymentMethods: ["upi"], licences: [] });
    expect(await saveOwnTrust(CUSTOMER, { paymentMethods: ["cash"], licences: [] })).toEqual({ kind: "saved" });
    vi.mocked(findDirectoryProfile).mockResolvedValue({ ...PROFILE, paymentMethods: [], licences: [] });
    expect(await saveOwnTrust(CUSTOMER, { paymentMethods: [], licences: [] })).toEqual({ kind: "saved" });
    expect(turnOnPageTab).not.toHaveBeenCalled();
  });
});
