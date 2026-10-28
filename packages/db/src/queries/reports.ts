import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../client";
import { canMoveReport, type ConnectedSource, type ReportService, type ReportSource, type ReportState, type SourceStatus } from "../report-states";
import { metricBreakdowns, metricDaily, reportDocuments, reportSourceRuns, reportSources, type MetricDaily, type ReportDocument, type ReportSourceRow, type ReportSourceRun } from "../schema";
import type { ScopedTransaction } from "../scope";

type Runner = Database | ScopedTransaction;

/*
 * The data layer of the monthly reports (plan 55). The jobs and the console write on the staff connection; the
 * customer's reads (report sources, sent reports) go through withTenantScope and row-level security.
 */

/** Rows per insert, so a long window stays far below Postgres's limit on parameters. */
const INSERT_CHUNK = 1000;

export interface DailyMetricInput {
  readonly metric: string;
  /** `YYYY-MM-DD`. */
  readonly day: string;
  readonly value: number;
}

/** Saves a batch of daily numbers. A repeat for the same business, metric and day replaces the value (Google revises recent days). Staff connection. */
export async function upsertDailyMetrics(db: Runner, businessId: string, rows: readonly DailyMetricInput[], now: Date): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    await db
      .insert(metricDaily)
      .values(rows.slice(start, start + INSERT_CHUNK).map((row) => ({ businessId, metric: row.metric, day: row.day, value: row.value, fetchedAt: now })))
      .onConflictDoUpdate({
        target: [metricDaily.businessId, metricDaily.metric, metricDaily.day],
        set: { value: sql`excluded.value`, fetchedAt: sql`excluded.fetched_at` },
      });
  }
}

/** The business's daily numbers from `from` to `to`, both included (`YYYY-MM-DD`), oldest first. Staff connection. */
export async function listDailyMetrics(db: Runner, businessId: string, from: string, to: string): Promise<MetricDaily[]> {
  return db
    .select()
    .from(metricDaily)
    .where(and(eq(metricDaily.businessId, businessId), gte(metricDaily.day, from), lte(metricDaily.day, to)))
    .orderBy(asc(metricDaily.day), asc(metricDaily.metric));
}

export interface BreakdownInput {
  readonly businessId: string;
  readonly source: ConnectedSource;
  /** The first day of the month, `YYYY-MM-01`. */
  readonly month: string;
  readonly dimension: string;
  readonly rows: readonly Record<string, unknown>[];
  readonly now: Date;
}

/** Saves a month's ranked list for one dimension, replacing the last pull. Staff connection. */
export async function upsertBreakdown(db: Runner, input: BreakdownInput): Promise<void> {
  await db
    .insert(metricBreakdowns)
    .values({ businessId: input.businessId, source: input.source, month: input.month, dimension: input.dimension, rows: input.rows, fetchedAt: input.now })
    .onConflictDoUpdate({
      target: [metricBreakdowns.businessId, metricBreakdowns.source, metricBreakdowns.month, metricBreakdowns.dimension],
      set: { rows: input.rows, fetchedAt: input.now },
    });
}

/** A month's ranked list, or null when it was never pulled. Staff connection. */
export async function getBreakdown(db: Runner, businessId: string, source: ConnectedSource, month: string, dimension: string): Promise<readonly Record<string, unknown>[] | null> {
  const [row] = await db
    .select({ rows: metricBreakdowns.rows })
    .from(metricBreakdowns)
    .where(and(eq(metricBreakdowns.businessId, businessId), eq(metricBreakdowns.source, source), eq(metricBreakdowns.month, month), eq(metricBreakdowns.dimension, dimension)));
  return row?.rows ?? null;
}

/** Gives a business's property to pull from. A repeat replaces it and starts again as pending. Staff connection. */
export async function upsertReportSource(db: Runner, input: { readonly businessId: string; readonly source: ConnectedSource; readonly externalId: string; readonly now: Date }): Promise<void> {
  await db
    .insert(reportSources)
    .values({ businessId: input.businessId, source: input.source, externalId: input.externalId })
    .onConflictDoUpdate({
      target: [reportSources.businessId, reportSources.source],
      set: { externalId: input.externalId, status: "pending", lastOkAt: null, lastError: null, updatedAt: input.now },
    });
}

/** Records how the last pull went: `connected` stamps the time, anything else keeps the last good time and the reason. Staff connection. */
export async function setReportSourceStatus(
  db: Runner,
  input: { readonly businessId: string; readonly source: ConnectedSource; readonly status: SourceStatus; readonly error: string | null; readonly now: Date },
): Promise<void> {
  await db
    .update(reportSources)
    .set({ status: input.status, lastError: input.error, updatedAt: input.now, ...(input.status === "connected" ? { lastOkAt: input.now } : {}) })
    .where(and(eq(reportSources.businessId, input.businessId), eq(reportSources.source, input.source)));
}

