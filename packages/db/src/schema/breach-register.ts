import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { createdAt, updatedAt } from "./columns";

/** Where a breach stands: found and being dealt with, stopped, or finished and reported. */
export const BREACH_STATUSES = ["open", "contained", "closed"] as const;
export type BreachStatus = (typeof BREACH_STATUSES)[number];

/**
 * Every personal data breach Brandbasket has had, kept so the time limits can be met and shown (DPDP Rules 2025 r.7: tell the
 * Data Protection Board without delay and send the detailed report within 72 hours; tell each affected person; CERT-In
 * Directions 2022: report within 6 hours of noticing). Staff only. A row can be added and updated but never deleted, and a
 * report date cannot be taken back once set (see queries/breach-register.ts).
 *
 * `summary` says what happened in a few sentences and names no affected person: who they are is kept with the incident file,
 * not here. `data_categories` is the kinds of data involved ("contact details", "health information").
 */
export const breachRegister = pgTable(
  "breach_register",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    reportedCertInAt: timestamp("reported_cert_in_at", { withTimezone: true }),
    reportedBoardAt: timestamp("reported_board_at", { withTimezone: true }),
    peopleNotifiedAt: timestamp("people_notified_at", { withTimezone: true }),
    summary: text("summary").notNull(),
    dataCategories: text("data_categories").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").notNull().default("open"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("breach_register_detected_at_idx").on(table.detectedAt),
    check("breach_register_summary_check", sql`char_length(${table.summary}) between 1 and 2000`),
    check("breach_register_status_check", sql`${table.status} in ('open', 'contained', 'closed')`),
    check(
      "breach_register_dates_check",
      sql`(${table.reportedCertInAt} is null or ${table.reportedCertInAt} >= ${table.detectedAt}) and (${table.reportedBoardAt} is null or ${table.reportedBoardAt} >= ${table.detectedAt}) and (${table.peopleNotifiedAt} is null or ${table.peopleNotifiedAt} >= ${table.detectedAt})`,
    ),
  ],
);
