import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { createdAt } from "./columns";

/**
 * Every email the platform produces. In local development nothing is actually sent: the outbox transport records
 * the message here and staff read it in the Dev Outbox page.
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
    /** "outbox" locally; a provider name once real sending exists. */
    transport: text("transport").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("email_messages_created_at_idx").on(table.createdAt)],
);
