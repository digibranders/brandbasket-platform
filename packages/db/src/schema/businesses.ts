import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { createdAt } from "./columns";
import { billingCurrency } from "./currency";
import { referralCodes } from "./referrals";

export const businessMemberRole = pgEnum("business_member_role", ["owner", "editor"]);
export type BusinessMemberRole = (typeof businessMemberRole.enumValues)[number];

/**
 * `website` is a Fynix client (a subscription, a website project). `listing` is a free the local directory account a
 * business opens to claim or add its directory listing and bid for ad spots: no website and no paid subscription, and
 * the customer dashboard shows it Listing, Photos, Advertise, Billing, Premium and Settings (docs/superpowers/specs/
 * 2026-09-30-directory-ads-auction-design.md). It may hold an unpaid checkout for the Premium membership; the payment
 * that settles it turns the business into a `website` client (openMembershipForListingBusiness).
 */
export const businessKind = pgEnum("business_kind", ["website", "listing"]);
export type BusinessKind = (typeof businessKind.enumValues)[number];

/**
 * What the owner chose when they signed up on the one entry page (docs/superpowers/specs/2026-09-30-single-entry-
 * premium-design.md, 2026-10-07-care-plan-design.md): the free listing, the Care plan or the Premium membership.
 * `own_website` is from the first version of the page, which asked "Do you have your own website?" first; it is no
 * longer offered, but accounts opened that way keep it. A `listing` business that chose `care` or `premium` is held
 * on that plan's payment page until it pays, or changes its mind to `listing_only`.
 */
export const signupChoice = pgEnum("signup_choice", ["own_website", "listing_only", "premium", "care"]);
export type SignupChoice = (typeof signupChoice.enumValues)[number];

/** A business is the tenant: the isolation, billing and hosting boundary. */
export const businesses = pgTable("businesses", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: businessKind("kind").notNull().default("website"),
  /** Null for a business made from a setup link, and for accounts opened before the question was asked. */
  signupChoice: signupChoice("signup_choice"),
  /** Inherited from the lead when the tenant is created; every charge and every price shown uses it. */
  currency: billingCurrency("currency").notNull().default("USD"),
  /**
   * The referral code applied but not yet paid on. The customer sets it on Check and send and may remove it until
   * they pay; from then on the subscription's own frozen copy is what money is decided from, and this is kept only
   * as the tenant's permanent attribution.
   */
  referralCodeId: uuid("referral_code_id").references(() => referralCodes.id),
  /**
   * Where this business's own website is served (its Vercel address, or its domain once live), with no path. Staff
   * set it; "Preview on my website" opens `<websiteUrl>/blog/preview`. Null hides that button.
   */
  websiteUrl: text("website_url"),
  /**
   * IANA zone (e.g. Asia/Kolkata), set by staff, stored in the runtime's canonical spelling. Appointments, closures
   * and announcement dates are read in it.
   */
  timeZone: text("time_zone"),
  /**
   * Where the owner is, asked at sign-up: an ISO 3166-1 alpha-2 code in capitals ("IN"). Null for accounts opened before
   * the question was asked and for a business made from a setup link.
   */
  countryCode: text("country_code"),
  /**
   * The owner's state for GST, as a platform state code ("mh"), typed in by the owner, never worked out from a pincode.
   * Asked only of India; null for any other country and for older accounts. It decides CGST and SGST against IGST on an
   * invoice when the customer has given no billing details.
   */
  stateCode: text("state_code"),
  createdAt: createdAt(),
}, (table) => [
  check("businesses_country_code_check", sql`${table.countryCode} is null or ${table.countryCode} ~ '^[A-Z]{2}$'`),
  check("businesses_state_code_check", sql`${table.stateCode} is null or (${table.stateCode} ~ '^[a-z]{2}$' and ${table.countryCode} = 'IN')`),
  check("businesses_website_url_https", sql`${table.websiteUrl} is null or ${table.websiteUrl} ~ '^https://[^/?#]+$'`),
]);

export const businessMembers = pgTable(
  "business_members",
  {
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: businessMemberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.businessId, table.userId] }),
    index("business_members_user_id_idx").on(table.userId),
  ],
);
