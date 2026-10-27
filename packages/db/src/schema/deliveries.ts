import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt } from "./columns";

export const WEBHOOK_SOURCES = ["razorpay", "calcom", "oyechats"] as const;
export type WebhookSource = (typeof WEBHOOK_SOURCES)[number];

export const WEBHOOK_RESULTS = ["handled", "ignored", "failed", "bad_signature"] as const;
export type WebhookResult = (typeof WEBHOOK_RESULTS)[number];

/**
 * One webhook a provider sent, and what came of it. The body is never kept (it carries personal and payment details):
 * only its SHA-256 and size, so a repeated delivery can be told apart. Kept 90 days (purgeOldDeliveries).
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    source: text("source").$type<WebhookSource>().notNull(),
    eventType: text("event_type").notNull(),
    result: text("result").$type<WebhookResult>().notNull(),
    /** A short reason written by code, never a message copied from the payload. */
    error: text("error"),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    bodySha256: text("body_sha256").notNull(),
    bodyBytes: integer("body_bytes").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("webhook_events_received_at_idx").on(table.receivedAt),
    check("webhook_events_source_check", sql`${table.source} in ('razorpay', 'calcom', 'oyechats')`),
    check("webhook_events_result_check", sql`${table.result} in ('handled', 'ignored', 'failed', 'bad_signature')`),
    check("webhook_events_event_type_check", sql`char_length(${table.eventType}) between 1 and 64`),
    check("webhook_events_error_check", sql`${table.error} is null or char_length(${table.error}) <= 300`),
    check("webhook_events_body_sha256_check", sql`${table.bodySha256} ~ '^[0-9a-f]{64}$'`),
    check("webhook_events_body_bytes_check", sql`${table.bodyBytes} >= 0`),
  ],
);

/** The Teams channels an alert can go to. Mirrors TEAMS_DESTINATIONS in packages/shared/src/lib/teams-webhook.ts. */
export const ALERT_DESTINATIONS = ["enquiries", "payments", "customers", "support", "system"] as const;
export type AlertDestination = (typeof ALERT_DESTINATIONS)[number];

export const ALERT_RESULTS = ["sent", "rejected", "unreachable", "unreadable"] as const;
export type AlertResult = (typeof ALERT_RESULTS)[number];

/**
 * One Teams alert we tried to post. The card is kept only while the alert has not gone through, so staff can send it
 * again; a successful send clears it. Kept 90 days (purgeOldDeliveries).
 */
export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    destination: text("destination").$type<AlertDestination>().notNull(),
    title: text("title").notNull(),
    result: text("result").$type<AlertResult>().notNull(),
    card: jsonb("card").$type<Record<string, unknown>>(),
    attempts: integer("attempts").notNull().default(1),
    createdAt: createdAt(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("alert_deliveries_created_at_idx").on(table.createdAt),
    check("alert_deliveries_destination_check", sql`${table.destination} in ('enquiries', 'payments', 'customers', 'support', 'system')`),
    check("alert_deliveries_result_check", sql`${table.result} in ('sent', 'rejected', 'unreachable', 'unreadable')`),
    check("alert_deliveries_title_check", sql`char_length(${table.title}) between 1 and 200`),
    check("alert_deliveries_attempts_check", sql`${table.attempts} >= 1`),
    check("alert_deliveries_card_check", sql`${table.result} <> 'sent' or ${table.card} is null`),
  ],
);
