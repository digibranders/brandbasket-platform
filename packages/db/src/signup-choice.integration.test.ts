import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createListingAccountBusiness,
  createUnlistedAccountBusiness,
  findBusinessEntry,
  findClaimForBusiness,
  openMembershipForListingBusiness,
  setListingSignupChoice,
} from "./queries/directory-ads";
import { insertBusiness } from "./queries/onboarding";
import { findBusinessCurrency } from "./queries/tax-invoices";
import { businesses, projects, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-a";
const OTHER = "owner-b";
const LISTING_KEY = "dentists/thane/naupada/smile-dental";

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
    { id: OWNER, name: "Meera Shah", email: `${OWNER}@example.com`, emailVerified: true },
    { id: OTHER, name: "Arjun Rao", email: `${OTHER}@example.com`, emailVerified: true },
  ]);
});

async function projectsOf(businessId: string): Promise<{ readonly kind: string; readonly status: string }[]> {
  return dbs.staff.db.select({ kind: projects.kind, status: projects.status }).from(projects).where(eq(projects.businessId, businessId));
}

describe("the sign-up choice", () => {
  it("is stored with a new business, and its owner can read it", async () => {
    const { businessId } = await createUnlistedAccountBusiness(dbs.staff.db, { userId: OWNER, businessName: "Meera Shah", signupChoice: "managed" });
    const entry = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findBusinessEntry(tx, businessId));
    expect(entry).toEqual({ kind: "listing", signupChoice: "managed" });
  });

  it("is stored with a claimed listing's business too", async () => {
    const { businessId } = await createListingAccountBusiness(dbs.staff.db, {
      userId: OWNER,
      listingKey: LISTING_KEY,
      businessName: "Smile Dental",
      phone: "+919820000011",
      signupChoice: "own_website",
    });
    expect(await findBusinessEntry(dbs.staff.db, businessId)).toEqual({ kind: "listing", signupChoice: "own_website" });
  });

  it("opens the business in the currency the caller chose, rupees when it chose none", async () => {
    const { businessId } = await createUnlistedAccountBusiness(dbs.staff.db, { userId: OWNER, businessName: "Hudson Dental", signupChoice: "managed", currency: "USD" });
    expect(await findBusinessCurrency(dbs.staff.db, businessId)).toBe("USD");
    const other = await createUnlistedAccountBusiness(dbs.staff.db, { userId: OTHER, businessName: "Meera Shah" });
    expect(await findBusinessCurrency(dbs.staff.db, other.businessId)).toBe("INR");
  });

  it("is null when none was given, and for a business nobody can see", async () => {
    const { businessId } = await createUnlistedAccountBusiness(dbs.staff.db, { userId: OWNER, businessName: "Meera Shah" });
    expect(await findBusinessEntry(dbs.staff.db, businessId)).toEqual({ kind: "listing", signupChoice: null });
    expect(await withTenantScope(dbs.app.db, { userId: OTHER, businessId }, (tx) => findBusinessEntry(tx, businessId))).toBeNull();
  });

  it("can be changed for a free listing account, and not for a website client", async () => {
    const { businessId } = await createUnlistedAccountBusiness(dbs.staff.db, { userId: OWNER, businessName: "Meera Shah", signupChoice: "managed" });
    expect(await setListingSignupChoice(dbs.staff.db, businessId, "listing_only")).toBe(true);
    expect(await findBusinessEntry(dbs.staff.db, businessId)).toEqual({ kind: "listing", signupChoice: "listing_only" });

    const client = await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Aster Physio", "INR"));
    expect(await setListingSignupChoice(dbs.staff.db, client.id, "managed")).toBe(false);
    expect(await findBusinessEntry(dbs.staff.db, client.id)).toEqual({ kind: "website", signupChoice: null });
  });
});

describe("openMembershipForListingBusiness", () => {
  it("turns a free listing business into a website client with its setup project, once", async () => {
    const { businessId } = await createListingAccountBusiness(dbs.staff.db, {
      userId: OWNER,
      listingKey: LISTING_KEY,
      businessName: "Smile Dental",
      phone: "+919820000011",
      signupChoice: "managed",
    });

    expect(await dbs.staff.db.transaction((tx) => openMembershipForListingBusiness(tx, businessId))).toEqual({ businessName: "Smile Dental" });
    expect(await findBusinessEntry(dbs.staff.db, businessId)).toEqual({ kind: "website", signupChoice: "managed" });
    expect(await projectsOf(businessId)).toEqual([{ kind: "initial_build", status: "onboarding" }]);
    // Its page on the local directory stays: the claim is left as it was.
    expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({ listingKey: LISTING_KEY });

    expect(await dbs.staff.db.transaction((tx) => openMembershipForListingBusiness(tx, businessId))).toBeNull();
    expect(await projectsOf(businessId)).toHaveLength(1);
  });

  it("leaves a website client alone", async () => {
    const client = await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Aster Physio", "INR"));
    expect(await dbs.staff.db.transaction((tx) => openMembershipForListingBusiness(tx, client.id))).toBeNull();
    expect(await projectsOf(client.id)).toEqual([]);
    const rows = await dbs.staff.db.select({ kind: businesses.kind }).from(businesses).where(eq(businesses.id, client.id));
    expect(rows).toEqual([{ kind: "website" }]);
  });
});
