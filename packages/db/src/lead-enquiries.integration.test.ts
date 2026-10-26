import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLead, findLead, recordSignupLead } from "./queries/leads";
import { businesses, leads } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

const BASE = { name: "Neha Joshi", businessName: "Green Leaf Cafe", email: "neha@example.test", phone: null, businessType: null, currency: "INR", message: "Menu and Instagram, please." } as const;

async function addBusiness(slug: string): Promise<string> {
  const rows = await dbs.owner.db.insert(businesses).values({ slug, name: slug, currency: "INR" }).returning({ id: businesses.id });
  return rows[0]?.id ?? "";
}

describe("lead source, plans, city and page", () => {
  it("keeps what the website sent, through the insert-only public role", async () => {
    const { id } = await createLead(dbs.publicRole.db, { ...BASE, source: "pricing_page", plans: ["website", "growth"], city: "Pune", page: "/contact" });
    const lead = await findLead(dbs.staff.db, id);
    expect(lead).toMatchObject({ source: "pricing_page", plans: ["website", "growth"], city: "Pune", page: "/contact", assignedStaffId: null });
  });

  it("calls a lead with no source a website form, with no plans", async () => {
    const { id } = await createLead(dbs.staff.db, BASE);
    expect(await findLead(dbs.staff.db, id)).toMatchObject({ source: "website_form", plans: [], city: null, page: null });
  });

  it("marks an account opened on the dashboard as a sign-up", async () => {
    const businessId = await addBusiness("glow-dental");
    const { id } = await recordSignupLead(dbs.staff.db, { name: "Rohan", businessName: "Glow", email: "rohan@example.test", businessId, plan: "managed" });
    expect((await findLead(dbs.staff.db, id))?.source).toBe("signup");
  });

  it("keeps the original source of a lead a sign-up takes over", async () => {
    await createLead(dbs.staff.db, { ...BASE, email: "rohan@example.test", source: "pricing_page" });
    const businessId = await addBusiness("glow-dental");
    await recordSignupLead(dbs.staff.db, { name: "Rohan", businessName: "Glow", email: "rohan@example.test", businessId, plan: "managed" });
    const rows = await dbs.owner.db.select().from(leads);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "pricing_page", status: "account_created" });
  });
});
