import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { billingCurrency } from "./currency";
import { directoryPaidTag } from "./directory-paid-tags";
import { referralCodes } from "./referrals";

/**
 * Who took the money. `manual` is a payment the team received outside any provider (a bank transfer) and recorded
 * by hand in the staff console; it never has a checkout.
 */
export const billingProvider = pgEnum("billing_provider", ["fake", "razorpay", "manual"]);
export type BillingProviderName = (typeof billingProvider.enumValues)[number];

/** Our own status, mapped from whatever the provider calls it. See packages/billing. */
export const subscriptionStatus = pgEnum("subscription_status", [
  "incomplete",
  "active",
  "past_due",
  "inactive",
  "cancelled",
]);
export type SubscriptionStatus = (typeof subscriptionStatus.enumValues)[number];

/** `charge` is a payment for one of the business's charges (a paid extra); it has no subscription. */
export const paymentKind = pgEnum("payment_kind", ["initial", "renewal", "reactivation", "extra_publish", "charge", "add_on"]);
export type PaymentKind = (typeof paymentKind.enumValues)[number];

export const paymentStatus = pgEnum("payment_status", ["captured", "failed", "refunded"]);
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];

/**
 * Why a payment needs a person to look at it. The first three mean the money arrived but bought nothing, so the
 * payment was recorded without activating anything:
 * - `checkout_replaced`: it paid a checkout we had already replaced or cancelled.
 * - `already_paid`: the business already had access, so it is a duplicate charge to refund.
 * - `amount_mismatch`: the provider took an amount or currency that is not the plan's first payment.
 * - `upgrade_not_applied`: it paid a move up to Premium whose quote no longer stood (the month had renewed, or the
 *   subscription was no longer live), so nothing changed and it is a payment to refund.
 * The last two are payments that did apply, where something after them went wrong:
 * - `submission_failed`: the payment activated the subscription, but sending the customer's answers failed.
 * - `upgrade_provider_pending`: the payment moved the customer up to Premium, but the provider has not yet been told
 *   to bill Premium from the next renewal. Staff finish it from the client page.
 */
export const paymentAttentionReason = pgEnum("payment_attention_reason", [
  "checkout_replaced",
  "already_paid",
  "amount_mismatch",
  "submission_failed",
  "upgrade_not_applied",
  "upgrade_provider_pending",
]);
export type PaymentAttentionReason = (typeof paymentAttentionReason.enumValues)[number];

/** Attention reasons whose payment bought nothing. Such a payment never counts as the business having paid. */
export const UNAPPLIED_PAYMENT_REASONS = [
  "checkout_replaced",
  "already_paid",
  "amount_mismatch",
  "upgrade_not_applied",
] as const satisfies readonly PaymentAttentionReason[];

/**
 * What a plan includes (docs/superpowers/specs/2026-10-07-care-plan-design.md). `care` is the website only: the
 * website, its management, the chatbot, the server and hosting. `premium` is everything in Care plus the Fynix
 * listing, videos, appointments, better ranking and the social and Google profile management.
 */
export const planTier = pgEnum("plan_tier", ["care", "premium"]);
export type PlanTier = (typeof planTier.enumValues)[number];

