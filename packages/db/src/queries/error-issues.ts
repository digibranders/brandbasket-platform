import { createHash } from "node:crypto";
import { and, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { errorEventReceipts, errorIssues, type ErrorIssueStatus, type ErrorSourceFrame } from "../schema/error-issues";
import { staffMembers } from "../schema/staff";

const USER_BIT_COUNT = 1024;

export interface GroupableErrorReport {
  readonly app: string;
  readonly operation: string;
  readonly errorClass: string;
  readonly route: string;
  readonly frames: readonly ErrorSourceFrame[];
}
export interface RecordedErrorReport extends GroupableErrorReport {
  readonly eventId: string;
  readonly release: string;
  readonly browser: string;
  readonly severity: string;
}
export interface ApproximateUsers { readonly count: number; readonly saturated: boolean }
export type ErrorIssue = Omit<typeof errorIssues.$inferSelect, "userBits"> & { readonly affectedUsers: ApproximateUsers };

export function errorIssueFingerprint(report: GroupableErrorReport): string {
  return createHash("sha256").update(JSON.stringify([report.app, report.operation, report.errorClass, report.route, report.frames])).digest("hex");
}

/** Bounded linear-counting bitmap, salted by the issue so it cannot link identities across issues. */
export function affectedUserBits(fingerprint: string, userId?: string): string {
  if (userId === undefined) return "0".repeat(USER_BIT_COUNT);
  const index = createHash("sha256").update(`${fingerprint}:${userId}`).digest().readUInt32BE(0) % USER_BIT_COUNT;
  return `${"0".repeat(index)}1${"0".repeat(USER_BIT_COUNT - index - 1)}`;
}

export function approximateAffectedUsers(bits: string): ApproximateUsers {
  const occupied = Array.from(bits).filter((bit) => bit === "1").length;
  if (occupied === 0) return { count: 0, saturated: false };
  if (occupied >= USER_BIT_COUNT) return { count: USER_BIT_COUNT, saturated: true };
  return { count: Math.round(-USER_BIT_COUNT * Math.log(1 - occupied / USER_BIT_COUNT)), saturated: false };
}

function presentIssue(row: typeof errorIssues.$inferSelect): ErrorIssue {
  const { userBits, ...issue } = row;
  return { ...issue, affectedUsers: approximateAffectedUsers(userBits) };
}

/** Atomic receipt insertion + issue upsert. Duplicate event ids cannot increment counts, including concurrent calls. */
export async function recordErrorReport(db: Database, report: RecordedErrorReport, userId?: string, now: Date = new Date()): Promise<string | null> {
  const fingerprint = errorIssueFingerprint(report);
  const userBits = affectedUserBits(fingerprint, userId);
  return db.transaction(async (tx): Promise<string | null> => {
    await tx.execute(sql`set local statement_timeout = '1500ms'`);
    await tx.execute(sql`set local lock_timeout = '500ms'`);
    await tx.delete(errorEventReceipts).where(lt(errorEventReceipts.receivedAt, new Date(now.getTime() - 86_400_000)));
    const receipt = await tx.insert(errorEventReceipts).values({ eventId: report.eventId, receivedAt: now }).onConflictDoNothing().returning({ eventId: errorEventReceipts.eventId });
    if (receipt.length === 0) return null;
    const rows = await tx.insert(errorIssues).values({
      fingerprint, app: report.app, operation: report.operation, errorClass: report.errorClass,
      route: report.route, release: report.release, browser: report.browser, severity: report.severity,
      frames: report.frames, userBits, occurrenceCount: 1, firstSeenAt: now, lastSeenAt: now,
    }).onConflictDoUpdate({ target: errorIssues.fingerprint, set: {
      occurrenceCount: sql`least(${errorIssues.occurrenceCount}::bigint + 1, 2147483647)::integer`,
      userBits: sql`(${errorIssues.userBits}::bit(1024) | ${userBits}::bit(1024))::text`,
      firstSeenAt: sql`least(${errorIssues.firstSeenAt}, ${now})`,
      lastSeenAt: sql`greatest(${errorIssues.lastSeenAt}, ${now})`,
      release: sql`case when ${now} >= ${errorIssues.lastSeenAt} then ${report.release} else ${errorIssues.release} end`,
      browser: sql`case when ${now} >= ${errorIssues.lastSeenAt} then ${report.browser} else ${errorIssues.browser} end`,
      severity: sql`case when ${errorIssues.severity} = 'fatal' then 'fatal' else ${report.severity} end`,
      status: sql`case when ${errorIssues.status} = 'resolved' then 'new' else ${errorIssues.status} end`,
      regressionCount: sql`case when ${errorIssues.status} = 'resolved' then least(${errorIssues.regressionCount}::bigint + 1, 2147483647)::integer else ${errorIssues.regressionCount} end`,
      resolvedAt: sql`case when ${errorIssues.status} = 'resolved' then null else ${errorIssues.resolvedAt} end`,
    } }).returning({ id: errorIssues.id });
    return rows[0]?.id ?? null;
  });
}

export async function listErrorIssues(db: Database, options: { readonly status?: ErrorIssueStatus; readonly page?: number } = {}): Promise<{ readonly issues: ErrorIssue[]; readonly total: number }> {
  const page = Number.isSafeInteger(options.page) ? Math.min(400, Math.max(1, options.page ?? 1)) : 1;
  const where = options.status === undefined ? undefined : eq(errorIssues.status, options.status);
  const [rows, totals] = await Promise.all([
    db.select().from(errorIssues).where(where).orderBy(desc(errorIssues.lastSeenAt), desc(errorIssues.id)).limit(25).offset((page - 1) * 25),
    db.select({ total: count() }).from(errorIssues).where(where),
  ]);
  return { issues: rows.map(presentIssue), total: totals[0]?.total ?? 0 };
}

export async function getErrorIssue(db: Database, id: string): Promise<ErrorIssue | null> {
  const rows = await db.select().from(errorIssues).where(eq(errorIssues.id, id)).limit(1);
  return rows[0] === undefined ? null : presentIssue(rows[0]);
}

export async function countActiveErrorIssues(db: Database): Promise<number> {
  const rows = await db.select({ total: count() }).from(errorIssues).where(inArray(errorIssues.status, ["new", "investigating"]));
  return rows[0]?.total ?? 0;
}

/** Optimistic status change prevents resolving over an occurrence that arrived while staff reviewed the issue. */
export async function updateErrorIssueStatus(db: Database, id: string, status: ErrorIssueStatus, expectedOccurrenceCount: number, assigneeStaffId?: string | null): Promise<boolean> {
  if (assigneeStaffId !== undefined && assigneeStaffId !== null) {
    const staff = await db.select({ id: staffMembers.userId }).from(staffMembers).where(and(eq(staffMembers.userId, assigneeStaffId), eq(staffMembers.active, true))).limit(1);
    if (staff.length === 0) throw new Error("Automatic error assignee must be an active staff member.");
  }
  const rows = await db.update(errorIssues).set({ status, resolvedAt: status === "resolved" ? new Date() : null, assigneeStaffId }).where(and(eq(errorIssues.id, id), eq(errorIssues.occurrenceCount, expectedOccurrenceCount))).returning({ id: errorIssues.id });
  return rows.length > 0;
}

/** Scheduled native maintenance: resolved aggregates expire after 90 days; active/ignored incidents stay available. */
export async function purgeErrorIssues(db: Database, now: Date = new Date(), limit = 100): Promise<number> {
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) throw new RangeError("Automatic error retention requires a valid date and a batch limit of 1 to 1,000.");
  return db.transaction(async (tx): Promise<number> => {
    await tx.execute(sql`set local statement_timeout = '1500ms'`);
    await tx.delete(errorEventReceipts).where(lt(errorEventReceipts.receivedAt, new Date(now.getTime() - 86_400_000)));
    const cutoff = new Date(now.getTime() - 90 * 86_400_000);
    const expired = tx.select({ id: errorIssues.id }).from(errorIssues).where(and(eq(errorIssues.status, "resolved"), lt(errorIssues.resolvedAt, cutoff))).limit(limit);
    const rows = await tx.delete(errorIssues).where(and(inArray(errorIssues.id, expired), eq(errorIssues.status, "resolved"), lt(errorIssues.resolvedAt, cutoff))).returning({ id: errorIssues.id });
    return rows.length;
  });
}
