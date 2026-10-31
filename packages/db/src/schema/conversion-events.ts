import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { payments } from "./billing";

export const CONVERSION_DESTINATIONS = ["ga4", "meta"] as const;
export type ConversionDestination = (typeof CONVERSION_DESTINATIONS)[number];
export const CONVERSION_STATUSES = ["pending", "sent", "skipped", "failed"] as const;
export type ConversionStatus = (typeof CONVERSION_STATUSES)[number];

/**
 * What was done about telling an ad platform of a customer's first payment (plan 59): one row per payment and destination.
 * The row is taken before anything is sent, so the browser confirmation and the Razorpay webhook reporting the same payment
 * send once; a failed one can be taken again. `reason` says why a send was skipped or failed, never anything personal.
 * Staff only.
 */
export const conversionEvents = pgTable(
  "conversion_events",
  {
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    destination: text("destination").$type<ConversionDestination>().notNull(),
    status: text("status").$type<ConversionStatus>().notNull().default("pending"),
    reason: text("reason"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.paymentId, table.destination] }),
    check("conversion_events_destination_check", sql`${table.destination} in ('ga4', 'meta')`),
    check("conversion_events_status_check", sql`${table.status} in ('pending', 'sent', 'skipped', 'failed')`),
    check("conversion_events_reason_check", sql`${table.reason} is null or char_length(${table.reason}) <= 200`),
  ],
);
export type ConversionEvent = typeof conversionEvents.$inferSelect;
