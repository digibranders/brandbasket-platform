import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertDirectoryEnquiry, type NewDirectoryEnquiry } from "./queries/directory";
import { countNewLeads, readListingLeads, setLeadReplied } from "./queries/directory-leads";
import type { DirectoryRef } from "./queries/directory-refs";
import { directoryEnquiries } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

// Businesses with no place id yet, named by their listing keys; directory-by-place.integration.test.ts reads by id.
const DENTIST: DirectoryRef = { placeId: null, listingKey: "dentists/thane/naupada/smile-dental" };
const OTHER: DirectoryRef = { placeId: null, listingKey: "dentists/thane/naupada/another-clinic" };
const NOW = new Date("2026-10-01T10:00:00.000Z");
const WEEK_START = new Date("2026-09-24T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const ENQUIRY: Extract<NewDirectoryEnquiry, { kind: "business" }> = {
  kind: "business",
  business: DENTIST,
  businessName: "Smile Dental",
  serviceLabel: "Dentists",
  areaLabel: "Naupada",
  name: "Ravi Kumar",
  phone: "+919811111111",
  message: "Do you do braces?",
};

let dbs: TestDatabases;

/** Saves an enquiry to `business` dated `daysAgo` days before NOW, and returns its id. */
async function enquiryDaysAgo(daysAgo: number, business = DENTIST, name = `Visitor ${daysAgo}`): Promise<string> {
  const id = await insertDirectoryEnquiry(dbs.staff.db, { ...ENQUIRY, business, name });
  await dbs.staff.db
    .update(directoryEnquiries)
    .set({ createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS) })
    .where(eq(directoryEnquiries.id, id));
  return id;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("readListingLeads", () => {
  it("is empty, with nothing counted, for a business nobody has enquired about", async () => {
    await enquiryDaysAgo(1, OTHER);
    expect(await readListingLeads(dbs.staff.db, DENTIST, { limit: 25, offset: 0, since: WEEK_START })).toEqual({
      leads: [],
      total: 0,
      sinceCount: 0,
      byCategory: [],
      replyCounts: { all: 0, new: 0, replied: 0 },
      businessSinceCount: 0,
    });
  });

  it("lists the business's own leads newest first, and counts all of them and the week's", async () => {
    const old = await enquiryDaysAgo(30);
    const lastWeek = await enquiryDaysAgo(6);
    const today = await enquiryDaysAgo(0);
    await enquiryDaysAgo(0, OTHER);

    const page = await readListingLeads(dbs.staff.db, DENTIST, { limit: 25, offset: 0, since: WEEK_START });
    expect(page.leads.map((lead) => lead.id)).toEqual([today, lastWeek, old]);
    expect(page.leads[0]).toMatchObject({ name: "Visitor 0", phone: ENQUIRY.phone, message: ENQUIRY.message });
    expect(page.total).toBe(3);
    expect(page.sinceCount).toBe(2);
  });

  it("has no cap: every lead can be read, a page at a time", async () => {
    const ids: string[] = [];
    for (let daysAgo = 0; daysAgo < 7; daysAgo += 1) ids.push(await enquiryDaysAgo(daysAgo));

    const first = await readListingLeads(dbs.staff.db, DENTIST, { limit: 3, offset: 0, since: WEEK_START });
    const second = await readListingLeads(dbs.staff.db, DENTIST, { limit: 3, offset: 3, since: WEEK_START });
    const last = await readListingLeads(dbs.staff.db, DENTIST, { limit: 3, offset: 6, since: WEEK_START });

    expect([...first.leads, ...second.leads, ...last.leads].map((lead) => lead.id)).toEqual(ids);
    expect(last.leads).toHaveLength(1);
    expect(first.total).toBe(7);
  });

  it("leaves top-list requests out: they name no business", async () => {
    await insertDirectoryEnquiry(dbs.staff.db, {
      kind: "top_list",
      business: null,
      businessName: null,
      serviceLabel: "Dentists",
      areaLabel: "Naupada",
      name: "List Asker",
      phone: ENQUIRY.phone,
      message: null,
    });
    expect((await readListingLeads(dbs.staff.db, DENTIST, { limit: 25, offset: 0, since: WEEK_START })).total).toBe(0);
  });

  it("names the category page each lead came through, and counts leads per category", async () => {
    await enquiryDaysAgo(0);
    await enquiryDaysAgo(1);
    for (const [days, serviceLabel] of [[2, "Cosmetic Dentists"], [10, "Cosmetic Dentists"], [3, "Emergency Dentists"]] as const) {
      const id = await insertDirectoryEnquiry(dbs.staff.db, { ...ENQUIRY, serviceLabel, name: `Visitor ${serviceLabel} ${days}` });
      await dbs.staff.db
        .update(directoryEnquiries)
        .set({ createdAt: new Date(NOW.getTime() - days * DAY_MS) })
        .where(eq(directoryEnquiries.id, id));
    }
    await enquiryDaysAgo(0, OTHER);

    const all = await readListingLeads(dbs.staff.db, DENTIST, { limit: 25, offset: 0, since: WEEK_START });
    expect(all.total).toBe(5);
    expect(all.byCategory).toEqual([
      { serviceLabel: "Cosmetic Dentists", total: 2, sinceCount: 1 },
      { serviceLabel: "Dentists", total: 2, sinceCount: 2 },
      { serviceLabel: "Emergency Dentists", total: 1, sinceCount: 1 },
    ]);
    expect(all.leads.map((lead) => lead.serviceLabel)).toContain("Emergency Dentists");

    const cosmetic = await readListingLeads(dbs.staff.db, DENTIST, { limit: 25, offset: 0, since: WEEK_START, serviceLabel: "Cosmetic Dentists" });
    expect(cosmetic.total).toBe(2);
    expect(cosmetic.sinceCount).toBe(1);
    expect(cosmetic.leads.every((lead) => lead.serviceLabel === "Cosmetic Dentists")).toBe(true);
    // The breakdown is the whole business's, whichever category is being read.
    expect(cosmetic.byCategory).toEqual(all.byCategory);
  });
});