/** The business's connected sources. A customer scope sees their own. */
export async function listReportSources(db: Runner, businessId: string): Promise<ReportSourceRow[]> {
  return db.select().from(reportSources).where(eq(reportSources.businessId, businessId)).orderBy(asc(reportSources.source));
}

/** Notes one attempt to pull a window of days. A null error means it worked. Staff connection. */
export async function recordSourceRun(
  db: Runner,
  input: { readonly businessId: string; readonly source: ReportSource; readonly windowStart: string; readonly windowEnd: string; readonly error: string | null; readonly now: Date },
): Promise<void> {
  await db
    .insert(reportSourceRuns)
    .values({ businessId: input.businessId, source: input.source, windowStart: input.windowStart, windowEnd: input.windowEnd, ok: input.error === null, error: input.error, ranAt: input.now });
}

/** The attempts whose window touches `from` to `to` (both included), oldest window first. Staff connection. */
export async function listSourceRuns(db: Runner, businessId: string, source: ReportSource, from: string, to: string): Promise<ReportSourceRun[]> {
  return db
    .select()
    .from(reportSourceRuns)
    .where(and(eq(reportSourceRuns.businessId, businessId), eq(reportSourceRuns.source, source), lte(reportSourceRuns.windowStart, to), gte(reportSourceRuns.windowEnd, from)))
    .orderBy(asc(reportSourceRuns.windowStart), asc(reportSourceRuns.ranAt));
}

export interface ComposeInput {
  readonly businessId: string;
  readonly service: ReportService;
  /** The first day of the month, `YYYY-MM-01`. */
  readonly month: string;
  readonly content: Record<string, unknown>;
  readonly contentVersion: number;
  readonly now: Date;
}

/**
 * Writes a month's report as a draft, or replaces the document of a draft or held one. Returns null, changing nothing,
 * when the report is already approved or sent: those are frozen. Staff connection.
 */
export async function composeReport(db: Runner, input: ComposeInput): Promise<ReportDocument | null> {
  const [row] = await db
    .insert(reportDocuments)
    .values({ businessId: input.businessId, service: input.service, month: input.month, content: input.content, contentVersion: input.contentVersion, composedAt: input.now })
    .onConflictDoUpdate({
      target: [reportDocuments.businessId, reportDocuments.service, reportDocuments.month],
      set: { content: input.content, contentVersion: input.contentVersion, composedAt: input.now, updatedAt: input.now },
      setWhere: inArray(reportDocuments.state, ["draft", "held"]),
    })
    .returning();
  return row ?? null;
}

export async function getReport(db: Runner, id: string): Promise<ReportDocument | null> {
  const [row] = await db.select().from(reportDocuments).where(eq(reportDocuments.id, id));
  return row ?? null;
}

/** Why a report could not move: it is not there, the arrow is not allowed, or another writer moved it first. */
export class ReportMoveError extends Error {
  constructor(
    readonly reason: "not-found" | "not-allowed" | "changed",
    message: string,
  ) {
    super(message);
    this.name = "ReportMoveError";
  }
}

/** Moves a report along an arrow of report-states.ts. Approving records who and when; sending records when. Staff connection. */
export async function moveReport(db: Runner, input: { readonly id: string; readonly to: ReportState; readonly staffId: string; readonly now: Date }): Promise<ReportDocument> {
  const current = await getReport(db, input.id);
  if (current === null) throw new ReportMoveError("not-found", `Report ${input.id} does not exist`);
  if (!canMoveReport(current.state, input.to)) throw new ReportMoveError("not-allowed", `A report cannot move from ${current.state} to ${input.to}`);
  if (current.state === input.to) return current;
  const [row] = await db
    .update(reportDocuments)
    .set({
      state: input.to,
      updatedAt: input.now,
      ...(input.to === "approved" ? { reviewedAt: input.now, reviewedByStaffId: input.staffId } : {}),
      ...(input.to === "sent" ? { sentAt: input.now } : {}),
    })
    .where(and(eq(reportDocuments.id, input.id), eq(reportDocuments.state, current.state)))
    .returning();
  if (row === undefined) throw new ReportMoveError("changed", `Report ${input.id} changed while it was being moved`);
  return row;
}

/** Reports in one state, optionally for one month, oldest month first: the staff queue. Staff connection. */
export async function listReportsInState(db: Runner, state: ReportState, month?: string): Promise<ReportDocument[]> {
  return db
    .select()
    .from(reportDocuments)
    .where(and(eq(reportDocuments.state, state), month === undefined ? undefined : eq(reportDocuments.month, month)))
    .orderBy(asc(reportDocuments.month), asc(reportDocuments.createdAt));
}

/** The business's sent reports, newest month first. Under a customer scope the database shows nothing else. */
export async function listSentReports(db: Runner, businessId: string): Promise<ReportDocument[]> {
  return db
    .select()
    .from(reportDocuments)
    .where(and(eq(reportDocuments.businessId, businessId), eq(reportDocuments.state, "sent")))
    .orderBy(desc(reportDocuments.month), asc(reportDocuments.service));
}
