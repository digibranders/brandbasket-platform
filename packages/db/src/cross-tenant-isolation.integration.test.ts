import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findChargeForBusiness,
  findEnquiry,
  listDeliverablesForBusiness,
  listEnquiries,
  listSentReports,
  listWebsitePages,
} from "./index";
import {
  activityEvents,
  businesses,
  businessMembers,
  businessModules,
  businessProfiles,
  changeRequests,
  charges,
  deliverables,
  domains,
  enquiries,
  patients,
  payments,
  plans,
  projects,
  reportDocuments,
  subscriptions,
  supportTickets,
  teamCalls,
  users,
  websitePages,
} from "./schema";
import {
  assertCustomerAppRole,
  CUSTOMER_ROLE,
  withTenantScope,
  withUserScope,
} from "./scope";
import {
  openTestDatabases,
  resetTestDatabase,
  seedPlansFromMigrations,
  type TestDatabases,
} from "./testing";

const USER_A = "user-a";
const USER_B = "user-b";

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

let projectA = "";
let projectB = "";
let enquiryA = "";
let enquiryB = "";
let deliverableA = "";
let deliverableB = "";
let ticketA = "";
let ticketB = "";
let changeA = "";
let changeB = "";
let chargeA = "";
let chargeB = "";
let callA = "";
let callB = "";
let patientA = "";
let patientB = "";
let reportDocA = "";
let reportDocB = "";

function idForSlug(rows: readonly { id: string; slug: string }[], slug: string): string {
  const row = rows.find((candidate) => candidate.slug === slug);
  if (row === undefined) throw new Error(`Seed business "${slug}" was not inserted`);
  return row.id;
}

