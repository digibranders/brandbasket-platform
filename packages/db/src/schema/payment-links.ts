import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { subscriptions } from "./billing";
import { businesses } from "./businesses";
import { createdAt } from "./columns";
import { billingCurrency } from "./currency";
import { leads } from "./leads";
import { referralCodes } from "./referrals";

/**
 * A payment link staff send after agreeing a deal (docs/plans/65): who it is for, what they buy and what the build costs them.
 * Single use: bound to one business when its account is made (or from the start, for an account that never paid), and paid once.
 * Staff-only, like referral codes: bb_app is granted nothing, and the customer app reads it on the staff connection.
 * The token is never stored, only its SHA-256 hash.
 */
export const paymentLinks = pgTable(
  "payment_links",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tokenHash: text("token_hash").notNull().unique(),
    leadId: uuid("lead_id").references(() => leads.id),
    /** The business that pays: set at creation for an unpaid account, or when a new customer's account is made. */
    businessId: uuid("business_id").references(() => businesses.id),
    contactName: text("contact_name"),
    businessName: text("business_name"),
    email: text("email"),
    phoneCountry: text("phone_country"),
    phone: text("phone"),
    /** ISO 3166-1 alpha-2, upper case. India bills in rupees, anything else in dollars (owner decision D12). */
    countryCode: text("country_code").notNull(),
    stateCode: text("state_code"),
    gstin: text("gstin"),
    legalName: text("legal_name"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    postalCode: text("postal_code"),
    city: text("city"),
    currency: billingCurrency("currency").notNull(),
    /** Catalogue ids, at least one. */
    services: text("services").array().notNull(),
    billingInterval: text("billing_interval").notNull(),
    /** Set with the fee columns when the basket holds Website Management; null otherwise. */
    websiteKind: text("website_kind"),
    /** The list build fee when the link was made, frozen. */
    setupFeeListCents: integer("setup_fee_list_cents"),
    setupFeeDiscountCents: integer("setup_fee_discount_cents"),
    /** Why the discount, as the customer and the invoice read it: printable ASCII. */
    setupFeeNote: text("setup_fee_note"),
    /** The coupon applied for the customer, or null. */
    referralCodeId: uuid("referral_code_id").references(() => referralCodes.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByStaffId: text("revoked_by_staff_id").references(() => users.id),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    createdByStaffId: text("created_by_staff_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("payment_links_business_idx").on(table.businessId),
    index("payment_links_lead_idx").on(table.leadId),
    index("payment_links_created_idx").on(table.createdAt),
    check("payment_links_interval_check", sql`${table.billingInterval} in ('month', 'year')`),
    check("payment_links_services_check", sql`cardinality(${table.services}) between 1 and 4`),
    check("payment_links_country_check", sql`${table.countryCode} ~ '^[A-Z]{2}$' and (${table.currency} = 'INR') = (${table.countryCode} = 'IN')`),
    // A fee is set, whole, with its kind, exactly when the basket holds the website; the discount is from nothing to the whole fee.
    check(
      "payment_links_fee_check",
      sql`(${table.websiteKind} is null and ${table.setupFeeListCents} is null and ${table.setupFeeDiscountCents} is null and ${table.setupFeeNote} is null)
        or (${table.websiteKind} is not null and ${table.websiteKind} in ('b2b', 'ecommerce') and 'managed-website' = any(${table.services})
          and ${table.setupFeeListCents} > 0 and ${table.setupFeeDiscountCents} between 0 and ${table.setupFeeListCents}
          and (${table.setupFeeNote} is null or char_length(${table.setupFeeNote}) between 1 and 200))`,
    ),
    check("payment_links_paid_check", sql`(${table.paidAt} is null) = (${table.subscriptionId} is null) and (${table.paidAt} is null or ${table.businessId} is not null)`),
  ],
);

export type PaymentLink = typeof paymentLinks.$inferSelect;
export type NewPaymentLink = typeof paymentLinks.$inferInsert;
