import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { createdAt } from "./columns";

/**
 * `pending`: queued, waiting for its next attempt. `sent`: Brevo took it. `local_only`: recorded but never sent (local
 * development). `failed`: Brevo did not take it and no attempts are left. `bounced`: Brevo took it, the address did not.
 */
export const EMAIL_STATUSES = ["pending", "sent", "local_only", "failed", "bounced"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/**
 * Every email the platform produces. In local development nothing is actually sent: the outbox transport records
 * the message here and staff read it in the console. On a real deployment Brevo sends it and this row says whether it went.
 */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    /** Template name, e.g. "setup-link". */
    template: text("template").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html").notNull(),
    /** "outbox" locally; "brevo" when Brevo was asked to send it. */
    transport: text("transport").notNull(),
    status: text("status").$type<EmailStatus>().notNull().default("local_only"),
    /** Brevo's id for the message, to find it in Brevo's own logs. */
    providerMessageId: text("provider_message_id"),
    /** Why it did not go, written by code (emailFailureSummary). */
    error: text("error"),
    attempts: integer("attempts").notNull().default(1),
    /** How many attempts a queued message gets before it is `failed`. */
    maxAttempts: integer("max_attempts").notNull().default(3),
    /** When the drainer may try a `pending` message again; null for every other status. */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    /** True when the body kept here is a redacted copy: such a row can never be sent again. */
    bodyRedacted: boolean("body_redacted").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index("email_messages_created_at_idx").on(table.createdAt),
    index("email_messages_pending_idx").on(table.nextAttemptAt).where(sql`${table.status} = 'pending'`),
    check("email_messages_status_check", sql`${table.status} in ('pending', 'sent', 'local_only', 'failed', 'bounced')`),
    check("email_messages_max_attempts_check", sql`${table.maxAttempts} >= 1`),
    check("email_messages_pending_check", sql`${table.status} <> 'pending' or ${table.nextAttemptAt} is not null`),
    check("email_messages_error_check", sql`${table.error} is null or char_length(${table.error}) <= 300`),
    check("email_messages_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

/** Why an address is never mailed optional messages again. */
export const EMAIL_SUPPRESSION_REASONS = ["bounce", "complaint", "unsubscribe"] as const;
export type EmailSuppressionReason = (typeof EMAIL_SUPPRESSION_REASONS)[number];

/**
 * Addresses that must not get optional mail: the provider says they bounce or complained, or the person unsubscribed.
 * Mandatory mail (receipts, security, codes) still goes. The address is kept lower case. Written by the Brevo events webhook (package N3).
 */
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    address: text("address").primaryKey(),
    reason: text("reason").$type<EmailSuppressionReason>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check("email_suppressions_reason_check", sql`${table.reason} in ('bounce', 'complaint', 'unsubscribe')`),
    check("email_suppressions_address_check", sql`${table.address} = lower(${table.address}) and char_length(${table.address}) between 3 and 320`),
  ],
);
export type EmailSuppression = typeof emailSuppressions.$inferSelect;
