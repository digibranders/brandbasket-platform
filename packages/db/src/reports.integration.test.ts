import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  composeReport,
  getBreakdown,
  getReport,
  listDailyMetrics,
  listReportSources,
  listReportsInState,
  listSentReports,
  listSourceRuns,
  moveReport,
  recordSourceRun,
  ReportMoveError,
  setReportSourceStatus,
  upsertBreakdown,
  upsertDailyMetrics,
  upsertReportSource,
} from "./queries/reports";
import { insertBusiness } from "./queries/onboarding";
import { canMoveReport, REPORT_STATES, type ReportState } from "./report-states";
import { businessMembers, metricDaily, reportDocuments, staffMembers, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "rp-owner";
const OTHER_OWNER = "rp-other-owner";
const STAFF = "rp-staff";
const MONTH = "2026-10-01";
const NOW = new Date("2026-11-01T04:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let otherBusinessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([OWNER, OTHER_OWNER, STAFF].map((id) => ({ id, name: id, email: `${id}@example.com`, emailVerified: true })));
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF });
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Sai Dental Care", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
  await dbs.staff.db.insert(businessMembers).values([
    { businessId, userId: OWNER, role: "owner" },
    { businessId: otherBusinessId, userId: OTHER_OWNER, role: "owner" },
  ]);
});

const staff = () => dbs.staff.db;
const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);

/** Postgres reports a missing privilege as 42501 and a refused check or guard as 23514; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

const draft = (overrides: { business?: string; service?: "website" | "social" | "search"; month?: string } = {}) =>
  composeReport(staff(), { businessId: overrides.business ?? businessId, service: overrides.service ?? "website", month: overrides.month ?? MONTH, content: { headline: "Online all month" }, contentVersion: 1, now: NOW });

/** A report in the given state, reached by the only legal path to it. */
async function reportIn(state: ReportState, month: string) {
  const created = await draft({ month });
  if (created === null) throw new Error("expected a new draft");
  if (state === "draft") return created;
  if (state === "held") return moveReport(staff(), { id: created.id, to: "held", staffId: STAFF, now: NOW });
  const approved = await moveReport(staff(), { id: created.id, to: "approved", staffId: STAFF, now: NOW });
  return state === "approved" ? approved : moveReport(staff(), { id: created.id, to: "sent", staffId: STAFF, now: NOW });
}

describe("daily metrics", () => {
  it("replaces a day's value when the night's pull repeats", async () => {
    await upsertDailyMetrics(staff(), businessId, [{ metric: "gsc.clicks", day: "2026-10-03", value: 4 }, { metric: "gsc.impressions", day: "2026-10-03", value: 90 }], NOW);
    await upsertDailyMetrics(staff(), businessId, [{ metric: "gsc.clicks", day: "2026-10-03", value: 6 }], new Date("2026-11-02T04:00:00.000Z"));
    const rows = await listDailyMetrics(staff(), businessId, "2026-10-01", "2026-10-31");
    expect(rows.map((row) => [row.metric, row.day, row.value])).toEqual([["gsc.clicks", "2026-10-03", 6], ["gsc.impressions", "2026-10-03", 90]]);
    expect(rows[0]?.fetchedAt.toISOString()).toBe("2026-11-02T04:00:00.000Z");
  });

  it("lists only the window asked for, for one business, oldest first", async () => {
    await upsertDailyMetrics(staff(), businessId, [{ metric: "gsc.clicks", day: "2026-09-30", value: 1 }, { metric: "gsc.clicks", day: "2026-10-02", value: 2 }, { metric: "gsc.clicks", day: "2026-10-01", value: 3 }, { metric: "gsc.clicks", day: "2026-11-01", value: 4 }], NOW);
    await upsertDailyMetrics(staff(), otherBusinessId, [{ metric: "gsc.clicks", day: "2026-10-02", value: 99 }], NOW);
    expect((await listDailyMetrics(staff(), businessId, "2026-10-01", "2026-10-31")).map((row) => row.value)).toEqual([3, 2]);
  });

  it("does nothing for an empty batch", async () => {
    await upsertDailyMetrics(staff(), businessId, [], NOW);
    expect(await listDailyMetrics(staff(), businessId, "2026-10-01", "2026-10-31")).toEqual([]);
  });

  it("refuses a metric name that is not source.name, and a negative value", async () => {
    expect(await sqlState(() => upsertDailyMetrics(staff(), businessId, [{ metric: "clicks", day: MONTH, value: 1 }], NOW))).toBe("23514");
    expect(await sqlState(() => upsertDailyMetrics(staff(), businessId, [{ metric: "gsc.clicks", day: MONTH, value: -1 }], NOW))).toBe("23514");
  });

  it("is private: a customer cannot read the raw numbers", async () => {
    await upsertDailyMetrics(staff(), businessId, [{ metric: "gsc.clicks", day: MONTH, value: 1 }], NOW);
    expect(await sqlState(() => asOwner((tx) => tx.select().from(metricDaily)))).toBe("42501");
  });
});

