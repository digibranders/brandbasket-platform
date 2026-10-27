import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openAccountClosure, restoreAccountClosure, summariseOpenClosures } from "./queries/account-closures";
import { businesses, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

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

async function closing(userId: string, slug: string, eraseAfter: Date): Promise<void> {
  await dbs.owner.db.insert(users).values({ id: userId, name: userId, email: `${userId}@example.com`, emailVerified: true });
  const [row] = await dbs.owner.db.insert(businesses).values({ slug, name: slug, currency: "INR" }).returning({ id: businesses.id });
  await openAccountClosure(dbs.staff.db, { userId, businessId: row?.id ?? "", now: new Date("2026-11-01T00:00:00.000Z"), eraseAfter });
}

describe("summariseOpenClosures", () => {
  it("counts accounts waiting to be erased and gives the next erase date", async () => {
    expect(await summariseOpenClosures(dbs.staff.db)).toEqual({ count: 0, nextEraseAfter: null });
    await closing("anil", "lakeview", new Date("2026-12-12T00:00:00.000Z"));
    await closing("sara", "bloom", new Date("2026-12-05T00:00:00.000Z"));
    await restoreAccountClosure(dbs.staff.db, { userId: "sara", now: new Date("2026-11-02T00:00:00.000Z") });
    expect(await summariseOpenClosures(dbs.staff.db)).toEqual({ count: 1, nextEraseAfter: new Date("2026-12-12T00:00:00.000Z") });
  });
});
