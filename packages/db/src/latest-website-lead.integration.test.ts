import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findLatestWebsiteLeadAt } from "./queries/leads";
import { leads } from "./schema";
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

const lead = (source: "website_form" | "pricing_page" | "signup", createdAt: Date) => ({ name: "A", businessName: "B", email: "a@b.in", source, createdAt });

describe("findLatestWebsiteLeadAt", () => {
  it("is null with no website enquiries, and the newest website or pricing page enquiry otherwise", async () => {
    await dbs.owner.db.insert(leads).values(lead("signup", new Date("2026-11-30T10:00:00.000Z")));
    expect(await findLatestWebsiteLeadAt(dbs.staff.db)).toBeNull();
    await dbs.owner.db.insert(leads).values([lead("website_form", new Date("2026-11-28T10:00:00.000Z")), lead("pricing_page", new Date("2026-11-29T10:00:00.000Z"))]);
    expect(await findLatestWebsiteLeadAt(dbs.staff.db)).toEqual(new Date("2026-11-29T10:00:00.000Z"));
  });
});