/** One row per currency and tier. The price the customer sees and is charged comes from here, never from copy. */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    currency: billingCurrency("currency").notNull(),
    /** Which of the two plans this price is for. Rows from before the Care plan existed are all Premium's. */
    tier: planTier("tier").notNull().default("premium"),
    /** Paid up front, covering the first `initialTermMonths` months of subscription. */
    initialAmountCents: integer("initial_amount_cents").notNull(),
    initialTermMonths: integer("initial_term_months").notNull(),
    /** Charged every month once the initial term ends. */
    recurringAmountCents: integer("recurring_amount_cents").notNull(),
    includedPublishesPerMonth: integer("included_publishes_per_month").notNull(),
    extraPublishAmountCents: integer("extra_publish_amount_cents").notNull(),
    /**
     * Changes (2026-09-17): the first hours of changes are free, once per customer, then charged by the hour. Defaults
     * are the USD prices; migration 0026 sets the INR plan's own amounts.
     */
    includedChangeHours: integer("included_change_hours").notNull().default(1),
    extraHourAmountCents: integer("extra_hour_amount_cents").notNull().default(1500),
    /** Blog posts: this many are included, then they are sold in blocks of `blogPostBlockSize`. */
    includedBlogPosts: integer("included_blog_posts").notNull().default(100),
    blogPostBlockSize: integer("blog_post_block_size").notNull().default(100),
    extraBlogPostsAmountCents: integer("extra_blog_posts_amount_cents").notNull().default(500),
    /** Null until the provider's own plan exists; the fake provider never needs one. */
    providerPlanId: text("provider_plan_id"),
    /**
     * Tax added on top of the amounts above, in basis points (1800 is 18%). The amounts are always the net price
     * the customer sees quoted, and what is actually charged is worked out in one place: chargedAmountCents in
     * packages/billing. India's plan carries GST; the dollar plan carries none of ours. The provider plan above
     * is created at the taxed amount, because that is what the provider takes.
     */
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(0),
    /** Only one active plan per currency and tier; a retired price stays for the subscriptions still pointing at it. */
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("plans_currency_tier_active_idx").on(table.currency, table.tier).where(sql`${table.active}`),
    check("plans_tax_rate_check", sql`${table.taxRateBasisPoints} between 0 and 10000`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    provider: billingProvider("provider").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    /** Exactly as the provider reported it, for support and for reconciliation. */
    providerStatus: text("provider_status"),
    /**
     * The code this subscription was opened with, or null. An affiliate code may discount nothing, so a code with a
     * zero discount is allowed; a discount without a code is not.
     */
    referralCodeId: uuid("referral_code_id").references(() => referralCodes.id),
    /**
     * What the referral code is worth against this subscription's plan, in the plan's minor units, frozen when the
     * checkout opened. Every amount check subtracts it from the plan's price, so editing or retiring the code
     * afterwards cannot change what this customer is charged or what we expect to receive.
     */
    discountAmountCents: integer("discount_amount_cents").notNull().default(0),
    /**
     * The part of `discountAmountCents` that is a stay offer taken on the way out of the account (the delete-account
     * page), rather than a referral code. It needs no code, so it is the one discount a subscription may carry without
     * one. Zero when no offer was taken. An offer is taken once.
     */
    retentionDiscountCents: integer("retention_discount_cents").notNull().default(0),
    /**
     * The plan the next renewal will bill, when the customer has paid to move up (plan_upgrades): Premium, for a Care
     * client. Until that renewal arrives and is recorded, `plan_id` stays the plan the provider is billing, which is
     * what every amount check reads; the customer's billing state is read as this plan, though, so they have what
     * they paid for from the moment they paid.
     */
    pendingPlanId: uuid("pending_plan_id").references(() => plans.id),
    /** What the discount that carries over takes off the pending plan's net price. Zero with no pending plan. */
    pendingDiscountAmountCents: integer("pending_discount_amount_cents").notNull().default(0),
    /**
     * What the add-ons taken at the first checkout cost every month before GST, after their lifetime offer, in the plan's
     * minor units (bundled_add_ons, summed): frozen when the checkout opened. The provider bills one amount a month, the
     * plan's price plus this, so every amount check adds it to the plan's price. Zero for a subscription with no add-ons.
     */
    bundledAddOnNetCents: integer("bundled_add_on_net_cents").notNull().default(0),
    /**
     * What the add-ons cost a month once the ones the customer has asked to remove have stopped: the provider has been told to
     * move the subscription to a plan at this amount from the next renewal, which is then accepted at it and makes it
     * `bundled_add_on_net_cents`. Null when no removal is waiting.
     */
    pendingBundledAddOnNetCents: integer("pending_bundled_add_on_net_cents"),
    status: subscriptionStatus("status").notNull().default("incomplete"),
    /** When the first payment was confirmed. Null until then. */
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    /** End of the paid-up-front term. */
    commitmentEndsAt: timestamp("commitment_ends_at", { withTimezone: true }),
    /**
     * The end of the period the customer has paid for. The single input to the access rule:
     * past it, with a status that is not active, the dashboard and the website are closed.
     */
    paidThroughAt: timestamp("paid_through_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("subscriptions_provider_id_idx").on(table.provider, table.providerSubscriptionId),
    // A business may have many cancelled subscriptions over time, but only ever one live one.
    uniqueIndex("subscriptions_one_live_per_business_idx")
      .on(table.businessId)
      .where(sql`${table.status} <> 'cancelled'`),
    index("subscriptions_business_id_idx").on(table.businessId),
    // A discount that is neither a referral code's nor a stay offer's, or an offer that is more than the whole
    // discount, is a bug rather than a state to handle.
    check(
      "subscriptions_bundled_check",
      sql`${table.bundledAddOnNetCents} >= 0 and (${table.pendingBundledAddOnNetCents} is null or (${table.pendingBundledAddOnNetCents} >= 0 and ${table.pendingBundledAddOnNetCents} < ${table.bundledAddOnNetCents}))`,
    ),
    check(
      "subscriptions_pending_check",
      sql`${table.pendingDiscountAmountCents} >= 0 and (${table.pendingDiscountAmountCents} = 0 or (${table.pendingPlanId} is not null and ${table.referralCodeId} is not null))`,
    ),
    check(
      "subscriptions_discount_check",
      sql`${table.discountAmountCents} >= 0 and ${table.retentionDiscountCents} >= 0 and ${table.retentionDiscountCents} <= ${table.discountAmountCents} and (${table.referralCodeId} is not null or ${table.discountAmountCents} = ${table.retentionDiscountCents})`,
    ),
  ],
);