beforeAll(async () => {
  dbs = openTestDatabases();
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);

  // 1. Users
  await dbs.staff.db.insert(users).values([
    { id: USER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: USER_B, name: "Ben Ortiz", email: "ben@example.com" },
  ]);

  // 2. Businesses
  const insertedBusinesses = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "business-a", name: "Business A", websiteUrl: "https://a.example.com" },
      { slug: "business-b", name: "Business B", websiteUrl: "https://b.example.com" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = idForSlug(insertedBusinesses, "business-a");
  businessB = idForSlug(insertedBusinesses, "business-b");

  // 3. Memberships
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: USER_A, role: "owner" },
    { businessId: businessB, userId: USER_B, role: "owner" },
  ]);

  // 4. Modules (enable appointments for both)
  await dbs.staff.db.insert(businessModules).values([
    { businessId: businessA, module: "appointments", enabled: true, changedByUserId: USER_A },
    { businessId: businessB, module: "appointments", enabled: true, changedByUserId: USER_B },
  ]);

  // 5. Active plan
  const [activePlan] = await dbs.staff.db.select().from(plans).limit(1);
  if (activePlan === undefined) throw new Error("Seed plan was not inserted");

  // 6. Projects
  const insertedProjects = await dbs.staff.db
    .insert(projects)
    .values([
      { businessId: businessA, kind: "initial_build", status: "submitted" },
      { businessId: businessB, kind: "initial_build", status: "submitted" },
    ])
    .returning({ id: projects.id, businessId: projects.businessId });
  projectA = insertedProjects.find((p) => p.businessId === businessA)!.id;
  projectB = insertedProjects.find((p) => p.businessId === businessB)!.id;

  // 7. Enquiries
  const insertedEnquiries = await dbs.staff.db
    .insert(enquiries)
    .values([
      { businessId: businessA, kind: "form", name: "Lead A", email: "lead-a@example.com", receivedAt: new Date(), sourceRef: "ref-a" },
      { businessId: businessB, kind: "form", name: "Lead B", email: "lead-b@example.com", receivedAt: new Date(), sourceRef: "ref-b" },
    ])
    .returning({ id: enquiries.id, businessId: enquiries.businessId });
  enquiryA = insertedEnquiries.find((e) => e.businessId === businessA)!.id;
  enquiryB = insertedEnquiries.find((e) => e.businessId === businessB)!.id;

  // 8. Deliverables
  const insertedDeliverables = await dbs.staff.db
    .insert(deliverables)
    .values([
      { businessId: businessA, service: "social", kind: "post", title: "Post A", dueOn: "2026-11-20", status: "awaiting_approval" },
      { businessId: businessB, service: "social", kind: "post", title: "Post B", dueOn: "2026-11-20", status: "awaiting_approval" },
    ])
    .returning({ id: deliverables.id, businessId: deliverables.businessId });
  deliverableA = insertedDeliverables.find((d) => d.businessId === businessA)!.id;
  deliverableB = insertedDeliverables.find((d) => d.businessId === businessB)!.id;

  // 9. Support Tickets
  const insertedTickets = await dbs.staff.db
    .insert(supportTickets)
    .values([
      { displayRef: "TICK-A", requesterUserId: USER_A, businessId: businessA, category: "support", subject: "Question A", submissionKey: "sub-key-a123", submissionHash: "a".repeat(64) },
      { displayRef: "TICK-B", requesterUserId: USER_B, businessId: businessB, category: "support", subject: "Question B", submissionKey: "sub-key-b123", submissionHash: "b".repeat(64) },
    ])
    .returning({ id: supportTickets.id, businessId: supportTickets.businessId });
  ticketA = insertedTickets.find((t) => t.businessId === businessA)!.id;
  ticketB = insertedTickets.find((t) => t.businessId === businessB)!.id;

  // 10. Change Requests
  const insertedChanges = await dbs.owner.db
    .insert(changeRequests)
    .values([
      { ticketId: ticketA, businessId: businessA, kind: "website", state: "requested", coverage: "undecided" },
      { ticketId: ticketB, businessId: businessB, kind: "website", state: "requested", coverage: "undecided" },
    ])
    .returning({ id: changeRequests.id, businessId: changeRequests.businessId });
  changeA = insertedChanges.find((c) => c.businessId === businessA)!.id;
  changeB = insertedChanges.find((c) => c.businessId === businessB)!.id;

  // 11. Subscriptions & Payments
  await dbs.staff.db.insert(subscriptions).values([
    { businessId: businessA, planId: activePlan.id, provider: "fake", providerSubscriptionId: "sub-a", status: "active" },
    { businessId: businessB, planId: activePlan.id, provider: "fake", providerSubscriptionId: "sub-b", status: "active" },
  ]);
  await dbs.staff.db.insert(payments).values([
    { businessId: businessA, provider: "fake", providerPaymentId: "pay-a", kind: "initial", amountCents: 1000, currency: activePlan.currency, status: "captured" },
    { businessId: businessB, provider: "fake", providerPaymentId: "pay-b", kind: "initial", amountCents: 1000, currency: activePlan.currency, status: "captured" },
  ]);

  // 12. Charges
  const insertedCharges = await dbs.staff.db
    .insert(charges)
    .values([
      { businessId: businessA, kind: "blog_posts", description: "Unlock A", quantity: 1, unitAmountCents: 500, taxRateBasisPoints: 1800, amountCents: 500, currency: activePlan.currency, status: "open" },
      { businessId: businessB, kind: "blog_posts", description: "Unlock B", quantity: 1, unitAmountCents: 500, taxRateBasisPoints: 1800, amountCents: 500, currency: activePlan.currency, status: "open" },
    ])
    .returning({ id: charges.id, businessId: charges.businessId });
  chargeA = insertedCharges.find((c) => c.businessId === businessA)!.id;
  chargeB = insertedCharges.find((c) => c.businessId === businessB)!.id;

  // 13. Website Pages
  await dbs.staff.db.insert(websitePages).values([
    { businessId: businessA, url: "https://a.example.com/about", lastSeenAt: new Date() },
    { businessId: businessB, url: "https://b.example.com/about", lastSeenAt: new Date() },
  ]);

  // 14. Team Calls
  const now = new Date();
  const later = new Date(now.getTime() + 30 * 60 * 1000);
  const insertedCalls = await dbs.staff.db
    .insert(teamCalls)
    .values([
      { businessId: businessA, reason: "website", startsAt: now, endsAt: later, status: "booked" },
      { businessId: businessB, reason: "website", startsAt: now, endsAt: later, status: "booked" },
    ])
    .returning({ id: teamCalls.id, businessId: teamCalls.businessId });
  callA = insertedCalls.find((c) => c.businessId === businessA)!.id;
  callB = insertedCalls.find((c) => c.businessId === businessB)!.id;

  // 15. Business Profiles
  await dbs.staff.db.insert(businessProfiles).values([
    { businessId: businessA, displayName: "Display A" },
    { businessId: businessB, displayName: "Display B" },
  ]);

  // 16. Domains
  await dbs.staff.db.insert(domains).values([
    { businessId: businessA, hostname: "a.example.com", isPrimary: true },
    { businessId: businessB, hostname: "b.example.com", isPrimary: true },
  ]);

  // 17. Patients
  const insertedPatients = await dbs.staff.db
    .insert(patients)
    .values([
      { businessId: businessA, name: "Patient A", phone: "+919800000001" },
      { businessId: businessB, name: "Patient B", phone: "+919800000002" },
    ])
    .returning({ id: patients.id, businessId: patients.businessId });
  patientA = insertedPatients.find((p) => p.businessId === businessA)!.id;
  patientB = insertedPatients.find((p) => p.businessId === businessB)!.id;

  // 18. Activity Events
  await dbs.staff.db.insert(activityEvents).values([
    { businessId: businessA, service: "website", title: "Activity A", occurredAt: new Date() },
    { businessId: businessB, service: "website", title: "Activity B", occurredAt: new Date() },
  ]);

  // 19. Report Documents
  const insertedReports = await dbs.staff.db
    .insert(reportDocuments)
    .values([
      { businessId: businessA, service: "website", month: "2026-10-01", state: "draft", content: { metric: 10 } },
      { businessId: businessB, service: "website", month: "2026-10-01", state: "draft", content: { metric: 20 } },
    ])
    .returning({ id: reportDocuments.id, businessId: reportDocuments.businessId });
  reportDocA = insertedReports.find((r) => r.businessId === businessA)!.id;
  reportDocB = insertedReports.find((r) => r.businessId === businessB)!.id;

  const reviewTime = new Date();
  await dbs.staff.db
    .update(reportDocuments)
    .set({ state: "approved", reviewedAt: reviewTime })
    .where(inArray(reportDocuments.id, [reportDocA, reportDocB]));
  await dbs.staff.db
    .update(reportDocuments)
    .set({ state: "sent", sentAt: reviewTime })
    .where(inArray(reportDocuments.id, [reportDocA, reportDocB]));
});

