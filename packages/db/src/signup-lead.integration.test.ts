import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLead, listAbandonedSignupLeads, markLeadPaidForBusiness, recordSignupLead, recordSignupReminderSent } from "./queries/leads";
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

  it("keeps the mobile number given on the form, so staff can call", async () => {
    const businessId = await addBusiness("glow-dental");
    await recordSignupLead(dbs.staff.db, { name: "Rohan", businessName: "Glow", email: "r@example.test", businessId, plan: "managed", phone: "+919820011223" });
    expect((await allLeads())[0]?.phone).toBe("+919820011223");
  });

  it("fills a missing number on a lead it takes over, and keeps one the lead already has", async () => {
    await createLead(dbs.staff.db, { name: "A", businessName: "A", email: "a@example.test", phone: null, businessType: null, currency: "INR", message: null });
    await createLead(dbs.staff.db, { name: "B", businessName: "B", email: "b@example.test", phone: "+919876543210", businessType: null, currency: "INR", message: null });
    const first = await addBusiness("a-business");
    const second = await addBusiness("b-business");
    await recordSignupLead(dbs.staff.db, { name: "A", businessName: "A", email: "a@example.test", businessId: first, plan: "managed", phone: "+919820011223" });
    await recordSignupLead(dbs.staff.db, { name: "B", businessName: "B", email: "b@example.test", businessId: second, plan: "managed", phone: "+919820011223" });

    const byEmail = new Map((await allLeads()).map((row) => [row.email, row.phone]));
    expect(byEmail.get("a@example.test")).toBe("+919820011223");
    expect(byEmail.get("b@example.test")).toBe("+919876543210");
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

  describe("abandoned sign-up reminder (D21)", () => {
    it("returns sign-ups older than cutoff that have not received a reminder", async () => {
      const b1 = await addBusiness("dental-one");
      const b2 = await addBusiness("dental-two");
      const b3 = await addBusiness("dental-three");

      await recordSignupLead(dbs.staff.db, { name: "User 1", businessName: "Dental 1", email: "u1@example.test", businessId: b1, plan: "managed" });
      await recordSignupLead(dbs.staff.db, { name: "User 2", businessName: "Dental 2", email: "u2@example.test", businessId: b2, plan: "managed" });
      await recordSignupLead(dbs.staff.db, { name: "User 3", businessName: "Dental 3", email: "u3@example.test", businessId: b3, plan: "managed" });

      const now = new Date("2026-11-14T12:00:00Z");
      const twoDaysAgo = new Date("2026-11-12T12:00:00Z");
      const oneHourAgo = new Date("2026-11-14T11:00:00Z");

      // Backdate b1 and b2
      await dbs.owner.db.update(leads).set({ createdAt: twoDaysAgo }).where(eq(leads.businessId, b1));
      await dbs.owner.db.update(leads).set({ createdAt: twoDaysAgo }).where(eq(leads.businessId, b2));
      // b3 is recent (1 hour ago)
      await dbs.owner.db.update(leads).set({ createdAt: oneHourAgo }).where(eq(leads.businessId, b3));

      // Mark b2 already paid
      await markLeadPaidForBusiness(dbs.staff.db, b2);

      const cutoff = new Date("2026-11-13T12:00:00Z"); // 24 hours before now
      const abandoned = await listAbandonedSignupLeads(dbs.staff.db, { cutoff });

      expect(abandoned).toHaveLength(1);
      expect(abandoned[0]?.businessId).toBe(b1);
      expect(abandoned[0]?.signupReminderSentAt).toBeNull();
    });

    it("records reminder sent timestamp so a reminder is sent only once", async () => {
      const b1 = await addBusiness("clinic-one");
      await recordSignupLead(dbs.staff.db, { name: "Dr Smith", businessName: "Clinic 1", email: "dr@example.test", businessId: b1, plan: "managed" });

      const twoDaysAgo = new Date("2026-11-12T12:00:00Z");
      await dbs.owner.db.update(leads).set({ createdAt: twoDaysAgo }).where(eq(leads.businessId, b1));

      const cutoff = new Date("2026-11-13T12:00:00Z");
      const initial = await listAbandonedSignupLeads(dbs.staff.db, { cutoff });
      expect(initial).toHaveLength(1);
      const leadId = initial[0]!.id;

      const sentTime = new Date("2026-11-14T08:00:00Z");
      await recordSignupReminderSent(dbs.staff.db, leadId, sentTime);

      const afterSent = await listAbandonedSignupLeads(dbs.staff.db, { cutoff });
      expect(afterSent).toHaveLength(0);

      const row = (await allLeads())[0];
      expect(row?.signupReminderSentAt).toEqual(sentTime);
    });
  });
});
