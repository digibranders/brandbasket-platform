import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ReportSource } from "../report-states";
import { metricBreakdowns, metricDaily, reportSources, type ReportSourceRow } from "../schema";
import type { ScopedTransaction } from "../scope";
import { currentBusinessId } from "./tenant";

/** The sources a customer's visits can come from: our own tracking script, or their Google Analytics. */
export type VisitSource = Extract<ReportSource, "own" | "ga4">;

/** The daily numbers of a visit, named `<source>.visits` and so on. */
export const VISIT_METRICS = ["visits", "visitors", "pageviews"] as const;
export type VisitMetric = (typeof VISIT_METRICS)[number];

/** The monthly lists the Website screen reads: how visitors arrived and the pages they looked at. */
export const VISIT_DIMENSIONS = ["channel", "page"] as const;
export type VisitDimension = (typeof VISIT_DIMENSIONS)[number];

export interface VisitDay {
  readonly metric: VisitMetric;
  /** `YYYY-MM-DD`. */
  readonly day: string;
  readonly value: number;
  readonly fetchedAt: Date;
}

export interface VisitList {
  readonly dimension: VisitDimension;
  readonly rows: readonly Record<string, unknown>[];
  readonly fetchedAt: Date;
}

/*
 * Customer side (plan 61, gate G1): every function takes the transaction withTenantScope opened on the app connection and
 * reads the business from it. Row-level security (migration 0219) limits the rows to that business as well.
 */

/** The business's visit numbers for one source, `from` to `to` both included (`YYYY-MM-DD`), oldest first. */
export async function listVisitDays(tx: ScopedTransaction, source: VisitSource, from: string, to: string): Promise<VisitDay[]> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select({ metric: metricDaily.metric, day: metricDaily.day, value: metricDaily.value, fetchedAt: metricDaily.fetchedAt })
    .from(metricDaily)
    .where(
      and(
        eq(metricDaily.businessId, businessId),
        inArray(
          metricDaily.metric,
          VISIT_METRICS.map((metric) => `${source}.${metric}`),
        ),
        gte(metricDaily.day, from),
        lte(metricDaily.day, to),
      ),
    )
    .orderBy(asc(metricDaily.day), asc(metricDaily.metric));
  return rows.map((row) => ({ metric: row.metric.slice(source.length + 1) as VisitMetric, day: row.day, value: row.value, fetchedAt: row.fetchedAt }));
}

/** The lists of one month (`YYYY-MM-01`) for one source. A list that was never pulled is absent, not empty. */
export async function listVisitLists(tx: ScopedTransaction, source: VisitSource, month: string): Promise<VisitList[]> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select({ dimension: metricBreakdowns.dimension, rows: metricBreakdowns.rows, fetchedAt: metricBreakdowns.fetchedAt })
    .from(metricBreakdowns)
    .where(
      and(
        eq(metricBreakdowns.businessId, businessId),
        eq(metricBreakdowns.source, source),
        eq(metricBreakdowns.month, month),
        inArray(metricBreakdowns.dimension, [...VISIT_DIMENSIONS]),
      ),
    );
  return rows.map((row) => ({ dimension: row.dimension as VisitDimension, rows: row.rows, fetchedAt: row.fetchedAt }));
}

/** The business's Google Analytics connection, or null when staff never set a property. */
export async function findAnalyticsConnection(tx: ScopedTransaction): Promise<ReportSourceRow | null> {
  const businessId = await currentBusinessId(tx);
  const [row] = await tx
    .select()
    .from(reportSources)
    .where(and(eq(reportSources.businessId, businessId), eq(reportSources.source, "ga4")))
    .limit(1);
  return row ?? null;
}

// Staff side: the GA4 nightly job, on the staff connection.

export interface Ga4Property {
  readonly businessId: string;
  readonly propertyId: string;
}

/** Every business with a Google Analytics property, whatever its last status: a lost grant is retried, so a customer who fixes it comes back by itself. */
export async function listGa4Properties(db: Database): Promise<Ga4Property[]> {
  const rows = await db.select({ businessId: reportSources.businessId, propertyId: reportSources.externalId }).from(reportSources).where(eq(reportSources.source, "ga4"));
  return rows;
}

/** The last day this business has a Google Analytics visits number for, or null when none: the job pulls a long window the first time. */
export async function latestGa4Day(db: Database, businessId: string): Promise<string | null> {
  const [row] = await db
    .select({ day: sql<string | null>`max(${metricDaily.day})::text` })
    .from(metricDaily)
    .where(and(eq(metricDaily.businessId, businessId), eq(metricDaily.metric, "ga4.visits")));
  return row?.day ?? null;
}

/** Every business with a Search Console site (the address in `external_id`), whatever its last status: a lost grant is retried each night. */
export async function listGscSites(db: Database): Promise<{ businessId: string; siteUrl: string }[]> {
  return db.select({ businessId: reportSources.businessId, siteUrl: reportSources.externalId }).from(reportSources).where(eq(reportSources.source, "gsc"));
}

/** The last day this business has a Search Console clicks number for, or null when none: the job pulls a long window the first time. */
export async function latestGscDay(db: Database, businessId: string): Promise<string | null> {
  const [row] = await db
    .select({ day: sql<string | null>`max(${metricDaily.day})::text` })
    .from(metricDaily)
    .where(and(eq(metricDaily.businessId, businessId), eq(metricDaily.metric, "gsc.clicks")));
  return row?.day ?? null;
}
