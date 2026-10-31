import { and, count, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import { staffAccessLog, users, type StaffAccessResult } from "../schema";

/**
 * Everything the console logs. One list so a typo cannot create a second spelling of the same event, and so the review
 * screen can describe each one.
 */
export const STAFF_ACCESS_ACTIONS = [
  "staff.sign_in",
  "access_log.view",
  "access.denied",
  "search.run",
  "client.view",
  "lead.view",
  "lead.export",
  "outbox.view",
  "delivery.view",
  "email.resend",
  "alert.resend",
  "support_ticket.view",
  "support_attachment.view",
  "directory.view",
  "invoice.view",
  "invoice.export",
  "invoice.export_zip",
  "payment.list_view",
  "payment.export",
  "breach.view",
  "breach.log",
  "breach.update",
  "privacy_request.view",
  "privacy_request.log",
  "privacy_request.update",
  "privacy_request.close",
  "client.people_view",
  "client.closure_restore",
  "client.closure_extend",
  "staff.invite",
  "staff.role_change",
  "staff.deactivate",
  "staff.reactivate",
  "today.view",
  "clients.list",
  "leads.list",
  "calls.list",
  "projects.list",
  "leaving.list",
  "support.list",
  "support.new",
  "outbox.list",
  "ad_credit.list",
  "affiliates.list",
  "affiliates.detail",
  "affiliates.new_code",
  "coupons.list",
  "coupons.detail",
] as const;
export type StaffAccessAction = (typeof STAFF_ACCESS_ACTIONS)[number];

export interface StaffAccessEntry {
  readonly staffUserId: string;
  /** A name from STAFF_ACCESS_ACTIONS. Typed loosely here so the database's own check is what refuses a bad one. */
  readonly action: StaffAccessAction | (string & {});
  readonly targetType?: string | null;
  readonly targetId?: string | null;
  readonly businessId?: string | null;
  readonly result?: StaffAccessResult;
  readonly detail?: string | null;
  readonly ipAddress?: string | null;
}

export interface StoredStaffAccess {
  readonly id: string;
  readonly staffUserId: string;
  /** The address the staff member signs in with, so the review screen says who rather than an id. */
  readonly staffEmail: string;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly businessId: string | null;
  readonly result: string;
  readonly detail: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
}

export async function recordStaffAccess(db: Database, entry: StaffAccessEntry): Promise<void> {
  await db.insert(staffAccessLog).values({
    staffUserId: entry.staffUserId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    businessId: entry.businessId ?? null,
    result: entry.result ?? "ok",
    detail: entry.detail ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}

/** The newest entries first, for the weekly review screen. */
export async function listRecentStaffAccess(db: Database, limit: number): Promise<StoredStaffAccess[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError(`The number of access records to list must be a whole number from 1 to 1000, received ${limit}`);
  }
  return db
    .select({
      id: staffAccessLog.id,
      staffUserId: staffAccessLog.staffUserId,
      staffEmail: users.email,
      action: staffAccessLog.action,
      targetType: staffAccessLog.targetType,
      targetId: staffAccessLog.targetId,
      businessId: staffAccessLog.businessId,
      result: staffAccessLog.result,
      detail: staffAccessLog.detail,
      ipAddress: staffAccessLog.ipAddress,
      createdAt: staffAccessLog.createdAt,
    })
    .from(staffAccessLog)
    .innerJoin(users, eq(users.id, staffAccessLog.staffUserId))
    .orderBy(desc(staffAccessLog.createdAt), desc(staffAccessLog.id))
    .limit(limit);
}

export interface StaffAccessTally {
  readonly staffUserId: string;
  readonly staffEmail: string;
  readonly action: string;
  readonly result: string;
  readonly count: number;
}

/**
 * How many times each staff member did each thing, and with what result, since `since`: what the nightly review compares
 * with its limits. Grouped in the database, so a busy day is still one small result.
 */
export async function tallyStaffAccessSince(db: Database, since: Date): Promise<readonly StaffAccessTally[]> {
  const rows = await db
    .select({
      staffUserId: staffAccessLog.staffUserId,
      staffEmail: users.email,
      action: staffAccessLog.action,
      result: staffAccessLog.result,
      count: count(),
    })
    .from(staffAccessLog)
    .innerJoin(users, eq(users.id, staffAccessLog.staffUserId))
    .where(gte(staffAccessLog.createdAt, since))
    .groupBy(staffAccessLog.staffUserId, users.email, staffAccessLog.action, staffAccessLog.result);
  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}

export const STAFF_ACCESS_PAGE_SIZE = 50;

/** What the Compliance page narrows the log by. Dates are a half-open window: `from` included, `to` excluded. */
export interface StaffAccessFilter {
  readonly staffUserId?: string;
  readonly action?: string;
  readonly businessId?: string;
  readonly from?: Date;
  readonly to?: Date;
}

/** One page of the log, newest first, for the Compliance page. `page` counts from 0. */
export async function listStaffAccessPage(
  db: Database,
  filter: StaffAccessFilter,
  page: number,
): Promise<{ readonly rows: StoredStaffAccess[]; readonly hasMore: boolean }> {
  if (!Number.isInteger(page) || page < 0 || page > 10_000) throw new RangeError(`The page must be a whole number from 0 to 10000, received ${page}`);
  const conditions: SQL[] = [];
  if (filter.staffUserId !== undefined) conditions.push(eq(staffAccessLog.staffUserId, filter.staffUserId));
  if (filter.action !== undefined) conditions.push(eq(staffAccessLog.action, filter.action));
  if (filter.businessId !== undefined) conditions.push(eq(staffAccessLog.businessId, filter.businessId));
  if (filter.from !== undefined) conditions.push(gte(staffAccessLog.createdAt, filter.from));
  if (filter.to !== undefined) conditions.push(lt(staffAccessLog.createdAt, filter.to));
  const rows = await db
    .select({
      id: staffAccessLog.id,
      staffUserId: staffAccessLog.staffUserId,
      staffEmail: users.email,
      action: staffAccessLog.action,
      targetType: staffAccessLog.targetType,
      targetId: staffAccessLog.targetId,
      businessId: staffAccessLog.businessId,
      result: staffAccessLog.result,
      detail: staffAccessLog.detail,
      ipAddress: staffAccessLog.ipAddress,
      createdAt: staffAccessLog.createdAt,
    })
    .from(staffAccessLog)
    .innerJoin(users, eq(users.id, staffAccessLog.staffUserId))
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(staffAccessLog.createdAt), desc(staffAccessLog.id))
    .limit(STAFF_ACCESS_PAGE_SIZE + 1)
    .offset(page * STAFF_ACCESS_PAGE_SIZE);
  return { rows: rows.slice(0, STAFF_ACCESS_PAGE_SIZE), hasMore: rows.length > STAFF_ACCESS_PAGE_SIZE };
}

