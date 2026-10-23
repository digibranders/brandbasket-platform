import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertBusiness } from "./queries/onboarding";
import { findSetupCallBooking, moveSetupCallBooking, recordSetupCallBooking, removeSetupCallBooking } from "./queries/setup-calls";
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

describe("a kickoff call changed from Cal.com's email", () => {
  const OLD = "https://api.cal.com/v2/bookings/old-uid";
  const NEW = "https://api.cal.com/v2/bookings/new-uid";
  const STARTS = new Date("2026-10-26T05:00:00.000Z");
  const ENDS = new Date("2026-10-26T05:30:00.000Z");
  const read = (businessId: string, owner: string) =>
    withTenantScope(dbs.app.db, { userId: owner, businessId }, (tx) => findSetupCallBooking(tx, businessId));

  beforeEach(async () => {
    await withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, (tx) =>
      recordSetupCallBooking(tx, { businessId: businessA, inviteeUri: OLD, now: NOW, startsAt: STARTS, endsAt: ENDS }),
    );
    await withTenantScope(dbs.app.db, { userId: OWNER_B, businessId: businessB }, (tx) =>
      recordSetupCallBooking(tx, { businessId: businessB, inviteeUri: "https://api.cal.com/v2/bookings/other-uid", now: NOW }),
    );
  });

  it("moves to the rescheduled booking and time, found by the booking it replaces", async () => {
    const later = new Date("2026-10-23T11:00:00.000Z");
    const startsAt = new Date("2026-10-27T06:00:00.000Z");
    const endsAt = new Date("2026-10-27T06:30:00.000Z");
    expect(await moveSetupCallBooking(dbs.staff.db, { fromInviteeUri: OLD, toInviteeUri: NEW, startsAt, endsAt, now: later })).toBe(true);
    expect(await read(businessA, OWNER_A)).toMatchObject({ inviteeUri: NEW, startsAt, endsAt, bookedAt: NOW });
    expect((await read(businessB, OWNER_B))?.inviteeUri).toBe("https://api.cal.com/v2/bookings/other-uid");
  });

  it("is forgotten when cancelled, so the dashboard asks for a time again, and only that business's call goes", async () => {
    expect(await removeSetupCallBooking(dbs.staff.db, OLD)).toBe(true);
    expect(await read(businessA, OWNER_A)).toBeNull();
    expect(await read(businessB, OWNER_B)).not.toBeNull();
  });

  it("changes nothing for a booking no business has", async () => {
    expect(await removeSetupCallBooking(dbs.staff.db, "https://api.cal.com/v2/bookings/someone-else")).toBe(false);
    expect(
      await moveSetupCallBooking(dbs.staff.db, { fromInviteeUri: "https://api.cal.com/v2/bookings/someone-else", toInviteeUri: NEW, startsAt: STARTS, endsAt: ENDS, now: NOW }),
    ).toBe(false);
    expect((await read(businessA, OWNER_A))?.inviteeUri).toBe(OLD);
  });
});
