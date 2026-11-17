import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { businessMembers, notifications, users, type NotificationAudience } from "../schema";
import { isPhoneAccountEmail } from "../phone-account";

/** What notify() writes for one recipient. */
export interface NotificationRow {
  readonly audience: NotificationAudience;
  readonly businessId: string | null;
  readonly userId: string | null;
  readonly eventKey: string;
  readonly title: string;
  readonly body: string | null;
  readonly link: string | null;
  /** False keeps the row off the bell: it is only the ledger that stops a repeat. */
  readonly listed: boolean;
  readonly dedupeKey: string;
}

export interface RecordedNotification {
  readonly id: string;
  /** False when the same notice was written before: nothing is sent again. */
  readonly created: boolean;
}

/**
 * Writes a notice, once. The unique key (audience, recipient, dedupe key) makes a repeat a no-op, so a redelivered webhook
 * or a timer that runs twice cannot notify twice. Staff connection.
 */
export async function recordNotification(db: Database, row: NotificationRow): Promise<RecordedNotification> {
  const [inserted] = await db.insert(notifications).values(row).onConflictDoNothing().returning({ id: notifications.id });
  if (inserted !== undefined) return { id: inserted.id, created: true };
  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.audience, row.audience),
        eq(notifications.dedupeKey, row.dedupeKey),
        row.userId === null ? undefined : eq(notifications.userId, row.userId),
      ),
    )
    .limit(1);
  if (existing === undefined) throw new Error("A notification was neither written nor found after a conflict.");
  return { id: existing.id, created: false };
}

export interface NotificationRecipient {
  readonly userId: string;
  readonly name: string;
  /** Null for an account that signs in with a phone number: its stored address is a placeholder nobody reads. */
  readonly email: string | null;
}

/**
 * Who a customer notice is for: the listed people when given (only those who are members of the business), otherwise the
 * business's owner. Staff connection, since notices are written from webhooks and timers with no signed-in person.
 */
export async function listNotificationRecipients(db: Database, businessId: string, userIds?: readonly string[]): Promise<NotificationRecipient[]> {
  if (userIds !== undefined && userIds.length === 0) return [];
  const rows = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(
      userIds === undefined
        ? and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, "owner"))
        : and(eq(businessMembers.businessId, businessId), inArray(businessMembers.userId, [...userIds])),
    );
  return rows.map((row) => ({ userId: row.userId, name: row.name, email: isPhoneAccountEmail(row.email) ? null : row.email }));
}
