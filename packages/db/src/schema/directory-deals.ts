import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/*
 * A listing owner's deals and offers on the local directory (docs/superpowers/specs/2026-10-07-deals-offers-design.md): a
 * short offer ("20% off your first haircut") that shows on the website's home page for its area, on the business's own
 * page and as an "Offer" tag on its list-page card. A deal goes up the moment its owner saves it, with no check from
 * us; staff can take one down afterwards (status `taken_down`). It is on show from its first day to its last, so
 * nothing needs to run when it ends.
 *
 * The business is named by its owner's claim (directory_claims), like its pictures: the website shows a deal only once
 * that claim is approved, so nobody can put an offer on a listing they have not proved is theirs.
 *
 * The customer reads its own rows through row-level security and writes nothing directly: every write runs on the
 * staff connection after the platform has checked who is asking.
 */

export const DIRECTORY_DEAL_TITLE_MAX = 60;
export const DIRECTORY_DEAL_BADGE_MAX = 20;
export const DIRECTORY_DEAL_TERMS_MAX = 90;
/** The most live deals one business has at a time. */
export const DIRECTORY_DEALS_LIVE_MAX = 5;
/** The longest a deal runs, first day to last day inclusive. */
export const DIRECTORY_DEAL_MAX_DAYS = 90;

export const directoryDealStatus = pgEnum("directory_deal_status", ["live", "taken_down"]);
export type DirectoryDealStatus = (typeof directoryDealStatus.enumValues)[number];

export const directoryDeals = pgTable(
  "directory_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    title: text("title").notNull(),
    /** The short stamp on the poster, such as "20% off" or "Free dessert". */
    badge: text("badge").notNull(),
    /** The small print: "Weekdays before 5 pm". */
    terms: text("terms").notNull(),
    /** First and last day the deal is on show, in the business's own calendar. */
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    status: directoryDealStatus("status").notNull().default("live"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Set with `taken_down`, by staff: when, by whom and why (the owner sees the reason). */
    takenDownAt: timestamp("taken_down_at", { withTimezone: true }),
    takenDownByUserId: text("taken_down_by_user_id").references(() => users.id),
    takenDownReason: text("taken_down_reason"),
    /** Set when the owner ends or deletes it early; a removed deal is kept on record but is on show nowhere. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    // The owner's list, and the live count that holds the limit.
    index("directory_deals_business_idx")
      .on(table.businessId, table.endsOn)
      .where(sql`${table.removedAt} is null`),
    // The website's feed: what is on show on a given day.
    index("directory_deals_on_show_idx")
      .on(table.startsOn, table.endsOn)
      .where(sql`${table.status} = 'live' and ${table.removedAt} is null`),
    check(
      "directory_deals_text_check",
      sql`char_length(btrim(${table.title})) between 1 and ${sql.raw(String(DIRECTORY_DEAL_TITLE_MAX))} and char_length(btrim(${table.badge})) between 1 and ${sql.raw(String(DIRECTORY_DEAL_BADGE_MAX))} and char_length(btrim(${table.terms})) between 1 and ${sql.raw(String(DIRECTORY_DEAL_TERMS_MAX))}`,
    ),
    check(
      "directory_deals_dates_check",
      sql`${table.endsOn} >= ${table.startsOn} and ${table.endsOn} - ${table.startsOn} < ${sql.raw(String(DIRECTORY_DEAL_MAX_DAYS))}`,
    ),
    check(
      "directory_deals_taken_down_check",
      sql`(${table.status} = 'taken_down') = (${table.takenDownAt} is not null) and (${table.takenDownAt} is null) = (${table.takenDownByUserId} is null)`,
    ),
  ],
);
