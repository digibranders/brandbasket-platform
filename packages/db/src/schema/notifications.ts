import { sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses } from "./businesses";
import { updatedAt } from "./columns";

/** The rows of Settings, Notifications in the v4 mock, in its order. */
export const NOTIFICATION_TOPICS = [
  "new_enquiry",
  "needs_approval",
  "request_reply",
  "billing",
  "monthly_report",
  "product_news",
] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

/**
 * One person's choice to get, or not get, one kind of email about one business. No row means the default
 * (emailByDefault in queries/notifications.ts). Each person manages their own rows.
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
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.businessId, table.topic] }),
    check(
      "notification_preferences_topic_check",
      sql`${table.topic} in ('new_enquiry', 'needs_approval', 'request_reply', 'billing', 'monthly_report', 'product_news')`,
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