/**
 * The provider's own plan for a base plan with a discount taken off: Razorpay subscriptions charge their plan's
 * amount and nothing else, so a member paying ₹500 less every month is a subscription on a ₹500-cheaper Razorpay
 * plan. Created automatically the first time a discount is used against a base plan, then reused. Our subscription
 * still points at the base plan with the discount frozen on it, and the amount we expect is worked out from those,
 * which comes to exactly what this plan charges (chargedAmountCents is applied to the same taxable figure).
 *
 * Staff connection only.
 */
export const providerDiscountPlans = pgTable(
  "provider_discount_plans",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    /** Off the base plan's net monthly price, in its minor units. */
    discountAmountCents: integer("discount_amount_cents").notNull(),
    provider: billingProvider("provider").notNull(),
    providerPlanId: text("provider_plan_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("provider_discount_plans_plan_discount_idx").on(table.planId, table.discountAmountCents, table.provider),
    check("provider_discount_plans_discount_check", sql`${table.discountAmountCents} > 0`),
    check("provider_discount_plans_provider_plan_check", sql`${table.providerPlanId} <> ''`),
  ],
);

/**
 * The provider plan a subscription with add-ons runs on: one amount every cycle, the plan's price plus its add-ons less
 * any referral discount (a subscription with no add-ons uses provider_discount_plans). Made once per amount and reused.
 * Staff connection only.
 */
