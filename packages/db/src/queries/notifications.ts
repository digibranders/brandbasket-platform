import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  notificationPreferences,
  notificationReads,
  notifications,
  NOTIFICATION_TOPICS,
  type NotificationChannel,
  type NotificationTopic,
  type StoredNotification,
} from "../schema/notifications";
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
  calls: true,
  social: true,
};

export type ChannelChoices = Readonly<Record<NotificationChannel, boolean>>;

/**
 * What a person gets on each channel when they have never touched the setting. The bell follows the email default; push is
 * off everywhere: it is never automatic, the person turns it on after the browser has asked.
 */
export function channelDefaults(topic: NotificationTopic): ChannelChoices {
  return { bell: EMAIL_BY_DEFAULT[topic], email: EMAIL_BY_DEFAULT[topic], push: false };
}

/** The stored channels of a row where it has them, the topic's defaults for the rest. */
export function resolveChoices(topic: NotificationTopic, stored: Partial<ChannelChoices> | undefined): ChannelChoices {
  return { ...channelDefaults(topic), ...stored };
}

export function emailByDefault(topic: NotificationTopic): boolean {
  return EMAIL_BY_DEFAULT[topic];
}

/** The stored choice when there is one, the default when there is none. */
export function resolveEmailPreference(topic: NotificationTopic, stored: boolean | undefined): boolean {
  return stored ?? emailByDefault(topic);
}

/** Every topic with its effective setting on each channel, from the rows a person has. */
export function effectivePreferences(
  rows: readonly ({ readonly topic: NotificationTopic } & ChannelChoices)[],
): Record<NotificationTopic, ChannelChoices> {
  const stored = new Map(rows.map((row) => [row.topic, { email: row.email, bell: row.bell, push: row.push }] as const));
  return Object.fromEntries(NOTIFICATION_TOPICS.map((topic) => [topic, resolveChoices(topic, stored.get(topic))])) as Record<
    NotificationTopic,
    ChannelChoices
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

/**
 * One person's choices for one topic on every channel. Throws when the lookup fails: notify() decides what a failed lookup
 * means for each kind of event. Call it with the staff connection (see shouldEmail).
 */
export async function getChannelChoices(db: Database, userId: string, businessId: string, topic: NotificationTopic): Promise<ChannelChoices> {
  const [row] = await db
    .select({ email: notificationPreferences.email, bell: notificationPreferences.bell, push: notificationPreferences.push })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.businessId, businessId),
        eq(notificationPreferences.topic, topic),
      ),
    )
    .limit(1);
  return resolveChoices(topic, row);
}

/** Customer side, inside withTenantScope: the signed-in person's settings for the scoped business, every topic on every channel. */
export async function listNotificationPreferences(tx: ScopedTransaction, userId: string): Promise<Record<NotificationTopic, ChannelChoices>> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select({
      topic: notificationPreferences.topic,
      email: notificationPreferences.email,
      bell: notificationPreferences.bell,
      push: notificationPreferences.push,
    })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.businessId, businessId)));
  return effectivePreferences(rows);
}

/**
 * Customer side: stores one channel's choice for one topic. A new row starts from the topic's defaults on the other
 * channels, so switching the bell on for product news does not switch its email on. Row-level security refuses a user id
 * that is not the signed-in one.
 */
export async function setNotificationPreference(
  tx: ScopedTransaction,
  userId: string,
  topic: NotificationTopic,
  channel: NotificationChannel,
  enabled: boolean,
): Promise<void> {
  const businessId = await currentBusinessId(tx);
  await tx
    .insert(notificationPreferences)
    .values({ userId, businessId, topic, ...channelDefaults(topic), [channel]: enabled })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.businessId, notificationPreferences.topic],
      set: { [channel]: enabled, updatedAt: new Date() },
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

/** The most notices the bell asks for at once. */
export const BELL_NOTIFICATION_LIMIT = 20;

/** A stored notice as the bell shows it. */
export type BellNotification = Pick<StoredNotification, "id" | "eventKey" | "title" | "body" | "link" | "createdAt" | "readAt">;

const BELL_COLUMNS = {
  id: notifications.id,
  eventKey: notifications.eventKey,
  title: notifications.title,
  body: notifications.body,
  link: notifications.link,
  createdAt: notifications.createdAt,
  readAt: notifications.readAt,
} as const;

/**
 * Customer side, inside withTenantScope: the signed-in person's newest bell notices for the scoped business. Row-level
 * security already limits the rows to theirs; the filters say so in the query too.
 */
export async function listBellNotifications(tx: ScopedTransaction, userId: string, limit: number = BELL_NOTIFICATION_LIMIT): Promise<BellNotification[]> {
  const businessId = await currentBusinessId(tx);
  return tx
    .select(BELL_COLUMNS)
    .from(notifications)
    .where(and(eq(notifications.audience, "customer"), eq(notifications.userId, userId), eq(notifications.businessId, businessId), eq(notifications.listed, true)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(Math.min(Math.max(1, limit), BELL_NOTIFICATION_LIMIT));
}

/** Customer side: marks one of the person's notices read. Returns false when it is not theirs or was already read. Never moves a read time. */
export async function markNotificationRead(tx: ScopedTransaction, userId: string, notificationId: string, at: Date = new Date()): Promise<boolean> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .update(notifications)
    .set({ readAt: at })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.audience, "customer"),
        eq(notifications.userId, userId),
        eq(notifications.businessId, businessId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/** Staff console, staff connection: the newest notices for the one staff account. */
export async function listStaffNotifications(db: Database, limit: number = BELL_NOTIFICATION_LIMIT): Promise<BellNotification[]> {
  return db
    .select(BELL_COLUMNS)
    .from(notifications)
    .where(and(eq(notifications.audience, "staff"), eq(notifications.listed, true)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(Math.min(Math.max(1, limit), BELL_NOTIFICATION_LIMIT));
}

/** Staff console: marks one staff notice read. Returns false when it is not a staff notice or was already read. */
export async function markStaffNotificationRead(db: Database, notificationId: string, at: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ readAt: at })
    .where(and(eq(notifications.id, notificationId), eq(notifications.audience, "staff"), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/** Notices are kept this long (docs/operations/retention-schedule.md). */
export const NOTIFICATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Deletes notices older than their retention, read or not. Returns how many went. Nightly maintenance calls it. */
export async function purgeOldNotifications(db: Database, now: Date): Promise<number> {
  const rows = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, new Date(now.getTime() - NOTIFICATION_RETENTION_MS)))
    .returning({ id: notifications.id });
  return rows.length;
}