describe("replying to leads", () => {
  const READ = { limit: 25, offset: 0, since: WEEK_START } as const;

  it("counts every lead as new until the owner marks it replied", async () => {
    await enquiryDaysAgo(1);
    await enquiryDaysAgo(2);
    await enquiryDaysAgo(0, OTHER);

    expect(await countNewLeads(dbs.staff.db, DENTIST)).toBe(2);
    const page = await readListingLeads(dbs.staff.db, DENTIST, READ);
    expect(page.replyCounts).toEqual({ all: 2, new: 2, replied: 0 });
    expect(page.leads.every((lead) => lead.ownerRepliedAt === null)).toBe(true);
  });

  it("marks one lead replied, and the lists and counts follow", async () => {
    const first = await enquiryDaysAgo(1);
    const second = await enquiryDaysAgo(2);

    expect(await setLeadReplied(dbs.staff.db, DENTIST, first, true, NOW)).toBe(true);

    expect(await countNewLeads(dbs.staff.db, DENTIST)).toBe(1);
    const fresh = await readListingLeads(dbs.staff.db, DENTIST, { ...READ, reply: "new" });
    expect(fresh.leads.map((lead) => lead.id)).toEqual([second]);
    expect(fresh.total).toBe(1);
    const done = await readListingLeads(dbs.staff.db, DENTIST, { ...READ, reply: "replied" });
    expect(done.leads.map((lead) => lead.id)).toEqual([first]);
    expect(done.leads[0]?.ownerRepliedAt).toEqual(NOW);
    // The tabs' counts do not depend on which tab is open.
    expect(done.replyCounts).toEqual({ all: 2, new: 1, replied: 1 });
    expect(done.businessSinceCount).toBe(2);
  });

  it("keeps the first time when a lead is marked replied again, and lets it go back to new", async () => {
    const id = await enquiryDaysAgo(1);
    await setLeadReplied(dbs.staff.db, DENTIST, id, true, NOW);
    await setLeadReplied(dbs.staff.db, DENTIST, id, true, new Date(NOW.getTime() + DAY_MS));
    const marked = await readListingLeads(dbs.staff.db, DENTIST, READ);
    expect(marked.leads[0]?.ownerRepliedAt).toEqual(NOW);

    expect(await setLeadReplied(dbs.staff.db, DENTIST, id, false, NOW)).toBe(true);
    expect(await countNewLeads(dbs.staff.db, DENTIST)).toBe(1);
  });

  it("leaves another business's lead alone, and says nothing was found", async () => {
    const theirs = await enquiryDaysAgo(1, OTHER);
    expect(await setLeadReplied(dbs.staff.db, DENTIST, theirs, true, NOW)).toBe(false);
    expect(await countNewLeads(dbs.staff.db, OTHER)).toBe(1);
  });
});
