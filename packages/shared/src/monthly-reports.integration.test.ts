import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityEvents,
  adCampaignSnapshots,
  businessMembers,
  businesses,
  deliverables,
  enquiries,
  findActivePlan,
  getReport,
  listSentReports,
  monthlySnapshots,
  notificationPreferences,
  openCheckoutSubscription,
  reportDocuments,
  siteChecks,
  users,
  withTenantScope,
  type NewBundledAddOn,
  type Plan,
} from "@brandbasket/db";
import { execSql, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { createOutboxTransport, type EmailMessage } from "@brandbasket/email";
import { packageLines } from "./lib/billing/packages";
import { REPORT_CONTENT_VERSION, reportContentSchema } from "./lib/reports/content";
import { activateFirstPayment } from "./server/billing-activation";
import { reportPdfStorageKey } from "./server/media-keys";
import { createLocalMediaStorage, type MediaStorage } from "./server/media-storage";
import { composeMonthlyReports, sendReport, type SendReportDeps } from "./server/monthly-reports";

vi.mock("server-only", () => ({}));

/** The monthly reports end to end against a real database: compose a business's October, review, send, and what the customer then sees. */

const ORIGIN = "https://app.brandbasket.in";
const NOW = new Date("2026-11-04T05:00:00.000Z");
const OWNER = "user-kulkarni";

let dbs: TestDatabases;
let businessId = "";
let storageRoot = "";
let storage: MediaStorage;
const sent: EmailMessage[] = [];

function deps(): SendReportDeps {
  const outbox = createOutboxTransport(dbs.staff.db);
  return {
    storage,
    customerOrigin: ORIGIN,
    send: async (message) => {
      sent.push(message);
      await outbox.send(message);
    },
  };
}

async function addBusiness(): Promise<string> {
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "kulkarni", name: "Kulkarni Physio & Wellness", currency: "INR" }).returning({ id: businesses.id });
  const id = rows[0]?.id ?? "";
  await dbs.owner.db.insert(users).values({ id: OWNER, name: "Meera Kulkarni", email: "meera@kulkarni.example", emailVerified: true });
  await dbs.owner.db.insert(businessMembers).values({ businessId: id, userId: OWNER, role: "owner" });
  await dbs.owner.db.insert(users).values({ id: "staff-1", name: "Staff", email: "staff@example.test", emailVerified: true });
  return id;
}

async function buyAllThree(plan: Plan): Promise<void> {
  const lines: NewBundledAddOn[] = packageLines({ services: ["managed-website", "digital-growth", "local-seo-aeo"], forfeited: false }, plan.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
  }));
  const subscription = await openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"k".repeat(24)}`,
    bundledAddOns: lines,
    replacing: null,
    now: new Date("2026-09-01T05:00:00.000Z"),
  });
  await dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, { businessId, subscriptionId: subscription.id, plan, provider: "fake", providerPaymentId: "fake_pay_kulkarni", paidAt: new Date("2026-09-01T05:00:00.000Z") }),
  );
}

async function markPublished(titles: readonly string[]): Promise<void> {
  await execSql(dbs.owner, "alter table deliverables disable trigger deliverables_guard");
  try {
    const quoted = titles.map((title) => `'${title.replaceAll("'", "''")}'`).join(", ");
    await execSql(dbs.owner, `update deliverables set status = 'published', published_at = due_on::timestamptz, approved_at = case when kind = 'post' then due_on::timestamptz end, approved_by_user_id = case when kind = 'post' then '${OWNER}' end where business_id = '${businessId}' and title in (${quoted})`);
  } finally {
    await execSql(dbs.owner, "alter table deliverables enable trigger deliverables_guard");
  }
}