describe("assertCustomerAppRole on live database connections", () => {
  it("passes when connecting through the app connection pool", async () => {
    await expect(assertCustomerAppRole(dbs.app.db)).resolves.toBeUndefined();
  });

  it("fails loudly when connecting through the staff connection pool", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(assertCustomerAppRole(dbs.staff.db)).rejects.toThrow(
      'Customer database connection role mismatch: expected role "bb_app", but connected as "bb_staff". Failing startup.',
    );
    expect(errorSpy).toHaveBeenCalled();
  });

  it("fails loudly when connecting through the owner connection pool", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(assertCustomerAppRole(dbs.owner.db)).rejects.toThrow(
      /Customer database connection role mismatch/,
    );
  });
});

describe("cross-tenant isolation on main tables via withTenantScope", () => {
  it("enforces tenant boundary on businesses table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const allVisible = await tx.select({ id: businesses.id }).from(businesses);
      expect(allVisible.map((b) => b.id)).toEqual([businessA]);

      const specificOther = await tx.select().from(businesses).where(eq(businesses.id, businessB));
      expect(specificOther).toEqual([]);
    });
  });

  it("enforces tenant boundary on business_members table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const allVisible = await tx.select().from(businessMembers);
      expect(allVisible.map((m) => m.businessId)).toEqual([businessA]);

      const otherMembers = await tx.select().from(businessMembers).where(eq(businessMembers.businessId, businessB));
      expect(otherMembers).toEqual([]);
    });
  });

  it("enforces tenant boundary on projects table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const allVisible = await tx.select({ id: projects.id }).from(projects);
      expect(allVisible.map((p) => p.id)).toEqual([projectA]);

      const specificOther = await tx.select().from(projects).where(eq(projects.id, projectB));
      expect(specificOther).toEqual([]);
    });
  });

  it("enforces tenant boundary on enquiries table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const allVisible = await tx.select({ id: enquiries.id }).from(enquiries);
      expect(allVisible.map((e) => e.id)).toEqual([enquiryA]);

      const specificOther = await tx.select().from(enquiries).where(eq(enquiries.id, enquiryB));
      expect(specificOther).toEqual([]);

      // Test query functions
      const foundOther = await findEnquiry(tx, enquiryB);
      expect(foundOther).toBeNull();

      const listed = await listEnquiries(tx, { limit: 10 });
      expect(listed.map((e) => e.id)).toEqual([enquiryA]);
    });
  });

  it("enforces tenant boundary on deliverables table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const allVisible = await tx.select({ id: deliverables.id }).from(deliverables);
      expect(allVisible.map((d) => d.id)).toEqual([deliverableA]);

      const specificOther = await tx.select().from(deliverables).where(eq(deliverables.id, deliverableB));
      expect(specificOther).toEqual([]);

      const queryForOther = await listDeliverablesForBusiness(tx, businessB, {
        service: "social",
        from: "2020-01-01",
        to: "2030-01-01",
      });
      expect(queryForOther).toEqual([]);
    });
  });

  it("enforces tenant boundary on change_requests table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const allVisible = await tx.select({ id: changeRequests.id }).from(changeRequests);
      expect(allVisible.map((c) => c.id)).toEqual([changeA]);

      const specificOther = await tx.select().from(changeRequests).where(eq(changeRequests.id, changeB));
      expect(specificOther).toEqual([]);
    });
  });

  it("enforces tenant boundary on subscriptions and payments tables", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const subs = await tx.select({ businessId: subscriptions.businessId }).from(subscriptions);
      expect(subs.map((s) => s.businessId)).toEqual([businessA]);

      const otherSubs = await tx.select().from(subscriptions).where(eq(subscriptions.businessId, businessB));
      expect(otherSubs).toEqual([]);

      const pays = await tx.select({ businessId: payments.businessId }).from(payments);
      expect(pays.map((p) => p.businessId)).toEqual([businessA]);

      const otherPays = await tx.select().from(payments).where(eq(payments.businessId, businessB));
      expect(otherPays).toEqual([]);
    });
  });

  it("enforces tenant boundary on charges table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const allVisible = await tx.select({ id: charges.id }).from(charges);
      expect(allVisible.map((c) => c.id)).toEqual([chargeA]);

      const specificOther = await tx.select().from(charges).where(eq(charges.id, chargeB));
      expect(specificOther).toEqual([]);

      const foundOther = await findChargeForBusiness(tx, businessA, chargeB);
      expect(foundOther).toBeNull();
    });
  });

  it("enforces tenant boundary on website_pages table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const pages = await listWebsitePages(tx);
      expect(pages.map((p) => p.businessId)).toEqual([businessA]);

      const otherPages = await tx.select().from(websitePages).where(eq(websitePages.businessId, businessB));
      expect(otherPages).toEqual([]);
    });
  });

  it("enforces tenant boundary on team_calls table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const calls = await tx.select({ id: teamCalls.id }).from(teamCalls);
      expect(calls.map((c) => c.id)).toEqual([callA]);

      const otherCalls = await tx.select().from(teamCalls).where(eq(teamCalls.id, callB));
      expect(otherCalls).toEqual([]);
    });
  });

  it("enforces tenant boundary on business_profiles and domains tables", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const profiles = await tx.select({ businessId: businessProfiles.businessId }).from(businessProfiles);
      expect(profiles.map((p) => p.businessId)).toEqual([businessA]);

      const otherProfiles = await tx.select().from(businessProfiles).where(eq(businessProfiles.businessId, businessB));
      expect(otherProfiles).toEqual([]);

      const dms = await tx.select({ businessId: domains.businessId }).from(domains);
      expect(dms.map((d) => d.businessId)).toEqual([businessA]);

      const otherDomains = await tx.select().from(domains).where(eq(domains.businessId, businessB));
      expect(otherDomains).toEqual([]);
    });
  });

  it("enforces tenant boundary on patients table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const pts = await tx.select({ id: patients.id }).from(patients);
      expect(pts.map((p) => p.id)).toEqual([patientA]);

      const otherPatients = await tx.select().from(patients).where(eq(patients.id, patientB));
      expect(otherPatients).toEqual([]);
    });
  });

  it("enforces tenant boundary on activity_events table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const events = await tx.select({ businessId: activityEvents.businessId }).from(activityEvents);
      expect(events.map((e) => e.businessId)).toEqual([businessA]);

      const otherEvents = await tx.select().from(activityEvents).where(eq(activityEvents.businessId, businessB));
      expect(otherEvents).toEqual([]);
    });
  });

  it("enforces tenant boundary on report_documents table", async () => {
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: businessA }, async (tx) => {
      const docs = await tx.select({ id: reportDocuments.id }).from(reportDocuments);
      expect(docs.map((d) => d.id)).toEqual([reportDocA]);

      const otherDocs = await tx.select().from(reportDocuments).where(eq(reportDocuments.id, reportDocB));
      expect(otherDocs).toEqual([]);

      const sentForOther = await listSentReports(tx, businessB);
      expect(sentForOther).toEqual([]);
    });
  });
});

