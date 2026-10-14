import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/**
 * A stretch of days the business keeps different hours from its usual week (a holiday, a break) that the client's
 * static site reads to hide appointment availability. Dates travel as plain `YYYY-MM-DD` strings, read in
 * `businesses.time_zone`. Without `opens_at`/`closes_at` the business is shut all day; with them (a half day) it
 * keeps just those hours on every day of the stretch, and a closing earlier than opening runs past midnight.
 */
export const businessClosures = pgTable(
  "business_closures",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    note: text("note"),
    opensAt: time("opens_at"),
    closesAt: time("closes_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("business_closures_business_id_ends_on_idx").on(table.businessId, table.endsOn),
    check("business_closures_dates_check", sql`${table.endsOn} >= ${table.startsOn}`),
    check(
      "business_closures_hours_check",
      sql`(${table.opensAt} is null) = (${table.closesAt} is null) and (${table.opensAt} is null or ${table.opensAt} <> ${table.closesAt})`,
    ),
    check(
      "business_closures_note_check",
      sql`${table.note} is null or char_length(${table.note}) between 1 and 80`,
    ),
  ],
);

/**
 * One optional one-line banner the client's static site reads, e.g. "Closed for Diwali, back Nov 3". At most one
 * per business; `starts_on`/`ends_on` are when it is shown, read in `businesses.time_zone`.
 */
export const businessAnnouncements = pgTable(
  "business_announcements",
  {
    businessId: uuid("business_id")
      .primaryKey()
      .references(() => businesses.id),
    message: text("message").notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "business_announcements_message_check",
      sql`char_length(${table.message}) between 1 and 100`,
    ),
    // A single-line banner: no embedded newline, whatever line ending the client typed. Written as a regex
    // literal rather than position(E'\n' in ...) so the migration file holds the two-character escapes `\r`/`\n`
    // rather than raw control bytes (Postgres's regex engine still reads them as carriage-return/newline).
    check(
      "business_announcements_message_single_line_check",
      sql`${table.message} !~ '[\\r\\n]'`,
    ),
    check("business_announcements_dates_check", sql`${table.endsOn} >= ${table.startsOn}`),
  ],
);