describe("breakdowns", () => {
  it("replaces a month's list", async () => {
    const input = { businessId, source: "gsc" as const, month: MONTH, dimension: "query", now: NOW };
    await upsertBreakdown(staff(), { ...input, rows: [{ key: "dentist near me", clicks: 3 }] });
    await upsertBreakdown(staff(), { ...input, rows: [{ key: "root canal", clicks: 5 }] });
    expect(await getBreakdown(staff(), businessId, "gsc", MONTH, "query")).toEqual([{ key: "root canal", clicks: 5 }]);
    expect(await getBreakdown(staff(), businessId, "ga4", MONTH, "query")).toBeNull();
  });

  it("holds our own first-party lists beside Google's", async () => {
    await upsertBreakdown(staff(), { businessId, source: "own", month: MONTH, dimension: "channel", rows: [{ key: "Google search", visits: 40 }], now: NOW });
    expect(await getBreakdown(staff(), businessId, "own", MONTH, "channel")).toEqual([{ key: "Google search", visits: 40 }]);
  });

  it("keeps a list to 100 rows", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({ key: `q${index}` }));
    expect(await sqlState(() => upsertBreakdown(staff(), { businessId, source: "gsc", month: MONTH, dimension: "query", rows, now: NOW }))).toBe("23514");
  });
});

describe("report sources", () => {
  it("connects a property, and a repeat replaces it and starts again as pending", async () => {
    await upsertReportSource(staff(), { businessId, source: "gsc", externalId: "sc-domain:saidental.in", now: NOW });
    await setReportSourceStatus(staff(), { businessId, source: "gsc", status: "connected", error: null, now: NOW });
    await upsertReportSource(staff(), { businessId, source: "gsc", externalId: "sc-domain:saidental.com", now: NOW });
    const rows = await listReportSources(staff(), businessId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ externalId: "sc-domain:saidental.com", status: "pending", lastOkAt: null, lastError: null });
  });

  it("records the last good pull, and the reason access was lost", async () => {
    await upsertReportSource(staff(), { businessId, source: "ga4", externalId: "123456789", now: NOW });
    await setReportSourceStatus(staff(), { businessId, source: "ga4", status: "connected", error: null, now: NOW });
    expect((await listReportSources(staff(), businessId))[0]).toMatchObject({ status: "connected", lastOkAt: NOW, lastError: null });
    const later = new Date("2026-11-02T04:00:00.000Z");
    await setReportSourceStatus(staff(), { businessId, source: "ga4", status: "access_lost", error: "403 The caller does not have permission", now: later });
    expect((await listReportSources(staff(), businessId))[0]).toMatchObject({ status: "access_lost", lastOkAt: NOW, lastError: "403 The caller does not have permission" });
  });

  it("shows a customer their own sources only", async () => {
    await upsertReportSource(staff(), { businessId, source: "gsc", externalId: "sc-domain:saidental.in", now: NOW });
    await upsertReportSource(staff(), { businessId: otherBusinessId, source: "gsc", externalId: "sc-domain:birch.in", now: NOW });
    expect((await asOwner((tx) => listReportSources(tx, businessId))).map((row) => row.externalId)).toEqual(["sc-domain:saidental.in"]);
  });

  it("keeps a run's window ordered and its error in step with its result", async () => {
    await recordSourceRun(staff(), { businessId, source: "gsc", windowStart: "2026-10-25", windowEnd: "2026-10-31", error: null, now: NOW });
    await recordSourceRun(staff(), { businessId, source: "gsc", windowStart: "2026-11-01", windowEnd: "2026-11-07", error: "429 quota", now: NOW });
    expect((await listSourceRuns(staff(), businessId, "gsc", "2026-10-01", "2026-10-31")).map((run) => [run.windowStart, run.ok])).toEqual([["2026-10-25", true]]);
    expect(await sqlState(() => recordSourceRun(staff(), { businessId, source: "gsc", windowStart: "2026-10-31", windowEnd: "2026-10-25", error: null, now: NOW }))).toBe("23514");
  });
});

