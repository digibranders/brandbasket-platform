import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { notificationPreferences, notificationReads, NOTIFICATION_TOPICS, type NotificationTopic } from "../schema/notifications";
import type { ScopedTransaction } from "../scope";
import { currentBusinessId } from "./tenant";

/**
 * What a person gets when they have never touched the setting. Everything is on, except product news, which the
 * approved mock (Settings, Notifications) shows off: we do not send marketing mail to someone who has not asked.
 */
const EMAIL_BY_DEFAULT: Readonly<Record<NotificationTopic, boolean>> = {
  new_enquiry: true,
  needs_approval: true,
  request_reply: true,
  billing: true,
  monthly_report: true,
  product_news: false,
};

export function emailByDefault(topic: NotificationTopic): boolean {
  return EMAIL_BY_DEFAULT[topic];
}

/** The stored choice when there is one, the default when there is none. */
export function resolveEmailPreference(topic: NotificationTopic, stored: boolean | undefined): boolean {
  return stored ?? emailByDefault(topic);
}

/** Every topic with its effective setting, from the rows a person has. */
export function effectivePreferences(
  rows: readonly { readonly topic: NotificationTopic; readonly email: boolean }[],
): Record<NotificationTopic, boolean> {
  const stored = new Map(rows.map((row) => [row.topic, row.email]));
  return Object.fromEntries(NOTIFICATION_TOPICS.map((topic) => [topic, resolveEmailPreference(topic, stored.get(topic))])) as Record<
    NotificationTopic,
    boolean
  >;
}

/**
 * Whether to send one person an email of this topic about this business. Call it with the staff connection, the one
 * mail is sent from: on the app connection without a tenant scope row-level security hides every row, and the answer
 * would silently fall back to the default.
 */
export async function shouldEmail(db: Database, userId: string, businessId: string, topic: NotificationTopic): Promise<boolean> {
  const [row] = await db
    .select({ email: notificationPreferences.email })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.businessId, businessId),
        eq(notificationPreferences.topic, topic),
      ),
    )
    .limit(1);
  return resolveEmailPreference(topic, row?.email);
}

/** Customer side, inside withTenantScope: the signed-in person's settings for the scoped business, every topic. */
export async function listNotificationPreferences(tx: ScopedTransaction, userId: string): Promise<Record<NotificationTopic, boolean>> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select({ topic: notificationPreferences.topic, email: notificationPreferences.email })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.businessId, businessId)));
  return effectivePreferences(rows);
}

/** Customer side: stores one choice. Row-level security refuses a user id that is not the signed-in one. */
export async function setNotificationPreference(tx: ScopedTransaction, userId: string, topic: NotificationTopic, email: boolean): Promise<void> {
  const businessId = await currentBusinessId(tx);
  await tx
    .insert(notificationPreferences)
    .values({ userId, businessId, topic, email })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.businessId, notificationPreferences.topic],
      set: { email, updatedAt: new Date() },
    });
}

/** Customer side: when the person last opened the bell for the scoped business; null if never. */
export async function getNotificationsSeenAt(tx: ScopedTransaction, userId: string): Promise<Date | null> {
  const businessId = await currentBusinessId(tx);
  const [row] = await tx
    .select({ seenAt: notificationReads.seenAt })
    .from(notificationReads)
    .where(and(eq(notificationReads.userId, userId), eq(notificationReads.businessId, businessId)))
    .limit(1);
  return row?.seenAt ?? null;
}

/** Customer side: marks everything up to `at` as read. Never moves the time backwards. */
export async function markNotificationsSeen(tx: ScopedTransaction, userId: string, at: Date = new Date()): Promise<void> {
  const businessId = await currentBusinessId(tx);
  await tx
    .insert(notificationReads)
    .values({ userId, businessId, seenAt: at })
    .onConflictDoUpdate({
      target: [notificationReads.userId, notificationReads.businessId],
      set: { seenAt: sql`greatest(${notificationReads.seenAt}, excluded.seen_at)` },
    });
}
