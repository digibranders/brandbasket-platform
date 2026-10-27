import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { createdAt } from "./columns";

/** `sent`: Brevo took it. `local_only`: recorded but never sent (local development). `failed`: Brevo did not take it. */
export const EMAIL_STATUSES = ["sent", "local_only", "failed"] as const;
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
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    /** True when the body kept here is a redacted copy: such a row can never be sent again. */
    bodyRedacted: boolean("body_redacted").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index("email_messages_created_at_idx").on(table.createdAt),
    check("email_messages_status_check", sql`${table.status} in ('sent', 'local_only', 'failed')`),
    check("email_messages_error_check", sql`${table.error} is null or char_length(${table.error}) <= 300`),
    check("email_messages_attempts_check", sql`${table.attempts} >= 1`),
  ],
);
