import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listStaffAccessPage, STAFF_ACCESS_PAGE_SIZE } from "./queries/staff-access-log";
import { staffAccessLog, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const RIYA = "staff-riya";
const ROHIT = "staff-rohit";
const CLIENT = "0198f2c0-0000-7000-8000-0000000000aa";
let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.owner.db.insert(users).values([
    { id: RIYA, name: "Riya", email: "riya@brandbasket.in", emailVerified: true },
    { id: ROHIT, name: "Rohit", email: "rohit@brandbasket.in", emailVerified: true },
  ]);
  await dbs.owner.db.insert(staffAccessLog).values([
    { staffUserId: RIYA, action: "client.view", businessId: CLIENT, createdAt: new Date("2026-11-28T10:00:00.000Z") },
    { staffUserId: ROHIT, action: "client.view", businessId: CLIENT, createdAt: new Date("2026-11-29T10:00:00.000Z") },
    { staffUserId: ROHIT, action: "lead.view", createdAt: new Date("2026-11-30T10:00:00.000Z") },
  ]);
});

describe("listStaffAccessPage", () => {
  it("filters by person, action, client and dates, newest first", async () => {
    expect((await listStaffAccessPage(dbs.staff.db, { staffUserId: ROHIT }, 0)).rows.map((row) => row.action)).toEqual(["lead.view", "client.view"]);
    expect((await listStaffAccessPage(dbs.staff.db, { action: "client.view" }, 0)).rows).toHaveLength(2);
    expect((await listStaffAccessPage(dbs.staff.db, { businessId: CLIENT }, 0)).rows).toHaveLength(2);
    const window = { from: new Date("2026-11-29T00:00:00.000Z"), to: new Date("2026-11-30T00:00:00.000Z") };
    expect((await listStaffAccessPage(dbs.staff.db, window, 0)).rows.map((row) => row.staffUserId)).toEqual([ROHIT]);
  });

  it("pages in fixed steps and says when there is more", async () => {
    const extra = Array.from({ length: STAFF_ACCESS_PAGE_SIZE }, (_, index) => ({
      staffUserId: RIYA,
      action: "search.run",
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, index)),
    }));
    await dbs.owner.db.insert(staffAccessLog).values(extra);
    const first = await listStaffAccessPage(dbs.staff.db, {}, 0);
    expect(first.rows).toHaveLength(STAFF_ACCESS_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    const second = await listStaffAccessPage(dbs.staff.db, {}, 1);
    expect(second.rows).toHaveLength(3);
    expect(second.hasMore).toBe(false);
  });
});
