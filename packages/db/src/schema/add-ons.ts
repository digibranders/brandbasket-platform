import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { billingProvider, charges, payments, subscriptions } from "./billing";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { billingCurrency } from "./currency";

/**
 * Add-ons a business buys from the dashboard (docs/superpowers/specs/2026-10-09-add-ons-design.md). Each monthly
 * purchase is its own Razorpay subscription, kept apart from the main plan's `subscriptions` (one live row per business,
 * which drives website access). Rows are kept on erasure: they are the record of what was sold.
 */

export const addOnSubscriptionStatus = pgEnum("add_on_subscription_status", [
  "incomplete",
  "scheduled",
  "active",
  "past_due",
  "halted",
  "cancelled",
]);

export const addOnSubscriptions = pgTable(
  "add_on_subscriptions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    /** A monthly id from the catalogue (packages/shared/src/lib/billing/add-ons.ts). The two earlier ids stay allowed for old rows. */
    addOn: text("add_on").notNull(),
    /** The price fixed at purchase, in paise: list, Premium discount, list less discount, GST rate, what Razorpay takes. */
    listAmountCents: integer("list_amount_cents").notNull(),
    discountAmountCents: integer("discount_amount_cents").notNull().default(0),
    /** The part of `discountAmountCents` that is the first-checkout lifetime offer (5%); the rest is the Premium discount. */
    offerDiscountAmountCents: integer("offer_discount_amount_cents").notNull().default(0),
    netAmountCents: integer("net_amount_cents").notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull(),
    chargedAmountCents: integer("charged_amount_cents").notNull(),
    currency: billingCurrency("currency").notNull(),
    provider: billingProvider("provider").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    providerPlanId: text("provider_plan_id"),
    providerStatus: text("provider_status"),
    status: addOnSubscriptionStatus("status").notNull().default("incomplete"),
    /** Keep it: the day the new subscription starts and is first charged. Null for one that starts at once. */
    startAt: timestamp("start_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    /** The end of the paid period: the next billing date. */
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    haltedAt: timestamp("halted_at", { withTimezone: true }),
    /** A scheduled end: cancel or pause at currentPeriodEnd. Set together with endRequestedAt. */
    endKind: text("end_kind"),
    endRequestedAt: timestamp("end_requested_at", { withTimezone: true }),
    endRequestedByStaffId: text("end_requested_by_staff_id").references(() => users.id),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** The row this one continues (Resume, Pay now, Keep it), at the same price. */
    continuesId: uuid("continues_id"),
    contactedAt: timestamp("contacted_at", { withTimezone: true }),
    contactedByStaffId: text("contacted_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({ columns: [table.continuesId], foreignColumns: [table.id], name: "add_on_subscriptions_continues_id_fk" }),
    uniqueIndex("add_on_subscriptions_provider_idx").on(table.provider, table.providerSubscriptionId),
    // At most one row per add-on that will bill next: a kept successor is allowed beside a row that is ending.
    uniqueIndex("add_on_subscriptions_one_billing_idx")
      .on(table.businessId, table.addOn)
      .where(sql`${table.status} in ('scheduled', 'active', 'past_due', 'halted') and ${table.endKind} is null`),
    uniqueIndex("add_on_subscriptions_one_checkout_idx")
      .on(table.businessId, table.addOn)
      .where(sql`${table.status} = 'incomplete'`),
    index("add_on_subscriptions_business_idx").on(table.businessId, table.createdAt),
    check("add_on_subscriptions_add_on_check", sql`${table.addOn} in ('social-media', 'lead-generation', 'advertising', 'local-seo', 'performance-marketing')`),
    check(
      "add_on_subscriptions_offer_check",
      sql`${table.offerDiscountAmountCents} >= 0 and ${table.offerDiscountAmountCents} <= ${table.discountAmountCents}`,
    ),
    check(
      "add_on_subscriptions_amounts_check",
      sql`${table.listAmountCents} > 0 and ${table.discountAmountCents} >= 0
        and ${table.netAmountCents} = ${table.listAmountCents} - ${table.discountAmountCents} and ${table.netAmountCents} > 0
        and ${table.taxRateBasisPoints} between 0 and 10000 and ${table.chargedAmountCents} >= ${table.netAmountCents}`,
    ),
    check(
      "add_on_subscriptions_end_check",
      sql`(${table.endKind} is null) = (${table.endRequestedAt} is null) and (${table.endKind} is null or ${table.endKind} in ('cancel', 'pause'))`,
    ),
  ],
);

/** The Razorpay plan made for one add-on at one amount, made once and reused. */
export const addOnProviderPlans = pgTable(
  "add_on_provider_plans",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    addOn: text("add_on").notNull(),
    netAmountCents: integer("net_amount_cents").notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull(),
    currency: billingCurrency("currency").notNull(),
    provider: billingProvider("provider").notNull(),
    providerPlanId: text("provider_plan_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("add_on_provider_plans_key_idx").on(table.addOn, table.netAmountCents, table.taxRateBasisPoints, table.currency, table.provider),
  ],
);

/** Which add-on subscription a payment of kind add_on paid. One row per such payment. */
export const addOnPayments = pgTable(
  "add_on_payments",
  {
    paymentId: uuid("payment_id").primaryKey().references(() => payments.id),
    addOnSubscriptionId: uuid("add_on_subscription_id").notNull().references(() => addOnSubscriptions.id),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
  },
  (table) => [index("add_on_payments_subscription_idx").on(table.addOnSubscriptionId)],
);

export const bundledAddOnStatus = pgEnum("bundled_add_on_status", ["pending", "active", "removed"]);

/**
 * An add-on taken at the first checkout, billed inside the plan's own subscription: the one monthly charge is the plan
 * plus these. `pending` until the first payment is recorded, `active` after it, `removed` once it has stopped being
 * billed. The price is frozen here at the checkout (list, the 5% lifetime offer, net) and summed onto
 * `subscriptions.bundled_add_on_net_cents`. Rows are kept on erasure, like every record of what was sold.
 */
export const bundledAddOns = pgTable(
  "bundled_add_ons",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id),
    addOn: text("add_on").notNull(),
    listAmountCents: integer("list_amount_cents").notNull(),
    /** The first-checkout lifetime offer (5%) taken off the list price. */
    offerDiscountAmountCents: integer("offer_discount_amount_cents").notNull().default(0),
    netAmountCents: integer("net_amount_cents").notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull(),
    status: bundledAddOnStatus("status").notNull().default("pending"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    /** The customer asked to remove it: it stays billed, and active, until the next billing date, then it is `removed`. */
    endRequestedAt: timestamp("end_requested_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    /** When staff got in touch about this purchase, as for add_on_subscriptions; null until then. */
    contactedAt: timestamp("contacted_at", { withTimezone: true }),
    contactedByStaffId: text("contacted_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("bundled_add_ons_subscription_add_on_idx").on(table.subscriptionId, table.addOn),
    index("bundled_add_ons_business_idx").on(table.businessId, table.createdAt),
    check("bundled_add_ons_add_on_check", sql`${table.addOn} in ('social-media', 'lead-generation', 'advertising')`),
    check(
      "bundled_add_ons_amounts_check",
      sql`${table.listAmountCents} > 0 and ${table.offerDiscountAmountCents} >= 0
        and ${table.netAmountCents} = ${table.listAmountCents} - ${table.offerDiscountAmountCents} and ${table.netAmountCents} > 0
        and ${table.taxRateBasisPoints} between 0 and 10000`,
    ),
  ],
);

export const pressReleaseStatus = pgEnum("press_release_status", ["waiting", "in_progress", "published"]);

/** A paid press release and how far the team has got with it. Created when its charge is paid. */
export const pressReleases = pgTable(
  "press_releases",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    chargeId: uuid("charge_id").notNull().references(() => charges.id),
    status: pressReleaseStatus("status").notNull().default("waiting"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    statusChangedByStaffId: text("status_changed_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("press_releases_charge_idx").on(table.chargeId),
    index("press_releases_business_idx").on(table.businessId, table.createdAt),
  ],
);

export type AddOnSubscriptionStatus = (typeof addOnSubscriptionStatus.enumValues)[number];
export type AddOnSubscription = typeof addOnSubscriptions.$inferSelect;
export type BundledAddOn = typeof bundledAddOns.$inferSelect;
export type BundledAddOnStatus = (typeof bundledAddOnStatus.enumValues)[number];
export type PressRelease = typeof pressReleases.$inferSelect;
