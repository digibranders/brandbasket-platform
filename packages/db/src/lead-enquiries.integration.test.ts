import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSetupInvite } from "./queries/invites";
import { assignLead, countLeadsToContact, createLead, findLead, listLeadInvites, recordSignupLead } from "./queries/leads";
import { businesses, leads, staffMembers, users } from "./schema";
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

function eqId(id: string): ReturnType<typeof eq> {
  return eq(leads.id, id);
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

async function addStaff(id: string): Promise<string> {
  await dbs.owner.db.insert(users).values({ id, name: "Riya Kapoor", email: `${id}@brandbasket.test` });
  await dbs.owner.db.insert(staffMembers).values({ userId: id });
  return id;
}

describe("assignLead", () => {
  it("gives an enquiry to a staff member and takes it back", async () => {
    const staffId = await addStaff("staff-riya");
    const { id } = await createLead(dbs.staff.db, BASE);
    expect(await assignLead(dbs.staff.db, id, staffId)).toBe(true);
    expect((await findLead(dbs.staff.db, id))?.assignedStaffId).toBe(staffId);
    expect(await assignLead(dbs.staff.db, id, null)).toBe(true);
    expect((await findLead(dbs.staff.db, id))?.assignedStaffId).toBeNull();
  });

  it("says so when the lead does not exist", async () => {
    expect(await assignLead(dbs.staff.db, "01920000-0000-7000-8000-000000000999", null)).toBe(false);
  });
});

describe("countLeadsToContact", () => {
  it("counts new enquiries and accounts opened without paying, nothing else", async () => {
    await createLead(dbs.staff.db, BASE);
    const talking = await createLead(dbs.staff.db, { ...BASE, email: "b@example.test" });
    await dbs.owner.db.update(leads).set({ status: "call_done" }).where(eqId(talking.id));
    const businessId = await addBusiness("glow-dental");
    await recordSignupLead(dbs.staff.db, { name: "Rohan", businessName: "Glow", email: "rohan@example.test", businessId, plan: "managed" });
    expect(await countLeadsToContact(dbs.staff.db)).toBe(2);
  });
});

describe("listLeadInvites", () => {
  it("lists every setup link sent for a lead, newest first", async () => {
    const staffId = await addStaff("staff-riya");
    const { id } = await createLead(dbs.staff.db, BASE);
    const first = await createSetupInvite(dbs.staff.db, { leadId: id, email: BASE.email, businessName: BASE.businessName, createdByStaffId: staffId, expiresInDays: 7 });
    const second = await createSetupInvite(dbs.staff.db, { leadId: id, email: BASE.email, businessName: BASE.businessName, createdByStaffId: staffId, expiresInDays: 7 });
    const invites = await listLeadInvites(dbs.staff.db, id);
    expect(invites.map((invite) => invite.id)).toEqual([second.invite.id, first.invite.id]);
    expect(invites[0]).toMatchObject({ redeemedAt: null, revokedAt: null });
  });
});

