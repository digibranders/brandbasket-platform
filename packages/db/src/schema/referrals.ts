import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { createdAt, updatedAt } from "./columns";
import { billingCurrency } from "./currency";

/**
 * How a code's discount, or an affiliate's reward, is expressed: a flat amount in the code's own currency, or a
 * percentage held in basis points (1250 is 12.5%). The two columns of each pair are exclusive, and a check below
 * holds exactly one of them set for the kind chosen.
 */
export const referralValueKind = pgEnum("referral_value_kind", ["amount", "percent"]);
export type ReferralValueKind = (typeof referralValueKind.enumValues)[number];

/**
 * Someone we pay for bringing us members: an agency, a friend, anyone. Staff create them, and can send them a link
 * to open their own sign-in, which shows them only their codes and what those earned (`user_id`). Each of their codes is a `referral_codes` row pointing here, and every payment a member makes on one of those codes
 * earns them `affiliate_earnings` worked out from the reward below at that moment.
 *
 * The reward is a flat amount (in `reward_currency`) or a percentage of what the member pays, GST included, and after
 * their discount. It is freely editable: nothing outside this database knows it, and an edit only changes what is
 * earned from then on. Bank details are deliberately not stored; staff keep them outside the system.
 *
 * Staff-only, like the codes: `bb_app` is granted nothing.
 */
export const affiliates = pgTable(
  "affiliates",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    rewardKind: referralValueKind("reward_kind").notNull(),
    /** Per paid month, in `reward_currency`'s minor units, when `reward_kind` is 'amount'. 0 means nobody is paid. */
    rewardAmountCents: integer("reward_amount_cents"),
    rewardCurrency: billingCurrency("reward_currency"),
    /** A share of each payment, GST included, after the member's discount, when `reward_kind` is 'percent'. */
    rewardPercentBasisPoints: integer("reward_percent_basis_points"),
    /**
     * How many of each member's paid months earn the reward: 12 means a member's first 12 paid months do, and from the
     * 13th on that member's payments earn nothing (their own discount carries on). Null means every paid month.
     */
    rewardCycles: integer("reward_cycles"),
    /** Off: their codes stop working for new members. Members already paying keep earning for them. */
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    /**
     * The sign-in the affiliate uses to see their own coupon dashboard. Null until they have followed a login link and
     * chosen a password. An account erased with its owner leaves the affiliate in place and simply without a sign-in.
     */
    userId: text("user_id")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    /**
     * The open login link, as a hash of its token (the link carries the token; only the hash is stored). One link is
     * open at a time: sending a new one replaces it, and following it closes it. Both columns are null when none is open.
     */
    loginTokenHash: text("login_token_hash").unique(),
    loginTokenExpiresAt: timestamp("login_token_expires_at", { withTimezone: true }),
    createdByStaffId: text("created_by_staff_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("affiliates_name_check", sql`char_length(btrim(${table.name})) between 1 and 120`),
    check(
      "affiliates_contact_check",
      sql`(${table.email} is not null or ${table.phone} is not null) and (${table.email} is null or char_length(${table.email}) between 3 and 254) and (${table.phone} is null or ${table.phone} ~ '^[+][1-9][0-9]{7,14}$')`,
    ),
    check(
      "affiliates_reward_check",
      sql`(${table.rewardKind} = 'amount' and ${table.rewardAmountCents} is not null and ${table.rewardAmountCents} >= 0 and ${table.rewardCurrency} is not null and ${table.rewardPercentBasisPoints} is null) or (${table.rewardKind} = 'percent' and ${table.rewardPercentBasisPoints} is not null and ${table.rewardPercentBasisPoints} between 1 and 10000 and ${table.rewardAmountCents} is null and ${table.rewardCurrency} is null)`,
    ),
    check(
      "affiliates_reward_cycles_check",
      sql`${table.rewardCycles} is null or ${table.rewardCycles} between 1 and 120`,
    ),
    check("affiliates_notes_check", sql`${table.notes} is null or char_length(${table.notes}) <= 2000`),
    check(
      "affiliates_login_token_check",
      sql`(${table.loginTokenHash} is null) = (${table.loginTokenExpiresAt} is null)`,
    ),
  ],
);

