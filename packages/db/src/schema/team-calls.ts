import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import {
  CALL_REASONS,
  CALL_SOURCES,
  CALL_STATUSES,
  MAX_CALL_NOTE_LENGTH,
  MAX_CALL_SUMMARY_LENGTH,
  MIN_CALL_SUMMARY_LENGTH,
  type CallReason,
  type CallSource,
  type CallStatus,
} from "../call-reasons";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

const list = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(", ");

/**
 * A call with the team after the kickoff (plan 32). The kickoff stays in `setup_call_bookings`, which carries the held
 * mark that ends the first look. A business has many of these, so a past call keeps its place and its summary.
 *
 * The customer role books a call (one insert, status booked) and cancels one that has not happened; it cannot write
 * anything else. Staff mark a call held and write what was agreed. Cal.com's webhook moves and cancels a call changed from
 * its email. One trigger (`team_calls_guard`) holds these rules for every writer. See migration 0191.
 */
export const teamCalls = pgTable(
  "team_calls",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    reason: text("reason").$type<CallReason>().notNull(),
    /** "Anything we should look at first?", in the customer's words. */
    note: text("note"),
    status: text("status").$type<CallStatus>().notNull().default("booked"),
    source: text("source").$type<CallSource>().notNull().default("dashboard"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** The booking service's address for this booking (Cal.com's API address); null when the service gave none. */
    providerUri: text("provider_uri"),
    heldAt: timestamp("held_at", { withTimezone: true }),
    heldByStaffId: text("held_by_staff_id").references(() => users.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** What was agreed, written by staff after the call. All three are set together. */
    summary: text("summary"),
    summaryAt: timestamp("summary_at", { withTimezone: true }),
    summaryByStaffId: text("summary_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("team_calls_business_idx").on(table.businessId, table.startsAt),
    uniqueIndex("team_calls_provider_idx").on(table.providerUri),
    check("team_calls_reason_check", sql`${table.reason} in (${sql.raw(list(CALL_REASONS))})`),
    check("team_calls_status_check", sql`${table.status} in (${sql.raw(list(CALL_STATUSES))})`),
    check("team_calls_source_check", sql`${table.source} in (${sql.raw(list(CALL_SOURCES))})`),
    check("team_calls_note_check", sql`${table.note} is null or char_length(btrim(${table.note})) between 1 and ${sql.raw(String(MAX_CALL_NOTE_LENGTH))}`),
    check("team_calls_time_check", sql`${table.endsAt} > ${table.startsAt}`),
    check("team_calls_provider_check", sql`${table.providerUri} is null or char_length(${table.providerUri}) <= 300`),
    check("team_calls_held_check", sql`(${table.status} = 'held') = (${table.heldAt} is not null) and (${table.heldAt} is null) = (${table.heldByStaffId} is null)`),
    check("team_calls_cancelled_check", sql`(${table.status} = 'cancelled') = (${table.cancelledAt} is not null)`),
    check(
      "team_calls_summary_check",
      sql`(${table.summary} is null) = (${table.summaryAt} is null) and (${table.summary} is null) = (${table.summaryByStaffId} is null) and (${table.summary} is null or (${table.status} = 'held' and char_length(btrim(${table.summary})) between ${sql.raw(String(MIN_CALL_SUMMARY_LENGTH))} and ${sql.raw(String(MAX_CALL_SUMMARY_LENGTH))}))`,
    ),
  ],
);
export type TeamCall = typeof teamCalls.$inferSelect;
