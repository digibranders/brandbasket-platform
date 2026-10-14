import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { staffMembers } from "./staff";

export interface ErrorSourceFrame {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}
export type ErrorIssueStatus = "new" | "investigating" | "resolved" | "ignored";

/** Staff-only sanitized aggregates. Never store raw errors or identifiable occurrence records. */
export const errorIssues = pgTable("error_issues", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  fingerprint: text("fingerprint").notNull().unique(),
  app: text("app").notNull(),
  operation: text("operation").notNull(),
  errorClass: text("error_class").notNull(),
  route: text("route").notNull(),
  release: text("release").notNull(),
  browser: text("browser").notNull(),
  severity: text("severity").notNull(),
  frames: jsonb("frames").$type<readonly ErrorSourceFrame[]>().notNull(),
  status: text("status").$type<ErrorIssueStatus>().notNull().default("new"),
  assigneeStaffId: text("assignee_staff_id").references(() => staffMembers.userId),
  occurrenceCount: integer("occurrence_count").notNull().default(0),
  userBits: text("user_bits").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  regressionCount: integer("regression_count").notNull().default(0),
}, (table) => [
  index("error_issues_last_seen_idx").on(table.lastSeenAt), index("error_issues_status_idx").on(table.status),
  check("error_issues_app_check", sql`${table.app} in ('platform', 'admin')`),
  check("error_issues_severity_check", sql`${table.severity} in ('error', 'fatal')`),
  check("error_issues_status_check", sql`${table.status} in ('new', 'investigating', 'resolved', 'ignored')`),
  check("error_issues_counts_check", sql`${table.occurrenceCount} >= 0 and ${table.regressionCount} >= 0`),
  check("error_issues_user_bits_check", sql`length(${table.userBits}) = 1024 and ${table.userBits} !~ '[^01]'`),
  check("error_issues_fingerprint_check", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
  check("error_issues_release_check", sql`${table.release} = 'unknown' or ${table.release} ~ '^[0-9a-f]{7,64}$'`),
  check("error_issues_browser_check", sql`${table.browser} in ('Chrome', 'Safari', 'Firefox', 'Edge', 'Other', 'Server')`),
  check("error_issues_class_check", sql`${table.errorClass} in ('Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError', 'EvalError', 'AggregateError', 'DatabaseError', 'DrizzleQueryError', 'UnknownError')`),
  check("error_issues_operation_check", sql`${table.operation} in ('server_render', 'server_action', 'server_route', 'server_proxy', 'browser_uncaught', 'browser_rejection', 'error_boundary', 'support_submit', 'support_attachment', 'billing_checkout', 'billing_payment', 'booking_create')`),
  check("error_issues_frames_check", sql`jsonb_typeof(${table.frames}) = 'array' and jsonb_array_length(${table.frames}) <= 8`),
]);

/** One-day dedupe receipts contain only event identifiers, not raw occurrences or user associations. */
export const errorEventReceipts = pgTable("error_event_receipts", {
  eventId: uuid("event_id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("error_event_receipts_received_idx").on(table.receivedAt)]);
