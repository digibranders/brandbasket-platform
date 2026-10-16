import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertBusiness } from "./queries/onboarding";
import { findSetupCallBooking, recordSetupCallBooking } from "./queries/setup-calls";
import { users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER_A, name: "Meera Shah", email: `${OWNER_A}@example.com`, emailVerified: true },
    { id: OWNER_B, name: "Arjun Rao", email: `${OWNER_B}@example.com`, emailVerified: true },
  ]);
  businessA = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Aster Physio", "INR"))).id;
  businessB = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
});

const NOW = new Date("2026-10-16T08:00:00.000Z");

describe("a business's booked kickoff call", () => {
  it("is null until the business books one", async () => {
    const booking = await withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, (tx) => findSetupCallBooking(tx, businessA));
    expect(booking).toBeNull();
  });

  it("is written and read back by the business itself", async () => {
    await withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, (tx) =>
      recordSetupCallBooking(tx, { businessId: businessA, inviteeUri: "https://api.calendly.com/scheduled_events/E1/invitees/I1", now: NOW }),
    );
    const booking = await withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, (tx) => findSetupCallBooking(tx, businessA));
    expect(booking?.bookedAt).toEqual(NOW);
    expect(booking?.inviteeUri).toBe("https://api.calendly.com/scheduled_events/E1/invitees/I1");
    expect(booking?.startsAt).toBeNull();
  });

  it("is invisible to another business, and another business cannot write one for it", async () => {
    await withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, (tx) =>
      recordSetupCallBooking(tx, { businessId: businessA, inviteeUri: null, now: NOW }),
    );
    const seenByB = await withTenantScope(dbs.app.db, { userId: OWNER_B, businessId: businessB }, (tx) => findSetupCallBooking(tx, businessA));
    expect(seenByB).toBeNull();
    await expect(
      withTenantScope(dbs.app.db, { userId: OWNER_B, businessId: businessB }, (tx) =>
        recordSetupCallBooking(tx, { businessId: businessA, inviteeUri: null, now: NOW }),
      ),
    ).rejects.toThrow();
  });

  it("is replaced by a later booking, so there is one row a business", async () => {
    const later = new Date("2026-10-17T08:00:00.000Z");
    await withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, async (tx) => {
      await recordSetupCallBooking(tx, { businessId: businessA, inviteeUri: "https://api.calendly.com/a", now: NOW });
      await recordSetupCallBooking(tx, { businessId: businessA, inviteeUri: "https://api.calendly.com/b", now: later });
    });
    const booking = await withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, (tx) => findSetupCallBooking(tx, businessA));
    expect(booking?.bookedAt).toEqual(later);
    expect(booking?.inviteeUri).toBe("https://api.calendly.com/b");
  });
});
