import { sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { payments } from "./billing";
import { businesses } from "./businesses";
import { createdAt } from "./columns";
import { billingCurrency } from "./currency";
import { affiliates, referralCodes } from "./referrals";

/**
 * Where an affiliate's earning stands. `owed` until staff record the bank transfer that pays it (`paid`), or cancel
 * it (`cancelled`), for instance when the member's payment was refunded. Neither is ever undone.
 */
export const affiliateEarningStatus = pgEnum("affiliate_earning_status", ["owed", "paid", "cancelled"]);
export type AffiliateEarningStatus = (typeof affiliateEarningStatus.enumValues)[number];

/**
 * A bank or UPI transfer staff made to an affiliate, settling some of their owed earnings in one currency. Written
 * once and never edited; the earnings it settled point back at it.
 */
export const affiliatePayouts = pgTable(
  "affiliate_payouts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    /** The sum of the earnings it settled, exactly: what was cashed out, before anything was kept back. */
    amountCents: integer("amount_cents").notNull(),
    currency: billingCurrency("currency").notNull(),
    /**
     * What staff kept back from the transfer (tax deducted at source, a bank fee), in `currency`'s minor units. The
     * affiliate received `amount_cents` less this. Zero when the whole amount was sent.
     */
    withheldCents: integer("withheld_cents").notNull().default(0),
    /** Why, in staff's words. Present exactly when something was withheld. */
    withheldReason: text("withheld_reason"),
    /** The calendar date the transfer went out, as staff entered it. */
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    /** The bank or UPI reference of the transfer. */
    reference: text("reference").notNull(),
    recordedByStaffId: text("recorded_by_staff_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("affiliate_payouts_affiliate_idx").on(table.affiliateId, table.createdAt),
    check("affiliate_payouts_amount_check", sql`${table.amountCents} > 0`),
    // Something is always sent: withholding is less than the whole, and it comes with its reason (or neither does).
    check(
      "affiliate_payouts_withheld_check",
      sql`${table.withheldCents} >= 0 and ${table.withheldCents} < ${table.amountCents} and (${table.withheldCents} = 0) = (${table.withheldReason} is null) and (${table.withheldReason} is null or char_length(btrim(${table.withheldReason})) between 1 and 200)`,
    ),
    check(
      "affiliate_payouts_reference_check",
      sql`char_length(${table.reference}) between 1 and 100 and ${table.reference} = btrim(${table.reference})`,
    ),
  ],
);

/**
 * What an affiliate earned from one payment a member made on one of their codes. Written in the same transaction
 * that records the payment, so a payment and its earning exist together or not at all, and unique on the payment, so
 * a provider delivering the same payment twice can never earn twice. A zero reward writes no row.
 *
 * The amount is frozen when it is written: changing the affiliate's reward later changes only what later payments
 * earn. `basis_cents` is what the member paid before GST and after their discount, the figure a percentage is of.
 */
export const affiliateEarnings = pgTable(
  "affiliate_earnings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliates.id),
    referralCodeId: uuid("referral_code_id")
      .notNull()
      .references(() => referralCodes.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    amountCents: integer("amount_cents").notNull(),
    currency: billingCurrency("currency").notNull(),
    basisCents: integer("basis_cents").notNull(),
    /** Which of the member's paid months this was: 1 for the first payment, 2 for the first renewal, and so on. */
    cycleNumber: integer("cycle_number").notNull(),
    status: affiliateEarningStatus("status").notNull().default("owed"),
    payoutId: uuid("payout_id").references(() => affiliatePayouts.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByStaffId: text("cancelled_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("affiliate_earnings_payment_idx").on(table.paymentId),
    index("affiliate_earnings_affiliate_idx").on(table.affiliateId, table.status),
    check(
      "affiliate_earnings_amounts_check",
      sql`${table.amountCents} > 0 and ${table.basisCents} >= 0 and ${table.cycleNumber} >= 1`,
    ),
    check(
      "affiliate_earnings_status_check",
      sql`case ${table.status}
        when 'owed' then ${table.payoutId} is null and ${table.cancelledAt} is null and ${table.cancelledByStaffId} is null
        when 'paid' then ${table.payoutId} is not null and ${table.cancelledAt} is null and ${table.cancelledByStaffId} is null
        else ${table.payoutId} is null and ${table.cancelledAt} is not null and ${table.cancelledByStaffId} is not null
      end`,
    ),
  ],
);
