import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertBusiness } from "./queries/onboarding";
import { getSignupAttribution, recordSignupAttribution } from "./queries/signup-attribution";
import { businessMembers, signupAttribution, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "sa-owner";

let dbs: TestDatabases;
let businessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: OWNER, name: OWNER, email: `${OWNER}@example.com`, emailVerified: true });
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Sai Dental Care", "INR"))).id;
  await dbs.staff.db.insert(businessMembers).values({ businessId, userId: OWNER, role: "owner" });
});

const staff = () => dbs.staff.db;

/** Postgres reports a missing privilege as 42501 and a refused check as 23514; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

const FIRST = { utmSource: "meta", utmMedium: "paid_social", utmCampaign: "diwali", fbclid: "IwAR0", landingPath: "/start", consentMeasurement: true, consentAdvertising: false };

describe("signup_attribution", () => {
  it("keeps the first ad a business came from, once", async () => {
    expect(await recordSignupAttribution(staff(), businessId, FIRST)).toBe(true);
    expect(await recordSignupAttribution(staff(), businessId, { utmSource: "google", consentMeasurement: false, consentAdvertising: false })).toBe(false);
    const stored = await getSignupAttribution(staff(), businessId);
    expect(stored).toMatchObject({ businessId, utmSource: "meta", utmCampaign: "diwali", fbclid: "IwAR0", gclid: null, consentMeasurement: true, consentAdvertising: false });
    expect(stored?.capturedAt).toBeInstanceOf(Date);
  });

  it("is null for a business that did not come from an ad", async () => {
    expect(await getSignupAttribution(staff(), businessId)).toBeNull();
  });

  it("is private to staff: the owner of the business cannot read or write it", async () => {
    await recordSignupAttribution(staff(), businessId, FIRST);
    const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
    expect(await sqlState(() => asOwner((tx) => tx.select().from(signupAttribution)))).toBe("42501");
    expect(await sqlState(() => asOwner((tx) => tx.insert(signupAttribution).values({ businessId, consentMeasurement: false, consentAdvertising: false })))).toBe("42501");
  });

  it("refuses values longer than the token can carry", async () => {
    expect(await sqlState(() => recordSignupAttribution(staff(), businessId, { utmSource: "x".repeat(121), consentMeasurement: false, consentAdvertising: false }))).toBe("23514");
    expect(await sqlState(() => recordSignupAttribution(staff(), businessId, { landingPath: "no-slash", consentMeasurement: false, consentAdvertising: false }))).toBe("23514");
  });
});
