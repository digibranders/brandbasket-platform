import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listSetupCallsBetween } from "./queries/setup-calls";
import { businesses, setupCallBookings } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

// Monday 30 November 2026 in India.
const DAY_START = new Date("2026-11-29T18:30:00.000Z");
const DAY_END = new Date("2026-11-30T18:30:00.000Z");

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

async function business(slug: string, name: string): Promise<string> {
  const [row] = await dbs.staff.db.insert(businesses).values({ slug, name, currency: "INR" }).returning({ id: businesses.id });
  if (row === undefined) throw new Error("No business was inserted");
  return row.id;
}

describe("listSetupCallsBetween", () => {
  it("lists calls that start in the range, earliest first, with the business name", async () => {
    const cafe = await business("green-leaf", "Green Leaf Cafe");
    const optician = await business("kumar-opticals", "Kumar Opticals");
    const tomorrow = await business("om-sweets", "Om Sweets");
    const untimed = await business("anand-bakery", "Anand Bakery");
    await dbs.staff.db.insert(setupCallBookings).values([
      { businessId: optician, startsAt: new Date("2026-11-30T08:30:00.000Z"), endsAt: new Date("2026-11-30T09:00:00.000Z") },
      { businessId: cafe, startsAt: new Date("2026-11-30T06:00:00.000Z"), endsAt: new Date("2026-11-30T06:30:00.000Z") },
      { businessId: tomorrow, startsAt: DAY_END, endsAt: new Date("2026-11-30T19:00:00.000Z") },
      { businessId: untimed },
    ]);

    expect(await listSetupCallsBetween(dbs.staff.db, DAY_START, DAY_END)).toEqual([
      { businessId: cafe, businessName: "Green Leaf Cafe", startsAt: new Date("2026-11-30T06:00:00.000Z"), endsAt: new Date("2026-11-30T06:30:00.000Z") },
      { businessId: optician, businessName: "Kumar Opticals", startsAt: new Date("2026-11-30T08:30:00.000Z"), endsAt: new Date("2026-11-30T09:00:00.000Z") },
    ]);
  });
});
