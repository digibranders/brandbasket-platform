import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { charges, subscriptions } from "./billing";
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
    /** `free` (no build fee: the plans only) or `paid` (a build fee, part of it taken first as the advance, plan 66). */
    dealType: text("deal_type").notNull(),
    /** Paid deals only: the part of the net build fee taken first, 1 to the whole net price. Never changes after the link is made. */
    advanceCents: integer("advance_cents"),
    /** The one charge that collects the advance; set when the customer starts payment 1 and reused on a retry. */
    advanceChargeId: uuid("advance_charge_id").references(() => charges.id),
    advancePaidAt: timestamp("advance_paid_at", { withTimezone: true }),
    /** Staff pressed "Website ready": the balance is due. */
    readyAt: timestamp("ready_at", { withTimezone: true }),
    readyByStaffId: text("ready_by_staff_id").references(() => users.id),
    /** Custom recurring price per service for the link's billing period, GST included; null means the list price. */
    websitePriceCents: integer("website_price_cents"),
    socialPriceCents: integer("social_price_cents"),
    adsPriceCents: integer("ads_price_cents"),
    monitoringPriceCents: integer("monitoring_price_cents"),
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
    check("payment_links_deal_type_check", sql`${table.dealType} in ('free', 'paid')`),
    // The website kind is set exactly when the basket holds the website, for both deal types.
    check(
      "payment_links_website_kind_check",
      sql`(${table.websiteKind} is not null and ${table.websiteKind} in ('b2b', 'ecommerce') and 'managed-website' = any(${table.services}))
        or (${table.websiteKind} is null and not ('managed-website' = any(${table.services})))`,
    ),
    // A free deal has no fee and no advance. A paid deal holds the website, has a whole fee, a discount from nothing to the whole fee,
    // and an advance from 1 to the net price. Every nullable comparison says "is not null": a check passes silently on NULL.
    check(
      "payment_links_fee_check",
      sql`(${table.dealType} = 'free' and ${table.setupFeeListCents} is null and ${table.setupFeeDiscountCents} is null and ${table.setupFeeNote} is null and ${table.advanceCents} is null)
        or (${table.dealType} = 'paid' and 'managed-website' = any(${table.services})
          and ${table.setupFeeListCents} is not null and ${table.setupFeeListCents} > 0
          and ${table.setupFeeDiscountCents} is not null and ${table.setupFeeDiscountCents} between 0 and ${table.setupFeeListCents}
          and ${table.advanceCents} is not null and ${table.advanceCents} between 1 and (${table.setupFeeListCents} - ${table.setupFeeDiscountCents})
          and (${table.setupFeeNote} is null or char_length(${table.setupFeeNote}) between 1 and 200))`,
    ),
    // A custom price is above zero and only for a service in the basket.
    check(
      "payment_links_custom_price_check",
      sql`(${table.websitePriceCents} is null or (${table.websitePriceCents} > 0 and 'managed-website' = any(${table.services})))
        and (${table.socialPriceCents} is null or (${table.socialPriceCents} > 0 and 'social-media' = any(${table.services})))
        and (${table.adsPriceCents} is null or (${table.adsPriceCents} > 0 and 'paid-ads' = any(${table.services})))
        and (${table.monitoringPriceCents} is null or (${table.monitoringPriceCents} > 0 and 'expert-monitoring' = any(${table.services})))`,
    ),
    // A coupon or custom prices, never both.
    check(
      "payment_links_coupon_or_price_check",
      sql`${table.referralCodeId} is null
        or (${table.websitePriceCents} is null and ${table.socialPriceCents} is null and ${table.adsPriceCents} is null and ${table.monitoringPriceCents} is null)`,
    ),
    // The advance needs its charge and a business; ready needs the advance, and is set with who pressed it.
    check(
      "payment_links_advance_check",
      sql`(${table.advancePaidAt} is null or (${table.advanceChargeId} is not null and ${table.businessId} is not null))
        and (${table.readyAt} is null or ${table.advancePaidAt} is not null)
        and ((${table.readyAt} is null) = (${table.readyByStaffId} is null))`,
    ),
    check("payment_links_paid_check", sql`(${table.paidAt} is null) = (${table.subscriptionId} is null) and (${table.paidAt} is null or ${table.businessId} is not null)`),
  ],
);

export type PaymentLink = typeof paymentLinks.$inferSelect;
export type NewPaymentLink = typeof paymentLinks.$inferInsert;
