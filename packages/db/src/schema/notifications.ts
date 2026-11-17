import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { teamCalls } from "./team-calls";

/** The rows of Settings, Notifications in the v4 mock, in its order. */
export const NOTIFICATION_TOPICS = [
  "new_enquiry",
  "needs_approval",
  "request_reply",
  "billing",
  "monthly_report",
  "product_news",
  "calls",
  "social",
] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

/** The ways a notice reaches a person. Bell is in the app, push is a notice on a device the person opted in. */
export const NOTIFICATION_CHANNELS = ["bell", "email", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Who a stored notice or a push subscription belongs to: a customer of a business, or the one staff account. */
export const NOTIFICATION_AUDIENCES = ["customer", "staff"] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

/**
 * One person's choice to get, or not get, one kind of notice about one business, per channel. No row means the
 * defaults (channelDefaults in queries/notifications.ts). Each person manages their own rows. Events that cannot be
 * switched off are defined in code (notification-events.ts) and ignore these rows.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    topic: text("topic").$type<NotificationTopic>().notNull(),
    email: boolean("email").notNull(),
    /** The in-app bell. Default on, except product news. */
    bell: boolean("bell").notNull().default(true),
    /** Web push on a device the person opted in on. Default off: push is never automatic. */
    push: boolean("push").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.businessId, table.topic] }),
    check(
      "notification_preferences_topic_check",
      sql`${table.topic} in ('new_enquiry', 'needs_approval', 'request_reply', 'billing', 'monthly_report', 'product_news', 'calls', 'social')`,
    ),
  ],
);
export type NotificationPreference = typeof notificationPreferences.$inferSelect;

/** When one person last opened the bell for one business: anything after it is unread. */
export const notificationReads = pgTable(
  "notification_reads",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.businessId] })],
);
export type NotificationRead = typeof notificationReads.$inferSelect;

/**
 * A notice kept for the bell: one row per person for a customer event, one row for the staff console (no recipient, the
 * one staff account reads them). Written by notify() (packages/shared/src/server/notify.ts) with the staff connection.
 * The row is also the ledger that stops a repeat: a notice with the same audience, recipient and dedupe key is written
 * once, whatever channels it uses (`listed` false keeps the row off the bell for events that have no bell line). Kept 90 days
 * (purgeOldNotifications).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    audience: text("audience").$type<NotificationAudience>().notNull(),
    /** The business a customer notice is about. Null for a staff notice that is about no business. */
    businessId: uuid("business_id").references(() => businesses.id),
    /** The person a customer notice is for. Null for the staff console. */
    userId: text("user_id").references(() => users.id),
    /** The event's key in the registry (notification-events.ts), e.g. "kickoff.booked". */
    eventKey: text("event_key").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** A path inside the app that shows the thing the notice is about. */
    link: text("link"),
    /** False when the event only needs the ledger row, not a line in the bell. */
    listed: boolean("listed").notNull().default(true),
    /** What makes this notice the same as an earlier one, e.g. "kickoff-booked:<call id>". */
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: createdAt(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    // Staff rows have no recipient: nulls must count as equal or a staff notice could be written twice.
    unique("notifications_dedupe_idx").on(table.audience, table.userId, table.dedupeKey).nullsNotDistinct(),
    index("notifications_recipient_idx").on(table.userId, table.businessId, table.createdAt),
    index("notifications_audience_created_at_idx").on(table.audience, table.createdAt),
    index("notifications_business_id_idx").on(table.businessId),
    check("notifications_audience_check", sql`${table.audience} in ('customer', 'staff')`),
    check(
      "notifications_recipient_check",
      sql`(${table.audience} = 'customer' and ${table.userId} is not null and ${table.businessId} is not null) or (${table.audience} = 'staff' and ${table.userId} is null)`,
    ),
    check("notifications_title_check", sql`char_length(${table.title}) between 1 and 200`),
    check("notifications_body_check", sql`${table.body} is null or char_length(${table.body}) <= 500`),
    check("notifications_link_check", sql`${table.link} is null or (${table.link} like '/%' and ${table.link} not like '//%' and char_length(${table.link}) <= 300)`),
    check("notifications_dedupe_key_check", sql`char_length(${table.dedupeKey}) between 1 and 200`),
  ],
);
export type StoredNotification = typeof notifications.$inferSelect;

/** One browser or installed app that agreed to get web push. One row per endpoint. Written by package N4 (push). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    audience: text("audience").$type<NotificationAudience>().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** The push service's address for this browser. Unique: re-subscribing the same browser updates the row. */
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    /** Set when the push service says the subscription is gone (404 or 410) or the person turns push off. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("push_subscriptions_endpoint_idx").on(table.endpoint),
    index("push_subscriptions_user_id_idx").on(table.userId),
    check("push_subscriptions_audience_check", sql`${table.audience} in ('customer', 'staff')`),
    check("push_subscriptions_endpoint_check", sql`${table.endpoint} like 'https://%' and char_length(${table.endpoint}) <= 2048`),
    check("push_subscriptions_user_agent_check", sql`${table.userAgent} is null or char_length(${table.userAgent}) <= 300`),
  ],
);
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/**
 * The server's memory of one booked kickoff call's "did it happen?" prompt, so a reload or a second tab agrees and the
 * popup can repeat every 15 minutes until answered. Gone with its call.
 */
export const kickoffPromptState = pgTable("kickoff_prompt_state", {
  callId: uuid("call_id")
    .primaryKey()
    .references(() => teamCalls.id, { onDelete: "cascade" }),
  /** When staff were first told the call time had passed (the one push and email go out then). */
  firstNotifiedAt: timestamp("first_notified_at", { withTimezone: true }),
  /** When the popup was last shown, to repeat it 15 minutes later. */
  lastPopupShownAt: timestamp("last_popup_shown_at", { withTimezone: true }),
  /** When staff answered it (Call completed, They did not join, Reschedule). */
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  /** When the one extra push for a prompt still open after 2 hours went out. */
  reminderPushedAt: timestamp("reminder_pushed_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});
export type KickoffPromptState = typeof kickoffPromptState.$inferSelect;