describe("cross-tenant isolation on user-scoped support tickets", () => {
  it("enforces user boundary on support_tickets table via withUserScope", async () => {
    await withUserScope(dbs.app.db, USER_A, async (tx) => {
      const tickets = await tx.select({ id: supportTickets.id }).from(supportTickets);
      expect(tickets.map((t) => t.id)).toEqual([ticketA]);

      const otherTickets = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketB));
      expect(otherTickets).toEqual([]);
    });
  });
});

describe("unscoped queries on customer app connection return no tenant rows", () => {
  it("returns zero rows from tenant tables when no scope is set", async () => {
    expect(await dbs.app.db.select().from(businesses)).toEqual([]);
    expect(await dbs.app.db.select().from(projects)).toEqual([]);
    expect(await dbs.app.db.select().from(enquiries)).toEqual([]);
    expect(await dbs.app.db.select().from(deliverables)).toEqual([]);
    expect(await dbs.app.db.select().from(subscriptions)).toEqual([]);
    expect(await dbs.app.db.select().from(payments)).toEqual([]);
    expect(await dbs.app.db.select().from(charges)).toEqual([]);
    expect(await dbs.app.db.select().from(teamCalls)).toEqual([]);
    expect(await dbs.app.db.select().from(patients)).toEqual([]);
    expect(await dbs.app.db.select().from(reportDocuments)).toEqual([]);
  });
});