/**
 * A code a member types on Premium checkout (or the website plan's Check and send). Two kinds share this table, so
 * one field takes either and two codes can never collide:
 *
 * - a **coupon** (`affiliate_id` null): a discount, nobody is paid;
 * - an **affiliate code** (`affiliate_id` set): it names who brought the member, and may or may not discount.
 *
 * The discount comes off every month, for `discount_months` paid months or for the life of the subscription when that is
 * null. Razorpay takes it through a discounted
 * Razorpay plan created automatically at checkout (`provider_discount_plans`); our own copy of what it is worth is
 * frozen onto `subscriptions.discount_amount_cents`, so editing or retiring a code can never change what an existing
 * member is charged. The discount is therefore fixed for the code's life.
 *
 * Staff-only. `bb_app` is granted nothing on this table: every lookup on a member's behalf runs on the staff
 * connection, like the rest of billing.
 */
export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** Normalised uppercase; see normaliseReferralCode in packages/billing. */
    code: text("code").notNull().unique(),
    /** One code, one currency: its discount is measured against one currency's plan. */
    currency: billingCurrency("currency").notNull(),
    /** The affiliate this code earns for, or null for a coupon. */
    affiliateId: uuid("affiliate_id").references(() => affiliates.id),
    /**
     * Whether the discount is `discount_amount_cents` or `discount_percent_basis_points`. Null for an affiliate code
     * that gives no discount, which only an affiliate code may do: a coupon that takes nothing off is no coupon.
     */
    discountKind: referralValueKind("discount_kind").default("amount"),
    /**
     * Off every billing cycle, in this code's own currency's minor units, when `discount_kind` is 'amount'; null for
     * a percentage. It must stay below the plan's price, which the admin form checks against the live plan; the
     * database only knows it is positive.
     */
    discountAmountCents: integer("discount_amount_cents"),
    /**
     * Off every billing cycle as a share of the plan's pre-tax price, in basis points, when `discount_kind` is
     * 'percent'; null for an amount. At most 99%: Razorpay cannot authorise a subscription for nothing. The money it
     * is worth is worked out once, at checkout, and frozen onto the subscription like a flat amount.
     */
    discountPercentBasisPoints: integer("discount_percent_basis_points"),
    /**
     * How many paid months the discount runs for, fixed when the code is made like the discount itself. Null means no
     * limit. Copied onto `subscriptions.discount_months_left` at checkout, which counts it down.
     */
    discountMonths: integer("discount_months"),
    /** How a code is retired: existing subscriptions keep their frozen discount, new ones cannot use it. */
    active: boolean("active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** How many businesses may ever redeem it. Null means no cap. */
    maxRedemptions: integer("max_redemptions"),
    createdByStaffId: text("created_by_staff_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("referral_codes_active_idx").on(table.active, table.currency),
    index("referral_codes_affiliate_idx").on(table.affiliateId),
    check("referral_codes_code_format_check", sql`${table.code} ~ '^[A-Z0-9][A-Z0-9-]{2,23}$'`),
    // A discount always leaves something to charge: Razorpay cannot authorise a subscription for nothing. A flat
    // amount's upper bound is the cheapest service's price, which this table cannot see, so the admin form enforces that
    // half; a percentage stops at 99%. Exactly one of the pair is set, for the kind chosen. The explicit
    // `is not null` matters: a comparison against null is unknown, and a check that evaluates to unknown passes,
    // so without it a row claiming a kind with no value at all would be accepted.
    check(
      "referral_codes_discount_check",
      sql`(${table.discountKind} is null and ${table.affiliateId} is not null and ${table.discountAmountCents} is null and ${table.discountPercentBasisPoints} is null) or (${table.discountKind} = 'amount' and ${table.discountAmountCents} is not null and ${table.discountAmountCents} > 0 and ${table.discountPercentBasisPoints} is null) or (${table.discountKind} = 'percent' and ${table.discountPercentBasisPoints} is not null and ${table.discountPercentBasisPoints} between 1 and 9900 and ${table.discountAmountCents} is null)`,
    ),
    check("referral_codes_discount_months_check", sql`${table.discountMonths} is null or ${table.discountMonths} between 1 and 120`),
    check(
      "referral_codes_max_redemptions_check",
      sql`${table.maxRedemptions} is null or ${table.maxRedemptions} > 0`,
    ),
  ],
);
