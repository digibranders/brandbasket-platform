import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearSiteSetting, findSiteSetting, findSiteSettingWithEditor, saveSiteSetting } from "./queries/site-settings";
import { users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF = "staff-settings";
const KEY = "setup_call_url";
const FIRST = new Date("2026-10-15T10:00:00.000Z");
const LATER = new Date("2026-10-16T10:00:00.000Z");

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: STAFF, name: "Staff", email: "staff@example.com" });
});

describe("site settings", () => {
  it("is not set until someone sets it", async () => {
    expect(await findSiteSetting(dbs.staff.db, KEY)).toBeNull();
    expect(await findSiteSettingWithEditor(dbs.staff.db, KEY)).toBeNull();
  });

  it("keeps what was saved, and who saved it and when", async () => {
    await saveSiteSetting(dbs.staff.db, { key: KEY, value: "https://calendly.com/fynix/a", staffUserId: STAFF, now: FIRST });

    expect(await findSiteSettingWithEditor(dbs.staff.db, KEY)).toMatchObject({
      key: KEY,
      value: "https://calendly.com/fynix/a",
      updatedByEmail: "staff@example.com",
      updatedAt: FIRST,
    });
  });

  it("replaces the value when it is saved again, in the same row", async () => {
    await saveSiteSetting(dbs.staff.db, { key: KEY, value: "https://calendly.com/fynix/a", staffUserId: STAFF, now: FIRST });
    await saveSiteSetting(dbs.staff.db, { key: KEY, value: "https://cal.com/fynix/b", staffUserId: STAFF, now: LATER });

    expect(await findSiteSetting(dbs.staff.db, KEY)).toMatchObject({ value: "https://cal.com/fynix/b", updatedAt: LATER });
  });

  it("is not set any more once it is cleared, and clearing nothing is harmless", async () => {
    await saveSiteSetting(dbs.staff.db, { key: KEY, value: "https://calendly.com/fynix/a", staffUserId: STAFF, now: FIRST });
    await clearSiteSetting(dbs.staff.db, KEY);
    await clearSiteSetting(dbs.staff.db, KEY);

    expect(await findSiteSetting(dbs.staff.db, KEY)).toBeNull();
  });

  it("is closed to a customer's connection: only staff read or write settings", async () => {
    await saveSiteSetting(dbs.staff.db, { key: KEY, value: "https://calendly.com/fynix/a", staffUserId: STAFF, now: FIRST });

    await expect(findSiteSetting(dbs.app.db, KEY)).rejects.toThrow();
  });
});