/** October 2026 records for the business: checks, enquiries, staff-entered figures, work done. */
async function addOctober(): Promise<void> {
  const check = (day: number, status: "up" | "down", extra: Partial<typeof siteChecks.$inferInsert> = {}) => ({
    businessId,
    checkedAt: new Date(`2026-10-${String(day).padStart(2, "0")}T06:00:00.000Z`),
    url: "https://kulkarnipt.example/",
    status,
    httpStatus: status === "up" ? 200 : 503,
    responseMs: 180,
    ...extra,
  });
  await dbs.owner.db.insert(siteChecks).values([
    ...Array.from({ length: 19 }, (_, index) => check(index + 1, "up")),
    check(20, "down"),
    check(29, "up", { sslExpiresAt: new Date("2027-01-12T00:00:00.000Z"), phoneSpeedScore: 82, phoneLcpMs: 2100 }),
    // A check from November belongs to November's report.
    { ...check(1, "up"), checkedAt: new Date("2026-11-01T06:00:00.000Z") },
  ]);
  const enquiry = (kind: "form" | "call_tap" | "whatsapp_tap" | "chat", day: string, n: number) => ({
    businessId,
    kind,
    receivedAt: new Date(`${day}T08:00:00.000Z`),
    sourceRef: `${kind}:${day}:${n}`,
  });
  await dbs.owner.db.insert(enquiries).values([
    // September: 2 forms and 1 call. October: 4 forms and 3 calls. No chat and no WhatsApp tap yet: those are not measured.
    enquiry("form", "2026-09-10", 1),
    enquiry("form", "2026-09-11", 2),
    enquiry("call_tap", "2026-09-12", 3),
    ...[1, 2, 3, 4].map((n) => enquiry("form", `2026-10-0${n}`, n)),
    ...[5, 6, 7].map((n) => enquiry("call_tap", `2026-10-0${n}`, n)),
    // 1 November, 02:00 in India is still 31 October in UTC: it must land in November.
    { ...enquiry("form", "2026-10-31", 99), receivedAt: new Date("2026-10-31T19:30:00.000Z") },
  ]);
  await dbs.owner.db.insert(monthlySnapshots).values([
    { businessId, service: "social", month: "2026-10-01", reach: 12400, followers: 1830, profileVisits: null },
    { businessId, service: "search", month: "2026-10-01", keywordsPageOne: 18, keywordsPageOnePrev: 15 },
  ]);
  await dbs.owner.db.insert(adCampaignSnapshots).values([
    { businessId, month: "2026-10-01", name: "Back pain clinic", platform: "meta", objective: "Leads", spendCents: 300000, leads: 11, enteredByStaffId: "staff-1" },
    { businessId, month: "2026-10-01", name: "Sports injury", platform: "google", objective: "Calls", spendCents: 150000, leads: 7, enteredByStaffId: "staff-1" },
  ]);
  const work = (kind: "post" | "page" | "listing", dueOn: string, title: string) => ({
    businessId,
    service: kind === "post" ? ("social" as const) : ("search" as const),
    kind,
    dueOn,
    title,
    ...(kind === "post" ? { caption: "Caption" } : {}),
  });
  await dbs.owner.db.insert(deliverables).values([
    work("post", "2026-10-02", "Diwali offer"),
    work("post", "2026-10-09", "Stretching tips"),
    work("post", "2026-10-28", "Winter care"),
    work("page", "2026-10-06", "Back pain treatment"),
    work("listing", "2026-10-21", "Google profile hours"),
  ]);
  // The database only lets a deliverable reach published through its approval steps; the test needs the end state, not the walk.
  await markPublished(["Diwali offer", "Stretching tips", "Back pain treatment", "Google profile hours"]);
  await dbs.owner.db.insert(activityEvents).values({ businessId, service: "website", title: "Updated the opening hours", occurredAt: new Date("2026-10-20T07:00:00.000Z") });
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR services plan was seeded");
  businessId = await addBusiness();
  await buyAllThree(plan);
  await addOctober();
  storageRoot = await mkdtemp(path.join(tmpdir(), "bb-reports-"));
  storage = createLocalMediaStorage(storageRoot);
  sent.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(storageRoot, { recursive: true, force: true });
});

const drafts = () => dbs.staff.db.select().from(reportDocuments);

describe("composeMonthlyReports", () => {
  it("writes a draft for each bought service from the business's own records, and nothing is sent to the customer", async () => {
    const summary = await composeMonthlyReports(dbs.staff.db, { month: "2026-10", now: NOW });
    expect(summary.results.map((result) => [result.service, result.outcome])).toEqual([
      ["website", "composed"],
      ["social", "composed"],
      ["search", "composed"],
    ]);
    const rows = await drafts();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.state === "draft" && row.month === "2026-10-01" && row.contentVersion === REPORT_CONTENT_VERSION)).toBe(true);

    const website = reportContentSchema.parse(rows.find((row) => row.service === "website")?.content);
    expect(website.figures).toEqual([
      { label: "Online in October", value: "95.24% of 21 checks" },
      { label: "Enquiries from your website in October", value: "7 (4 more than September)" },
      { label: "Website forms in October", value: "4" },
      { label: "Website call taps in October", value: "3" },
      { label: "Speed on phones, 29 Oct 2026", value: "82 out of 100" },
      { label: "Secure connection valid until", value: "12 Jan 2027" },
    ]);
    expect(website.whatWeDid).toEqual(["20 Oct 2026: Updated the opening hours"]);

    const social = reportContentSchema.parse(rows.find((row) => row.service === "social")?.content);
    expect(social.headline).toBe("We published 2 posts for you in October. Your ads brought 18 enquiries.");
    expect(social.figures).toContainEqual({ label: "Ad spend in October", value: "₹4,500" });
    expect(social.figures).toContainEqual({ label: "Cost of one ad enquiry", value: "₹250" });
    expect(social.figures).toContainEqual({ label: "Posts published in October", value: "2 of 3 planned" });

    const search = reportContentSchema.parse(rows.find((row) => row.service === "search")?.content);
    expect(search.figures).toContainEqual({ label: "Keywords on page one of Google in October", value: "18 (3 more than September)" });
    expect(JSON.stringify(rows.map((row) => row.content))).not.toMatch(/[–—]/);

    const asCustomer = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => listSentReports(tx, businessId));
    expect(asCustomer).toEqual([]);
  });

  it("writes nothing on a dry run, and leaves out a service with nothing measured", async () => {
    const dry = await composeMonthlyReports(dbs.staff.db, { month: "2026-10", now: NOW, dryRun: true });
    expect(dry.results.map((result) => result.outcome)).toEqual(["composed", "composed", "composed"]);
    expect(await drafts()).toHaveLength(0);

    const empty = await composeMonthlyReports(dbs.staff.db, { month: "2026-06", now: NOW });
    expect(empty.results.map((result) => result.outcome)).toEqual(["nothing-measured", "nothing-measured", "nothing-measured"]);
    expect(await drafts()).toHaveLength(0);
  });

  it("rewrites a draft from the latest records but never an approved or sent report", async () => {
    await composeMonthlyReports(dbs.staff.db, { month: "2026-10", now: NOW });
    await dbs.owner.db.insert(deliverables).values({ businessId, service: "search", kind: "page", dueOn: "2026-10-30", title: "Knee pain page" });
    await markPublished(["Knee pain page"]);
    const again = await composeMonthlyReports(dbs.staff.db, { month: "2026-10", now: NOW });
    expect(again.results.map((result) => result.outcome)).toEqual(["composed", "composed", "composed"]);
    const search = (await drafts()).find((row) => row.service === "search");
    expect(reportContentSchema.parse(search?.content).figures).toContainEqual({ label: "Pages we improved in October", value: "2" });

    await sendReport(dbs.staff.db, deps(), { reportId: search?.id ?? "", staffId: "staff-1", now: NOW });
    const frozen = await composeMonthlyReports(dbs.staff.db, { month: "2026-10", now: NOW });
    expect(frozen.results.find((result) => result.service === "search")?.outcome).toBe("frozen");
  });
});

