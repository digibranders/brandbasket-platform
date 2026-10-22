import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLead, markLeadPaidForBusiness, recordSignupLead } from "./queries/leads";
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

async function addBusiness(slug: string, currency: "INR" | "USD" = "INR"): Promise<string> {
  const rows = await dbs.owner.db.insert(businesses).values({ slug, name: slug, currency }).returning({ id: businesses.id });
  return rows[0]?.id ?? "";
}

async function allLeads(): Promise<(typeof leads.$inferSelect)[]> {
  return dbs.owner.db.select().from(leads);
}

describe("recordSignupLead", () => {
  it("lists a customer who signed up on their own as a lead with an account and no payment", async () => {
    const businessId = await addBusiness("glow-dental");
    await recordSignupLead(dbs.staff.db, { name: "Rohan Mehta", businessName: "Glow Dental", email: "Rohan@Example.test", businessId, plan: "managed" });

    const rows = await allLeads();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Rohan Mehta",
      businessName: "Glow Dental",
      email: "rohan@example.test",
      status: "account_created",
      businessId,
      currency: "INR",
      phone: null,
    });
    expect(rows[0]?.notes).toContain("Managed Website");
  });

  it("becomes paid when the first payment is confirmed, the same way a staff-made lead does", async () => {
    const businessId = await addBusiness("glow-dental");
    await recordSignupLead(dbs.staff.db, { name: "Rohan", businessName: "Glow", email: "r@example.test", businessId, plan: "managed" });
    expect(await markLeadPaidForBusiness(dbs.staff.db, businessId)).toBe(1);
    expect((await allLeads())[0]?.status).toBe("paid");
  });

  it("takes over a lead that already exists for the same email and has no account, instead of adding a second", async () => {
    await createLead(dbs.staff.db, {
      name: "Rohan",
      businessName: "Glow",
      email: "r@example.test",
      phone: "+919876543210",
      businessType: null,
      currency: "INR",
      message: "Please call me",
    });
    const businessId = await addBusiness("glow-dental");
    await recordSignupLead(dbs.staff.db, { name: "Rohan Mehta", businessName: "Glow Dental", email: "R@example.test", businessId, plan: "managed" });

    const rows = await allLeads();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "account_created", businessId, phone: "+919876543210", message: "Please call me" });
  });

  it("does not take a lead from a different customer whose account already exists", async () => {
    const first = await addBusiness("first-business");
    await recordSignupLead(dbs.staff.db, { name: "A", businessName: "First", email: "same@example.test", businessId: first, plan: "managed" });
    const second = await addBusiness("second-business");
    await recordSignupLead(dbs.staff.db, { name: "B", businessName: "Second", email: "same@example.test", businessId: second, plan: "managed" });

    const rows = await allLeads();
    expect(rows.map((row) => row.businessId).sort()).toEqual([first, second].sort());
  });

  it("is a no-op the second time for the same business", async () => {
    const businessId = await addBusiness("glow-dental");
    const lead = { name: "Rohan", businessName: "Glow", email: "r@example.test", businessId, plan: "managed" as const };
    await recordSignupLead(dbs.staff.db, lead);
    await recordSignupLead(dbs.staff.db, lead);
    expect(await allLeads()).toHaveLength(1);
    expect((await dbs.owner.db.select().from(leads).where(eq(leads.businessId, businessId)))).toHaveLength(1);
  });
});