describe("report documents", () => {
  it("composes a draft, and a second compose replaces a draft or held document", async () => {
    const first = await draft();
    expect(first).toMatchObject({ state: "draft", contentVersion: 1, content: { headline: "Online all month" } });
    const second = await composeReport(staff(), { businessId, service: "website", month: MONTH, content: { headline: "Corrected" }, contentVersion: 2, now: new Date("2026-11-02T04:00:00.000Z") });
    expect(second).toMatchObject({ id: first?.id, state: "draft", contentVersion: 2, content: { headline: "Corrected" } });
    await moveReport(staff(), { id: second?.id ?? "", to: "held", staffId: STAFF, now: NOW });
    expect(await composeReport(staff(), { businessId, service: "website", month: MONTH, content: { headline: "Again" }, contentVersion: 2, now: NOW })).toMatchObject({ state: "held", content: { headline: "Again" } });
  });

  it("returns null and changes nothing once a report is approved or sent", async () => {
    const approved = await reportIn("approved", MONTH);
    expect(await draft()).toBeNull();
    expect((await getReport(staff(), approved.id))?.content).toEqual({ headline: "Online all month" });
    const sent = await reportIn("sent", "2026-09-01");
    expect(await draft({ month: "2026-09-01" })).toBeNull();
    expect((await getReport(staff(), sent.id))?.state).toBe("sent");
  });

  it("keeps one report per business, service and month", async () => {
    await draft();
    await draft({ service: "social" });
    await draft({ business: otherBusinessId });
    expect(await staff().select().from(reportDocuments)).toHaveLength(3);
  });

  it("records who approved and when, and sets the send time", async () => {
    const approved = await reportIn("approved", MONTH);
    expect(approved).toMatchObject({ state: "approved", reviewedByStaffId: STAFF, reviewedAt: NOW });
    const later = new Date("2026-11-04T04:00:00.000Z");
    expect(await moveReport(staff(), { id: approved.id, to: "sent", staffId: STAFF, now: later })).toMatchObject({ state: "sent", sentAt: later, reviewedAt: NOW });
  });

  it("clears the review when a report goes back to held", async () => {
    const approved = await reportIn("approved", MONTH);
    expect(await moveReport(staff(), { id: approved.id, to: "held", staffId: STAFF, now: NOW })).toMatchObject({ state: "held", reviewedAt: null, reviewedByStaffId: null });
  });

  it("refuses a move the rules do not allow, and one for a report that is not there", async () => {
    const created = await reportIn("draft", MONTH);
    await expect(moveReport(staff(), { id: created.id, to: "sent", staffId: STAFF, now: NOW })).rejects.toBeInstanceOf(ReportMoveError);
    await expect(moveReport(staff(), { id: "019a0000-0000-7000-8000-000000000000", to: "held", staffId: STAFF, now: NOW })).rejects.toBeInstanceOf(ReportMoveError);
  });

  it("lists the staff queue by state and month", async () => {
    await reportIn("draft", MONTH);
    await reportIn("held", "2026-09-01");
    expect((await listReportsInState(staff(), "draft", MONTH)).map((row) => row.month)).toEqual([MONTH]);
    expect((await listReportsInState(staff(), "held")).map((row) => row.month)).toEqual(["2026-09-01"]);
  });

  it("shows a customer their own sent reports only, newest first", async () => {
    await reportIn("sent", "2026-09-01");
    await reportIn("sent", MONTH);
    await draft({ month: "2026-08-01" });
    const other = await composeReport(staff(), { businessId: otherBusinessId, service: "website", month: MONTH, content: {}, contentVersion: 1, now: NOW });
    await moveReport(staff(), { id: other?.id ?? "", to: "approved", staffId: STAFF, now: NOW });
    await moveReport(staff(), { id: other?.id ?? "", to: "sent", staffId: STAFF, now: NOW });
    const rows = await asOwner((tx) => listSentReports(tx, businessId));
    expect(rows.map((row) => row.month)).toEqual([MONTH, "2026-09-01"]);
    expect(await asOwner((tx) => tx.select({ id: reportDocuments.id }).from(reportDocuments))).toHaveLength(2);
  });

  it("gives a customer no way to write a report", async () => {
    const created = await reportIn("sent", MONTH);
    expect(await sqlState(() => asOwner((tx) => tx.update(reportDocuments).set({ state: "draft" }).where(eq(reportDocuments.id, created.id))))).toBe("42501");
    expect(await sqlState(() => asOwner((tx) => tx.delete(reportDocuments)))).toBe("42501");
  });

  it("starts a report only as a draft", async () => {
    expect(await sqlState(() => staff().insert(reportDocuments).values({ businessId, service: "website", month: MONTH, state: "approved", content: {}, reviewedAt: NOW }))).toBe("23514");
  });

  it("allows every arrow in report-states.ts and refuses the rest", async () => {
    for (const from of REPORT_STATES) {
      for (const to of REPORT_STATES) {
        await staff().delete(reportDocuments);
        const row = await reportIn(from, MONTH);
        const refused = await sqlState(() =>
          staff().update(reportDocuments).set({ state: to, reviewedAt: to === "approved" || to === "sent" ? NOW : null, sentAt: to === "sent" ? NOW : null }).where(eq(reportDocuments.id, row.id)),
        );
        expect(refused === undefined, `${from} to ${to}`).toBe(canMoveReport(from, to) && from !== "sent");
      }
    }
  });

  it("freezes identity, and the document once a report is approved or sent", async () => {
    const approved = await reportIn("approved", MONTH);
    expect(await sqlState(() => staff().update(reportDocuments).set({ content: { headline: "Edited" } }).where(eq(reportDocuments.id, approved.id)))).toBe("23514");
    expect(await sqlState(() => staff().update(reportDocuments).set({ contentVersion: 2 }).where(eq(reportDocuments.id, approved.id)))).toBe("23514");
    const sent = await moveReport(staff(), { id: approved.id, to: "sent", staffId: STAFF, now: NOW });
    expect(await sqlState(() => staff().update(reportDocuments).set({ pdfKey: `reports/${sent.id}.pdf` }).where(eq(reportDocuments.id, sent.id)))).toBe("23514");
    const held = await reportIn("held", "2026-09-01");
    expect(await sqlState(() => staff().execute(sql`update report_documents set month = '2026-08-01' where id = ${held.id}`))).toBe("42501");
  });

  it("refuses a sent state with no send time, and a pdf key that is not the report's own", async () => {
    const approved = await reportIn("approved", MONTH);
    expect(await sqlState(() => staff().update(reportDocuments).set({ state: "sent" }).where(eq(reportDocuments.id, approved.id)))).toBe("23514");
    expect(await sqlState(() => staff().update(reportDocuments).set({ pdfKey: "reports/other.pdf" }).where(and(eq(reportDocuments.id, approved.id))))).toBe("23514");
  });
});