describe("sendReport", () => {
  it("approves, stores the PDF, marks the report sent, emails the owner once, and the customer can then read it", async () => {
    await composeMonthlyReports(dbs.staff.db, { month: "2026-10", now: NOW });
    const website = (await drafts()).find((row) => row.service === "website");
    const input = { reportId: website?.id ?? "", staffId: "staff-1", now: NOW };

    const result = await sendReport(dbs.staff.db, deps(), input);
    expect(result.email).toBe("sent");
    expect(result.report).toMatchObject({ state: "sent", pdfKey: `reports/${input.reportId}.pdf`, reviewedByStaffId: "staff-1" });

    const stored = await storage.get(reportPdfStorageKey(input.reportId));
    expect(Buffer.from(stored?.bytes.slice(0, 5) ?? []).toString()).toBe("%PDF-");
    expect(stored?.contentType).toBe("application/pdf");

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "meera@kulkarni.example", subject: "Your Website report for October 2026", template: "monthly-report" });
    expect(sent[0]?.bodyText).toContain(`${ORIGIN}/reports/2026-10/pdf?service=website`);

    const seen = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => listSentReports(tx, businessId));
    expect(seen.map((report) => [report.service, report.pdfKey])).toEqual([["website", `reports/${input.reportId}.pdf`]]);

    // Sending again changes nothing and emails nothing more.
    const second = await sendReport(dbs.staff.db, deps(), input);
    expect(second.email).toBe("already-sent");
    expect(sent).toHaveLength(1);
    expect((await getReport(dbs.staff.db, input.reportId))?.sentAt).toEqual(result.report.sentAt);
  });

  it("sends the report but not the email when the owner turned monthly report emails off", async () => {
    await dbs.owner.db.insert(notificationPreferences).values({ userId: OWNER, businessId, topic: "monthly_report", email: false });
    await composeMonthlyReports(dbs.staff.db, { month: "2026-10", now: NOW });
    const social = (await drafts()).find((row) => row.service === "social");
    const result = await sendReport(dbs.staff.db, deps(), { reportId: social?.id ?? "", staffId: "staff-1", now: NOW });
    expect(result).toMatchObject({ email: "owner-turned-off", report: { state: "sent" } });
    expect(sent).toHaveLength(0);
  });

  it("keeps a failed PDF from marking the report sent", async () => {
    await composeMonthlyReports(dbs.staff.db, { month: "2026-10", now: NOW });
    const search = (await drafts()).find((row) => row.service === "search");
    const broken: SendReportDeps = { ...deps(), storage: { ...storage, put: () => Promise.reject(new Error("disk full")) } };
    await expect(sendReport(dbs.staff.db, broken, { reportId: search?.id ?? "", staffId: "staff-1", now: NOW })).rejects.toThrow("disk full");
    expect((await getReport(dbs.staff.db, search?.id ?? ""))?.state).toBe("approved");
    expect(sent).toHaveLength(0);
    // The retry finishes the job.
    const retried = await sendReport(dbs.staff.db, deps(), { reportId: search?.id ?? "", staffId: "staff-1", now: NOW });
    expect(retried.report.state).toBe("sent");
  });
});
