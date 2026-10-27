import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { CHANGE_COVERAGES, CHANGE_KINDS, CHANGE_STATES, type ChangeCoverage, type ChangeKind, type ChangeState } from "../change-states";
import { users } from "./auth";
import { charges } from "./billing";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { billingCurrency } from "./currency";
import { supportTickets } from "./support";

const list = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(", ");

/**
 * The change details of a support ticket (a ticket is the conversation; this is what makes it a request for a change).
 * One row per ticket at most. The ticket belongs to the person who asked; the request belongs to their business, so the
 * month's included edits can be counted across the business.
 *
 * The customer role can read these rows and write none of them. Everything the customer may do goes through the
 * functions `create_change_request` and `change_request_customer_move`; staff update rows directly, and one trigger
 * (`change_requests_guard`) holds the rules for every writer. See migration 0190.
 */
export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    kind: text("kind").$type<ChangeKind>().notNull(),
    /** Which page of the website, in the customer's words. */
    page: text("page"),
    state: text("state").$type<ChangeState>().notNull().default("requested"),
    coverage: text("coverage").$type<ChangeCoverage>().notNull().default("undecided"),
    /** The quote, all or nothing: what it is for, whole hours, the hour's price (GST included) and the total. */
    quoteWhat: text("quote_what"),
    quoteHours: integer("quote_hours"),
    quoteUnitCents: integer("quote_unit_cents"),
    quoteAmountCents: integer("quote_amount_cents"),
    quoteCurrency: billingCurrency("quote_currency"),
    /** The working days from the customer's yes (the payment) to "ready to check". */
    quoteWorkingDays: integer("quote_working_days"),
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
    /** Set with `chargeId` when the customer presses Accept and pay: the quote became a charge. */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    chargeId: uuid("charge_id").references(() => charges.id),
    /** Why staff declined, in words the customer reads. */
    closedReason: text("closed_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("change_requests_ticket_idx").on(table.ticketId),
    index("change_requests_business_idx").on(table.businessId, table.createdAt),
    index("change_requests_state_idx").on(table.state, table.updatedAt),
    check("change_requests_kind_check", sql`${table.kind} in (${sql.raw(list(CHANGE_KINDS))})`),
    check("change_requests_page_check", sql`${table.page} is null or char_length(btrim(${table.page})) between 1 and 200`),
    check("change_requests_state_check", sql`${table.state} in (${sql.raw(list(CHANGE_STATES))})`),
    check("change_requests_coverage_check", sql`${table.coverage} in (${sql.raw(list(CHANGE_COVERAGES))})`),
    check(
      "change_requests_quote_whole_check",
      sql`num_nonnulls(${table.quoteWhat}, ${table.quoteHours}, ${table.quoteUnitCents}, ${table.quoteAmountCents}, ${table.quoteCurrency}, ${table.quoteWorkingDays}, ${table.quotedAt}) in (0, 7)`,
    ),
    check(
      "change_requests_quote_values_check",
      sql`${table.quoteHours} is null or (${table.quoteHours} between 1 and 40 and ${table.quoteUnitCents} >= 1 and ${table.quoteAmountCents} = ${table.quoteHours} * ${table.quoteUnitCents} and ${table.quoteWorkingDays} between 1 and 30 and char_length(btrim(${table.quoteWhat})) between 3 and 80)`,
    ),
    check("change_requests_coverage_quote_check", sql`(${table.coverage} = 'paid') = (${table.quoteHours} is not null)`),
    check("change_requests_decided_check", sql`${table.coverage} <> 'undecided' or ${table.state} in ('requested', 'declined', 'withdrawn')`),
    check("change_requests_quoted_check", sql`${table.state} <> 'quoted' or ${table.coverage} = 'paid'`),
    check("change_requests_charge_check", sql`(${table.chargeId} is null) = (${table.acceptedAt} is null)`),
    check(
      "change_requests_reason_check",
      sql`${table.closedReason} is null or (${table.state} = 'declined' and char_length(btrim(${table.closedReason})) between 3 and 300)`,
    ),
  ],
);
export type ChangeRequest = typeof changeRequests.$inferSelect;

/**
 * Every state a request entered, with when and who. The stepper's dates come from here. Written only by the database's
 * `change_requests_record` trigger, so no path can move a request without leaving a line.
 */
export const changeRequestEvents = pgTable(
  "change_request_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    changeRequestId: uuid("change_request_id")
      .notNull()
      .references(() => changeRequests.id, { onDelete: "cascade" }),
    state: text("state").$type<ChangeState>().notNull(),
    /** The customer or staff member who moved it; null when a payment did. */
    actorUserId: text("actor_user_id").references(() => users.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("change_request_events_request_idx").on(table.changeRequestId, table.at),
    check("change_request_events_state_check", sql`${table.state} in (${sql.raw(list(CHANGE_STATES))})`),
  ],
);
export type ChangeRequestEvent = typeof changeRequestEvents.$inferSelect;
