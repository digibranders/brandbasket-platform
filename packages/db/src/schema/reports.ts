import { sql } from "drizzle-orm";
import { boolean, check, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import type { ConnectedSource, ReportService, ReportSource, ReportState, SourceStatus } from "../report-states";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/**
 * Which Search Console property or Analytics property a business has given us, one row per business and source.
 * `external_id` is `sc-domain:example.in` or a GA4 property id. Staff write it; the customer reads their own so the
 * To do step can show the state.
 */
export const reportSources = pgTable(
  "report_sources",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    source: text("source").$type<ConnectedSource>().notNull(),
    externalId: text("external_id").notNull(),
    status: text("status").$type<SourceStatus>().notNull().default("pending"),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("report_sources_business_source_idx").on(table.businessId, table.source),
    check("report_sources_source_check", sql`${table.source} in ('gsc', 'ga4')`),
    check("report_sources_status_check", sql`${table.status} in ('pending', 'connected', 'access_lost')`),
    check("report_sources_external_id_check", sql`char_length(btrim(${table.externalId})) between 1 and 200`),
    check("report_sources_error_check", sql`${table.lastError} is null or char_length(${table.lastError}) <= 300`),
  ],
);
export type ReportSourceRow = typeof reportSources.$inferSelect;

/**
 * One attempt to pull a window of days from a source. A day with no row in `metric_daily` is zero only when a
 * successful run covers it; otherwise it was not measured, and the report leaves the figure out.
 */
export const reportSourceRuns = pgTable(
  "report_source_runs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    source: text("source").$type<ReportSource>().notNull(),
    windowStart: date("window_start", { mode: "string" }).notNull(),
    windowEnd: date("window_end", { mode: "string" }).notNull(),
    ok: boolean("ok").notNull(),
    error: text("error"),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("report_source_runs_business_idx").on(table.businessId, table.source, table.windowEnd),
    check("report_source_runs_source_check", sql`${table.source} in ('own', 'gsc', 'ga4')`),
    check("report_source_runs_window_check", sql`${table.windowEnd} >= ${table.windowStart}`),
    check("report_source_runs_error_check", sql`${table.ok} = (${table.error} is null) and (${table.error} is null or char_length(${table.error}) <= 300)`),
  ],
);
export type ReportSourceRun = typeof reportSourceRuns.$inferSelect;

/** One number per business, metric and day, such as `gsc.clicks`. Re-pulled nightly, so a write replaces the value. */
export const metricDaily = pgTable(
  "metric_daily",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    metric: text("metric").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    value: doublePrecision("value").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_daily_business_metric_day_idx").on(table.businessId, table.metric, table.day),
    check("metric_daily_metric_check", sql`${table.metric} ~ '^(own|gsc|ga4)\\.[a-z0-9_]{1,40}$'`),
    check("metric_daily_value_check", sql`${table.value} >= 0`),
  ],
);
export type MetricDaily = typeof metricDaily.$inferSelect;

/** The ranked lists for a month (top searches, top pages, how visitors arrived), as an array of small objects. */
export const metricBreakdowns = pgTable(
  "metric_breakdowns",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    source: text("source").$type<ReportSource>().notNull(),
    /** The first day of the month. */
    month: date("month", { mode: "string" }).notNull(),
    dimension: text("dimension").notNull(),
    rows: jsonb("rows").$type<readonly Record<string, unknown>[]>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_breakdowns_business_source_month_dimension_idx").on(table.businessId, table.source, table.month, table.dimension),
    check("metric_breakdowns_source_check", sql`${table.source} in ('own', 'gsc', 'ga4')`),
    check("metric_breakdowns_month_check", sql`extract(day from ${table.month}) = 1`),
    check("metric_breakdowns_dimension_check", sql`${table.dimension} ~ '^[a-z_]{1,30}$'`),
    check("metric_breakdowns_rows_check", sql`jsonb_typeof(${table.rows}) = 'array' and jsonb_array_length(${table.rows}) <= 100 and pg_column_size(${table.rows}) <= 65536`),
  ],
);
export type MetricBreakdown = typeof metricBreakdowns.$inferSelect;

/**
 * One month's report for one service: the frozen document. Composed as a draft, reviewed by staff, then sent. Once
 * sent it is never edited. The customer's reads see sent reports only (row-level security). `monthly_reports` is the
 * older table of links staff paste in for Social and Search; it stays until these documents replace it.
 */
export const reportDocuments = pgTable(
  "report_documents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    service: text("service").$type<ReportService>().notNull(),
    /** The first day of the month the report covers. */
    month: date("month", { mode: "string" }).notNull(),
    state: text("state").$type<ReportState>().notNull().default("draft"),
    /** The versioned report document. apps/platform owns its shape (zod); the database only keeps it a bounded object. */
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    contentVersion: integer("content_version").notNull().default(1),
    pdfKey: text("pdf_key"),
    composedAt: timestamp("composed_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedByStaffId: text("reviewed_by_staff_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("report_documents_business_service_month_idx").on(table.businessId, table.service, table.month),
    index("report_documents_state_idx").on(table.state, table.month),
    check("report_documents_service_check", sql`${table.service} in ('website', 'social', 'search')`),
    check("report_documents_month_check", sql`extract(day from ${table.month}) = 1`),
    check("report_documents_state_check", sql`${table.state} in ('draft', 'held', 'approved', 'sent')`),
    check("report_documents_content_check", sql`jsonb_typeof(${table.content}) = 'object' and pg_column_size(${table.content}) <= 262144`),
    check("report_documents_version_check", sql`${table.contentVersion} >= 1`),
    check("report_documents_pdf_key_check", sql`${table.pdfKey} is null or ${table.pdfKey} = 'reports/' || ${table.id} || '.pdf'`),
    check("report_documents_approved_check", sql`${table.state} not in ('approved', 'sent') or ${table.reviewedAt} is not null`),
    check("report_documents_sent_check", sql`(${table.state} = 'sent') = (${table.sentAt} is not null)`),
  ],
);
export type ReportDocument = typeof reportDocuments.$inferSelect;
