import { and, count, eq, inArray, isNull, lt, notExists, notInArray, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import {
  accountExitFeedback,
  accountOtps,
  breachRegister,
  consentRecords,
  directoryEnquiries,
  directoryReviewComments,
  directoryReviews,
  directoryVisitors,
  leads,
  privacyRequests,
  rateLimitBuckets,
  sessions,
  setupInvites,
  staffAccessLog,
  verifications,
} from "../schema";
import { purgeExpiredAccountOtps } from "./account-otps";

/*
 * The scheduled purge (DPDP Act s.8(7): erase personal data once its purpose is served). Two kinds of rule:
 *
 * - What has only a technical life: a session, a reset or confirmation token and a texted code are useless once they run
 *   out; a rate-limit bucket is keyed by a phone number or an address and is useless once its window has passed.
 * - The approved retention schedule (M1 in docs/privacy/PRIVACY-PLAN.md): leads, enquiries, visitor accounts, exit
 *   feedback, privacy requests, the breach register, the staff access log and consent records, each after its period.
 *
 * Kept elsewhere: closed support tickets (support-retention.ts in the platform app, 24 months), the email outbox
 * (emails.ts, 90 days), closed accounts with their clinic data (account-erasure.ts, 30 days after service ends).
 * Tax invoices and payments are kept 8 years by law; the first fall due in 2034.
 */

/** How long after it ends a session or a token is kept: a day, enough to explain a "your link has expired" message. */
const GRACE_MS = 24 * 60 * 60 * 1000;
/** Rate-limit windows are at most a day long; two days leaves any window that could still count well alone. */
const BUCKET_KEEP_MS = 2 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The approved periods. The database's DELETE policies (migration 0162) hold the record-keeping ones to the same limits. */
export const RETENTION_PERIODS = {
  /** A lead that never became a customer, counted from the last change to it. */
  leadMonths: 12,
  enquiryMonths: 12,
  /** A visitor account with no review or comment left, counted from when it was last seen. */
  visitorMonths: 12,
  exitFeedbackMonths: 12,
  /** A closed privacy request, counted from closing. */
  privacyRequestMonths: 36,
  /** A closed breach record, counted from its last change. */
  breachRecordMonths: 60,
  /** One year is the legal minimum for logs (DPDP Rules r.8(3)); the extra days are a margin. */
  staffAccessLogDays: 400,
  /** A consent record, counted from when the data it covers was found gone. */
  consentRecordMonths: 36,
} as const;

/** Leads in these states belong to an account, which has its own erasure. */
const CUSTOMER_LEAD_STATUSES = ["account_created", "paid"] as const;

export interface RetentionCounts {
  readonly sessions: number;
  readonly verifications: number;
  readonly rateLimitBuckets: number;
  readonly accountOtps: number;
  readonly leads: number;
  readonly enquiries: number;
  readonly visitors: number;
  readonly exitFeedback: number;
  readonly privacyRequests: number;
  readonly breachRecords: number;
  readonly staffAccessLog: number;
  readonly consentRecords: number;
}

/** The same calendar date `months` months before `now`, in UTC (the 31st steps back to the month's last day). */
export function monthsBefore(now: Date, months: number): Date {
  const at = new Date(now);
  const day = at.getUTCDate();
  at.setUTCDate(1);
  at.setUTCMonth(at.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).getUTCDate();
  at.setUTCDate(Math.min(day, lastDay));
  return at;
}

/** The condition each rule deletes by, worked out once for `now` so counting and removing always agree. */
function scheduleConditions(now: Date) {
  const periods = RETENTION_PERIODS;
  return {
    leads: and(
      lt(leads.updatedAt, monthsBefore(now, periods.leadMonths)),
      isNull(leads.businessId),
      notInArray(leads.status, [...CUSTOMER_LEAD_STATUSES]),
    ) as SQL,
    enquiries: lt(directoryEnquiries.createdAt, monthsBefore(now, periods.enquiryMonths)),
    visitors: and(
      lt(directoryVisitors.lastSeenAt, monthsBefore(now, periods.visitorMonths)),
      // A review or comment, published or hidden, keeps its author's account: the person may still want to delete it.
      notExists(sql`(select 1 from ${directoryReviews} where ${directoryReviews.phone} = ${directoryVisitors.phone})`),
      notExists(sql`(select 1 from ${directoryReviewComments} where ${directoryReviewComments.phone} = ${directoryVisitors.phone})`),
    ) as SQL,
    exitFeedback: lt(accountExitFeedback.createdAt, monthsBefore(now, periods.exitFeedbackMonths)),
    privacyRequests: and(eq(privacyRequests.status, "closed"), lt(privacyRequests.closedAt, monthsBefore(now, periods.privacyRequestMonths))) as SQL,
    breachRecords: and(eq(breachRegister.status, "closed"), lt(breachRegister.updatedAt, monthsBefore(now, periods.breachRecordMonths))) as SQL,
    staffAccessLog: lt(staffAccessLog.createdAt, new Date(now.getTime() - periods.staffAccessLogDays * DAY_MS)),
    consentRecords: lt(consentRecords.subjectErasedAt, monthsBefore(now, periods.consentRecordMonths)),
  };
}

/**
 * A consent record whose subject no longer exists: the lead, enquiry, visitor or patient row is gone (or the enquiry was
 * erased in place), or the account was erased (account-erasure.ts keeps the user row but rewrites its email). Subject
 * types this does not know are left alone.
 */
const consentSubjectGone = sql`(
  (${consentRecords.subjectType} = 'lead' and not exists (select 1 from leads l where l.id::text = ${consentRecords.subjectRef}))
  or (${consentRecords.subjectType} = 'enquiry' and not exists (select 1 from directory_enquiries e where e.id::text = ${consentRecords.subjectRef} and e.erased_at is null))
  or (${consentRecords.subjectType} = 'visitor' and not exists (select 1 from directory_visitors v where v.id::text = ${consentRecords.subjectRef}))
  or (${consentRecords.subjectType} = 'patient' and not exists (select 1 from patients p where p.id::text = ${consentRecords.subjectRef}))
  or (${consentRecords.subjectType} = 'user' and not exists (
    select 1 from users u where u.id = ${consentRecords.subjectRef} and u.email <> 'erased-' || lower(u.id) || '@erased.invalid'
  ))
)`;

const total = (rows: readonly { total: number }[]): number => rows[0]?.total ?? 0;

/** How many rows `purgeExpiredRetention` would remove at `now`, without removing any. */
export async function countExpiredRetention(db: Database, now: Date): Promise<RetentionCounts> {
  const graceEnd = new Date(now.getTime() - GRACE_MS);
  const when = scheduleConditions(now);
  const [sessionRows, verificationRows, bucketRows, otpRows] = await Promise.all([
    db.select({ total: count() }).from(sessions).where(lt(sessions.expiresAt, graceEnd)),
    db.select({ total: count() }).from(verifications).where(lt(verifications.expiresAt, graceEnd)),
    db.select({ total: count() }).from(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, new Date(now.getTime() - BUCKET_KEEP_MS))),
    // Account codes are purged an hour after they run out (account-otps.ts), so the count uses the same line.
    db.select({ total: count() }).from(accountOtps).where(lt(accountOtps.expiresAt, new Date(now.getTime() - 60 * 60 * 1000))),
  ]);
  const [leadRows, enquiryRows, visitorRows, feedbackRows, requestRows, breachRows, logRows, consentRows] = await Promise.all([
    db.select({ total: count() }).from(leads).where(when.leads),
    db.select({ total: count() }).from(directoryEnquiries).where(when.enquiries),
    db.select({ total: count() }).from(directoryVisitors).where(when.visitors),
    db.select({ total: count() }).from(accountExitFeedback).where(when.exitFeedback),
    db.select({ total: count() }).from(privacyRequests).where(when.privacyRequests),
    db.select({ total: count() }).from(breachRegister).where(when.breachRecords),
    db.select({ total: count() }).from(staffAccessLog).where(when.staffAccessLog),
    // Only rows already marked: a dry run does not mark, so records whose subject goes tonight are not counted.
    db.select({ total: count() }).from(consentRecords).where(when.consentRecords),
  ]);
  return {
    sessions: total(sessionRows),
    verifications: total(verificationRows),
    rateLimitBuckets: total(bucketRows),
    accountOtps: total(otpRows),
    leads: total(leadRows),
    enquiries: total(enquiryRows),
    visitors: total(visitorRows),
    exitFeedback: total(feedbackRows),
    privacyRequests: total(requestRows),
    breachRecords: total(breachRows),
    staffAccessLog: total(logRows),
    consentRecords: total(consentRows),
  };
}