export const providerBundlePlans = pgTable(
  "provider_bundle_plans",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    /** The net monthly price this provider plan charges before tax, in minor units. */
    netMonthlyCents: integer("net_monthly_cents").notNull(),
    provider: billingProvider("provider").notNull(),
    providerPlanId: text("provider_plan_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("provider_bundle_plans_plan_net_idx").on(table.planId, table.netMonthlyCents, table.provider),
    check("provider_bundle_plans_net_check", sql`${table.netMonthlyCents} > 0`),
    check("provider_bundle_plans_provider_plan_check", sql`${table.providerPlanId} <> ''`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    provider: billingProvider("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    kind: paymentKind("kind").notNull(),
    /** Integer minor units of `currency`: cents for USD, paise for INR. Never a float. */
    amountCents: integer("amount_cents").notNull(),
    currency: billingCurrency("currency").notNull(),
    status: paymentStatus("status").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    /** Set when staff need to look at this payment; see paymentAttentionReason. */
    attentionReason: paymentAttentionReason("attention_reason"),
    attentionRaisedAt: timestamp("attention_raised_at", { withTimezone: true }),
    /** When, and by which staff user, the attention was dealt with (refunded, or applied by hand). */
    attentionResolvedAt: timestamp("attention_resolved_at", { withTimezone: true }),
    attentionResolvedByStaffId: text("attention_resolved_by_staff_id").references(() => users.id),
    /** Manual payments only: the staff user who recorded it. */
    recordedByStaffId: text("recorded_by_staff_id").references(() => users.id),
    /** Manual payments only: the bank or payment reference the money arrived with. */
    manualReference: text("manual_reference"),
    /** Manual payments only: the calendar date the money arrived, as the staff member entered it. */
    receivedOn: date("received_on", { mode: "string" }),
    /**
     * How the customer paid, as the provider reported it: Razorpay's payment method ("card", "upi", "netbanking",
     * ...). Null for manual payments and for payments recorded before 0047. The card columns hold only what
     * Razorpay itself shows a merchant (network, last four digits, type, issuer), never a full card number.
     */
    method: text("method"),
    cardNetwork: text("card_network"),
    cardLast4: text("card_last4"),
    cardType: text("card_type"),
    cardIssuer: text("card_issuer"),
    upiVpa: text("upi_vpa"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("payments_provider_id_idx").on(table.provider, table.providerPaymentId),
    index("payments_business_id_idx").on(table.businessId, table.createdAt),
    index("payments_needing_attention_idx")
      .on(table.attentionRaisedAt)
      .where(sql`${table.attentionReason} is not null and ${table.attentionResolvedAt} is null`),
    check(
      "payments_attention_raised_check",
      sql`(${table.attentionReason} is null) = (${table.attentionRaisedAt} is null)`,
    ),
    check(
      "payments_attention_resolved_check",
      sql`(${table.attentionResolvedAt} is null) = (${table.attentionResolvedByStaffId} is null) and (${table.attentionResolvedAt} is null or ${table.attentionReason} is not null)`,
    ),
    check(
      "payments_manual_details_check",
      sql`case when ${table.provider} = 'manual' then ${table.manualReference} is not null and ${table.receivedOn} is not null else ${table.manualReference} is null and ${table.receivedOn} is null and ${table.recordedByStaffId} is null end`,
    ),
    check(
      "payments_manual_reference_check",
      sql`${table.manualReference} is null or (char_length(${table.manualReference}) between 1 and 100 and ${table.manualReference} = btrim(${table.manualReference}))`,
    ),
    // Added NOT VALID in 0020: manual payments recorded before it have no recorder to backfill.
    check(
      "payments_manual_recorded_by_check",
      sql`${table.provider} <> 'manual' or ${table.recordedByStaffId} is not null`,
    ),
    check("payments_card_last4_check", sql`${table.cardLast4} is null or ${table.cardLast4} ~ '^[0-9]{4}$'`),
  ],
);

/**
 * What a charge is for. `change_hours` is time past the free hour of changes, `blog_posts` a block of extra blog
 * posts, `extra_publish` a publish past the plan's monthly ones, and `custom` anything else staff agree with the
 * customer. The kind sets the price staff start from; only `custom` lets them set it freely. `listing_promotion` is a
 * week of a paid tag on the client's the local directory listing: the customer opens it from the Listing page, never
 * staff, and paying it starts the week (see directory_promotions). `directory_ad` is a won week of an ad spot: the
 * auction's settlement opens it, and paying it puts the ad up (see directory_ad_wins). `plan_upgrade` is the part of
 * the month a Care client pays to be Premium for the rest of it: the customer opens it from the Upgrade page, and
 * paying it moves them up (see plan_upgrades).
 */
export const chargeKind = pgEnum("charge_kind", [
  "change_hours",
  "blog_posts",
  "extra_publish",
  "custom",
  "listing_promotion",
  "directory_ad",
  "plan_upgrade",
  "press_release",
]);
export type ChargeKind = (typeof chargeKind.enumValues)[number];

/**
 * A charge is owed (`open`) until it is paid or staff waive it. Neither of those is ever undone. A `directory_ad`
 * charge is also cancelled (waived with no staff member) when its auction win lapses unpaid, and a `plan_upgrade`
 * charge when the quote it was made for is replaced.
 */
export const chargeStatus = pgEnum("charge_status", ["open", "paid", "waived"]);
export type ChargeStatus = (typeof chargeStatus.enumValues)[number];

/**
 * A one-off amount a business owes beside its monthly plan: a paid extra. Staff add most of them from the staff
 * console; the dashboard adds a `blog_posts` charge when a customer asks to unlock more posts. The customer pays it
 * online, or staff record a bank transfer, and either way exactly one `payments` row (kind `charge`) pays it.
 *
 * Amounts are frozen when the charge is made, so a later price change never alters what an open charge asks for:
 * `unit_amount_cents` is the net price of one unit, and `amount_cents` is what is charged, net times quantity with
 * `tax_rate_basis_points` of tax on top (chargedAmountCents in packages/billing).
 */
export const charges = pgTable(
  "charges",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    kind: chargeKind("kind").notNull(),
    /** What the customer reads on the Billing page and the receipt: "Extra change hours". */
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitAmountCents: integer("unit_amount_cents").notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: billingCurrency("currency").notNull(),
    status: chargeStatus("status").notNull().default("open"),
    /** The staff user who added it; null when the dashboard added it (a blog unlock). */
    createdByStaffId: text("created_by_staff_id").references(() => users.id),
    /**
     * The provider and its id for the latest online payment attempt (a Razorpay order), so the payment the provider
     * reports can be matched back to this charge. Replaced when the customer starts again.
     */
    provider: billingProvider("provider"),
    providerOrderId: text("provider_order_id"),
    paymentId: uuid("payment_id").references(() => payments.id),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    waivedByStaffId: text("waived_by_staff_id").references(() => users.id),
    /**
     * The listing tag a `listing_promotion` charge buys a week of; null for every other kind. The customer may switch
     * it while the charge is open, before they pay; paying it starts that tag's week.
     */
    promotionTag: directoryPaidTag("promotion_tag"),
    createdAt: createdAt(),
  },
  (table) => [
    index("charges_business_id_idx").on(table.businessId, table.createdAt),
    uniqueIndex("charges_payment_id_idx").on(table.paymentId),
    uniqueIndex("charges_provider_order_idx").on(table.provider, table.providerOrderId),
    // One unlock at a time: asking again reuses the open blog_posts charge rather than piling up duplicates.
    uniqueIndex("charges_one_open_blog_unlock_idx")
      .on(table.businessId)
      .where(sql`${table.kind} = 'blog_posts' and ${table.status} = 'open'`),
    // One upgrade payment at a time: asking again reuses or replaces the open plan_upgrade charge.
    uniqueIndex("charges_one_open_plan_upgrade_idx")
      .on(table.businessId)
      .where(sql`${table.kind} = 'plan_upgrade' and ${table.status} = 'open'`),
    // One promotion payment at a time: choosing again reuses the open listing_promotion charge.
    uniqueIndex("charges_one_open_listing_promotion_idx")
      .on(table.businessId)
      .where(sql`${table.kind} = 'listing_promotion' and ${table.status} = 'open'`),
    check(
      "charges_promotion_tag_check",
      sql`(${table.kind} = 'listing_promotion') = (${table.promotionTag} is not null)`,
    ),
    // The directory is in India: a promotion week is priced in rupees whatever the client's plan currency.
    check("charges_promotion_currency_check", sql`${table.kind} <> 'listing_promotion' or ${table.currency} = 'INR'`),
    check("charges_directory_ad_currency_check", sql`${table.kind} <> 'directory_ad' or ${table.currency} = 'INR'`),
    check(
      "charges_description_check",
      sql`char_length(${table.description}) between 1 and 200 and ${table.description} = btrim(${table.description})`,
    ),
    check(
      "charges_amounts_check",
      sql`${table.quantity} >= 1 and ${table.unitAmountCents} >= 1 and ${table.taxRateBasisPoints} >= 0 and ${table.amountCents} >= ${table.unitAmountCents} * ${table.quantity}`,
    ),
    check("charges_provider_order_check", sql`(${table.provider} is null) = (${table.providerOrderId} is null)`),
    check(
      "charges_status_check",
      sql`case ${table.status}
        when 'open' then ${table.paymentId} is null and ${table.paidAt} is null and ${table.waivedAt} is null
        when 'paid' then ${table.paymentId} is not null and ${table.paidAt} is not null and ${table.waivedAt} is null
        else ${table.paymentId} is null and ${table.paidAt} is null and ${table.waivedAt} is not null and (${table.waivedByStaffId} is not null or ${table.kind} in ('directory_ad', 'plan_upgrade'))
      end`,
    ),
  ],
);

/** Where a move up stands. See planUpgrades. */
export const planUpgradeStatus = pgEnum("plan_upgrade_status", ["open", "paid", "scheduled", "completed", "cancelled"]);
export type PlanUpgradeStatus = (typeof planUpgradeStatus.enumValues)[number];

/** Who asked for the move: the customer from their dashboard, or staff from the client page. */
export const planUpgradeSource = pgEnum("plan_upgrade_source", ["customer", "staff"]);
export type PlanUpgradeSource = (typeof planUpgradeSource.enumValues)[number];

/**
 * A client moving up from Care to Premium on the subscription it already has (docs/superpowers/specs/2026-10-08-care-
 * to-premium-upgrade-design.md). The customer pays, as a one-time charge, the difference between the two plans for the
 * days left in the month they have paid for; Premium's full price is taken from the next renewal.
 *
 * - `open`: the charge is unpaid. Nothing has changed.
 * - `paid`: the money is in and the subscription's `pending_plan_id` is set, so the client has Premium. The provider
 *   has not yet been told to bill Premium from the next renewal.
 * - `scheduled`: the provider will bill the new plan at the next renewal.
 * - `completed`: that renewal was taken at the new plan's price and `plan_id` now names it.
 * - `cancelled`: the quote was replaced, or its charge waived, before it was paid.
 *
 * The quote is frozen here: `period_end` is the end of the paid month it was worked out for, and the upgrade only
 * applies while the subscription is still paid through that date. Staff connection only for writes; the customer reads
 * their own.
 */
export const planUpgrades = pgTable(
  "plan_upgrades",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    fromPlanId: uuid("from_plan_id")
      .notNull()
      .references(() => plans.id),
    toPlanId: uuid("to_plan_id")
      .notNull()
      .references(() => plans.id),
    /** What the subscription's discount took off the old plan, and what carries over to the new one. */
    fromDiscountAmountCents: integer("from_discount_amount_cents").notNull().default(0),
    toDiscountAmountCents: integer("to_discount_amount_cents").notNull().default(0),
    /** The end of the paid month the quote was worked out for. */
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** The difference for the days left, before tax, and what is taken for it, tax included. Zero when nothing is. */
    netDifferenceCents: integer("net_difference_cents").notNull(),
    chargeCents: integer("charge_cents").notNull(),
    source: planUpgradeSource("source").notNull(),
    createdByStaffId: text("created_by_staff_id").references(() => users.id),
    /** The charge that pays for it; null when there is nothing to take (a tiny share, or staff moving a client). */
    chargeId: uuid("charge_id").references(() => charges.id),
    status: planUpgradeStatus("status").notNull().default("open"),
    /** The provider's plan the subscription was moved to for the next renewal, once it was. */
    providerPlanId: text("provider_plan_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("plan_upgrades_charge_id_idx").on(table.chargeId),
    index("plan_upgrades_business_id_idx").on(table.businessId, table.createdAt),
    index("plan_upgrades_subscription_id_idx").on(table.subscriptionId),
    // One move in flight per business: a second one waits for the first to complete or be cancelled.
    uniqueIndex("plan_upgrades_one_in_flight_idx")
      .on(table.businessId)
      .where(sql`${table.status} in ('open', 'paid', 'scheduled')`),
    check(
      "plan_upgrades_amounts_check",
      sql`${table.fromDiscountAmountCents} >= 0 and ${table.toDiscountAmountCents} >= 0 and ${table.netDifferenceCents} >= 0 and ${table.chargeCents} >= 0 and (${table.chargeId} is not null) = (${table.chargeCents} > 0)`,
    ),
    check("plan_upgrades_staff_check", sql`(${table.source} = 'staff') = (${table.createdByStaffId} is not null)`),
  ],
);

/** Which price a price change set. `monthly` makes a new plan version; the extras are edited in place. */
export const planPriceField = pgEnum("plan_price_field", ["monthly", "extra_hour", "extra_publish", "extra_blog_posts"]);
export type PlanPriceField = (typeof planPriceField.enumValues)[number];

/**
 * Every price a superadmin changed from the staff console: who, when, from what to what. A monthly change also names
 * the plan version it created and the Razorpay plan behind it, so any subscription's price can be traced back.
 * Written once and never edited.
 */
export const planPriceChanges = pgTable(
  "plan_price_changes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    currency: billingCurrency("currency").notNull(),
    field: planPriceField("field").notNull(),
    /** Net prices, before tax, in minor units. */
    oldAmountCents: integer("old_amount_cents").notNull(),
    newAmountCents: integer("new_amount_cents").notNull(),
    /** For a monthly change: the plan version it created. */
    newPlanId: uuid("new_plan_id").references(() => plans.id),
    changedByStaffId: text("changed_by_staff_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("plan_price_changes_created_idx").on(table.createdAt),
    check(
      "plan_price_changes_amounts_check",
      sql`${table.oldAmountCents} >= 0 and ${table.newAmountCents} >= 1 and ${table.oldAmountCents} <> ${table.newAmountCents}`,
    ),
    check(
      "plan_price_changes_plan_check",
      sql`(${table.field} = 'monthly') = (${table.newPlanId} is not null)`,
    ),
  ],
);