/** Removes everything past its time, technical or scheduled, and says how many of each. */
export async function purgeExpiredRetention(db: Database, now: Date): Promise<RetentionCounts> {
  const graceEnd = new Date(now.getTime() - GRACE_MS);
  const when = scheduleConditions(now);
  const removedSessions = await db.delete(sessions).where(lt(sessions.expiresAt, graceEnd)).returning({ id: sessions.id });
  const removedVerifications = await db.delete(verifications).where(lt(verifications.expiresAt, graceEnd)).returning({ id: verifications.id });
  const removedBuckets = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.windowStart, new Date(now.getTime() - BUCKET_KEEP_MS)))
    .returning({ key: rateLimitBuckets.key });
  const removedAccountOtps = await purgeExpiredAccountOtps(db, now);

  // An invite points at its lead, so it goes first, in the same transaction.
  const removedLeads = await db.transaction(async (tx) => {
    await tx.delete(setupInvites).where(inArray(setupInvites.leadId, tx.select({ id: leads.id }).from(leads).where(when.leads)));
    return tx.delete(leads).where(when.leads).returning({ id: leads.id });
  });
  const removedEnquiries = await db.delete(directoryEnquiries).where(when.enquiries).returning({ id: directoryEnquiries.id });
  const removedVisitors = await db.delete(directoryVisitors).where(when.visitors).returning({ id: directoryVisitors.id });
  const removedFeedback = await db.delete(accountExitFeedback).where(when.exitFeedback).returning({ id: accountExitFeedback.id });
  const removedRequests = await db.delete(privacyRequests).where(when.privacyRequests).returning({ id: privacyRequests.id });
  const removedBreaches = await db.delete(breachRegister).where(when.breachRecords).returning({ id: breachRegister.id });
  const removedLog = await db.delete(staffAccessLog).where(when.staffAccessLog).returning({ id: staffAccessLog.id });

  // After the deletions above, so a subject removed tonight starts its three years tonight. Marked with the database's
  // own clock, which is all its policy accepts (migration 0162).
  await db
    .update(consentRecords)
    .set({ subjectErasedAt: sql`now()` })
    .where(and(isNull(consentRecords.subjectErasedAt), consentSubjectGone));
  const removedConsent = await db.delete(consentRecords).where(when.consentRecords).returning({ id: consentRecords.id });

  return {
    sessions: removedSessions.length,
    verifications: removedVerifications.length,
    rateLimitBuckets: removedBuckets.length,
    accountOtps: removedAccountOtps,
    leads: removedLeads.length,
    enquiries: removedEnquiries.length,
    visitors: removedVisitors.length,
    exitFeedback: removedFeedback.length,
    privacyRequests: removedRequests.length,
    breachRecords: removedBreaches.length,
    staffAccessLog: removedLog.length,
    consentRecords: removedConsent.length,
  };
}
