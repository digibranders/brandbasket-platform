import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { charges } from "./billing";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { directoryPlaces } from "./directory-places";
import { indiaPincodes } from "./india-pincodes";

/*
 * Free listing accounts and the weekly ad auction on Firstfold Local (docs/superpowers/specs/2026-09-30-directory-ads-
 * auction-design.md). A `listing` business claims its directory listing (directory_claims); once staff approve the
 * claim it may bid for its market's ad spots, one week at a time (directory_ad_bids). When a week's bidding closes the
 * auction settles into wins (directory_ad_wins), each with a `directory_ad` charge; paying the charge puts the ad up.
 * Staff set each category's weekly price (directory_ad_prices), which is also the lowest bid.
 *
 * The customer reads its own claim, bids and wins through row-level security and writes nothing directly: every write
 * goes through the platform, which checks the customer, on the staff connection (see 0065).
 *
 * Claims, bids, wins and staff ads name their business by `listing_key` and, since 0077, by `place_id`: its permanent
 * directory_places id (docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md). A claim and a staff ad
 * take the place their key is a legacy key of, a bid its claim's and a win its bid's (0078's trigger holds that);
 * backfillDirectoryPlaces fills rows written before. The key stays required here: it is also the ad market.
 */

/** Same four kebab segments as LISTING_KEY_PATTERN in the website contract, as a Postgres regular expression. */
const LISTING_KEY_REGEX = "^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$";
const SLUG_REGEX = "^[a-z0-9]+(-[a-z0-9]+)*$";

/** Bids and prices are whole rupees from ₹100 to ₹1,00,000, held in paise like every other amount. */
export const DIRECTORY_AD_MIN_PAISE = 10_000;
export const DIRECTORY_AD_MAX_PAISE = 10_000_000;
/**
 * How many spots each placement has. Must stay in step with `spotRule` below, which the database checks, and with the
 * website's layouts (the list page's side column, the home page's bento).
 */
export const HOME_AD_SPOTS = 4;
const SPOT_COUNTS = { top: 1, side: 2, profile: 1, home: HOME_AD_SPOTS } as const;

/**
 * `home` auctions are not for one category in one area: every business in a city competes for the home page. Their
 * bids, wins and staff ads keep this slug where the category and the area would be, so the auction's one-spot-per-
 * market-and-week rules hold unchanged (docs/superpowers/specs/2026-10-07-ad-spots-and-reports-design.md).
 */
export const HOME_AD_SCOPE_SLUG = "all";

/** The SQL for "this placement's spot number is one it has", over a table's placement and spot columns. */
function spotRule(placement: AnyPgColumn, spot: AnyPgColumn) {
  return sql`(${placement} = 'top' and ${spot} between 1 and ${sql.raw(String(SPOT_COUNTS.top))}) or (${placement} = 'side' and ${spot} between 1 and ${sql.raw(String(SPOT_COUNTS.side))}) or (${placement} = 'profile' and ${spot} between 1 and ${sql.raw(String(SPOT_COUNTS.profile))}) or (${placement} = 'home' and ${spot} between 1 and ${sql.raw(String(SPOT_COUNTS.home))})`;
}

const PAISE_RULE = `between ${DIRECTORY_AD_MIN_PAISE} and ${DIRECTORY_AD_MAX_PAISE}`;

export const directoryClaimStatus = pgEnum("directory_claim_status", ["pending", "approved", "rejected"]);
export type DirectoryClaimStatus = (typeof directoryClaimStatus.enumValues)[number];

/**
 * `claimed`: the account claimed a listing the directory already had, from its page. `added`: the business was not in
 * the directory, and its owner picked its category, city and area on the Business page
 * (docs/superpowers/specs/2026-09-30-add-my-business-design.md). An added business has no page on the website yet.
 */
export const directoryClaimOrigin = pgEnum("directory_claim_origin", ["claimed", "added"]);
export type DirectoryClaimOrigin = (typeof directoryClaimOrigin.enumValues)[number];

/**
 * Where an ad shows. `top` is the first row of a list page (one spot); `side` the side column's two spots; `profile`
 * the one spot on every business page in the market; `home` the home page's tiles (HOME_AD_SPOTS), sold city-wide.
 */
export const DIRECTORY_AD_PLACEMENTS = ["top", "side", "profile", "home"] as const;
export const directoryAdPlacement = pgEnum("directory_ad_placement", DIRECTORY_AD_PLACEMENTS);
export type DirectoryAdPlacement = (typeof DIRECTORY_AD_PLACEMENTS)[number];

export const directoryAdBidStatus = pgEnum("directory_ad_bid_status", ["active", "withdrawn", "won", "lost"]);
export type DirectoryAdBidStatus = (typeof directoryAdBidStatus.enumValues)[number];

export const directoryAdWinStatus = pgEnum("directory_ad_win_status", ["awaiting_payment", "paid", "lapsed"]);
export type DirectoryAdWinStatus = (typeof directoryAdWinStatus.enumValues)[number];

/**
 * A free listing account's claim to one directory listing. Staff call `phone` and approve or reject it; approving
 * also verifies the listing (directory_verifications). One claim per account, and at most one approved claim per
 * listing. The ad's one line (`tagline`) lives here too: it shows only once staff have approved it, and changing it
 * sends it back for approval. A business its owner added (`origin`) is a claim to a listing key made from the owner's
 * own picks, and carries the street address the website would otherwise have had.
 */
export const directoryClaims = pgTable(
  "directory_claims",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    listingKey: text("listing_key").notNull(),
    placeId: text("place_id").references(() => directoryPlaces.id),
    /** The listing's name as the website showed it when the claim was made. */
    businessName: text("business_name").notNull(),
    /** The number staff call to confirm the claim, E.164. */
    phone: text("phone").notNull(),
    origin: directoryClaimOrigin("origin").notNull().default("claimed"),
    /** Where an added business is, as its owner typed it; null for a claimed listing, whose address the website has. */
    streetAddress: text("street_address"),
    /**
     * The PIN code an owner-added business outside the opened districts gave (india_pincodes), and the post-office
     * locality it picked there. Null for a business in an opened district (its area is in the listing key) and for a
     * claimed listing. A PIN that has a claim cannot leave india_pincodes.
     */
    pincode: text("pincode").references(() => indiaPincodes.pincode, { onDelete: "restrict" }),
    localityName: text("locality_name"),
    /** The business's own website, as its owner gave it: an http(s) address, or null. Shown once the claim is approved. */
    websiteUrl: text("website_url"),
    status: directoryClaimStatus("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: text("decided_by_user_id").references(() => users.id),
    /**
     * When the owner of an added business published it from their Business profile: their own approval, with no call
     * from us (docs/superpowers/specs/2026-10-01-business-profile-design.md). Null for a claim staff decided.
     */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    tagline: text("tagline"),
    taglineApproved: boolean("tagline_approved").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("directory_claims_business_id_key").on(table.businessId),
    uniqueIndex("directory_claims_one_approved_per_listing_idx")
      .on(table.listingKey)
      .where(sql`${table.status} = 'approved'`),
    index("directory_claims_place_id_idx").on(table.placeId),
    // At most one approved claim per business, by id as by key.
    uniqueIndex("directory_claims_place_id_approved_idx")
      .on(table.placeId)
      .where(sql`${table.placeId} is not null and ${table.status} = 'approved'`),
    // The staff console's queue, pending first and oldest first.
    index("directory_claims_status_created_at_idx").on(table.status, table.createdAt),
    check(
      "directory_claims_listing_key_check",
      sql`char_length(${table.listingKey}) <= 200 and ${table.listingKey} ~ ${sql.raw(`'${LISTING_KEY_REGEX}'`)}`,
    ),
    check("directory_claims_business_name_check", sql`char_length(${table.businessName}) between 1 and 200`),
    check("directory_claims_phone_check", sql`${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    check(
      "directory_claims_decided_check",
      sql`(${table.status} = 'pending') = (${table.decidedAt} is null) and (${table.decidedAt} is null) = (${table.decidedByUserId} is null)`,
    ),
    check(
      "directory_claims_tagline_check",
      sql`${table.tagline} is null or (char_length(${table.tagline}) between 1 and 80 and ${table.tagline} = btrim(${table.tagline}) and ${table.tagline} !~ '[\\r\\n]')`,
    ),
    check(
      "directory_claims_street_address_check",
      sql`(${table.origin} = 'added') = (${table.streetAddress} is not null) and (${table.streetAddress} is null or (char_length(${table.streetAddress}) between 1 and 200 and ${table.streetAddress} = btrim(${table.streetAddress}) and ${table.streetAddress} !~ '[\\r\\n]'))`,
    ),
    check(
      "directory_claims_published_check",
      sql`${table.publishedAt} is null or (${table.origin} = 'added' and ${table.status} <> 'pending')`,
    ),
    check("directory_claims_tagline_approved_check", sql`${table.tagline} is not null or not ${table.taglineApproved}`),
    check("directory_claims_pincode_check", sql`${table.pincode} is null or ${table.pincode} ~ '^[1-9][0-9]{5}$'`),
    check(
      "directory_claims_postal_check",
      sql`(${table.pincode} is null) = (${table.localityName} is null) and (${table.pincode} is null or ${table.origin} = 'added') and (${table.localityName} is null or char_length(${table.localityName}) between 1 and 200)`,
    ),
    check(
      "directory_claims_website_url_check",
      sql`${table.websiteUrl} is null or (char_length(${table.websiteUrl}) <= 300 and ${table.websiteUrl} ~ '^https?://[^[:space:]]+$')`,
    ),
  ],
);

/**
 * A category's weekly price for each placement, set by staff. It applies in every area and is the lowest bid. A
 * category with no row is not open for ads.
 */
export const directoryAdPrices = pgTable(
  "directory_ad_prices",
  {
    categorySlug: text("category_slug").primaryKey(),
    topWeekPaise: integer("top_week_paise").notNull(),
    sideWeekPaise: integer("side_week_paise").notNull(),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("directory_ad_prices_category_slug_check", sql`${table.categorySlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check(
      "directory_ad_prices_amounts_check",
      sql`${table.topWeekPaise} ${sql.raw(PAISE_RULE)} and ${table.topWeekPaise} % 100 = 0 and ${table.sideWeekPaise} ${sql.raw(PAISE_RULE)} and ${table.sideWeekPaise} % 100 = 0`,
    ),
  ],
);

/**
 * One business's sealed bid for one placement in its market for one week (Monday, Asia/Kolkata). The market is the
 * category, city and area of the business's claimed listing, copied here so an auction is one indexed lookup.
 * `amount_set_at` is when the amount last changed: the earlier of two equal bids wins.
 */
export const directoryAdBids = pgTable(
  "directory_ad_bids",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    listingKey: text("listing_key").notNull(),
    placeId: text("place_id").references(() => directoryPlaces.id),
    categorySlug: text("category_slug").notNull(),
    citySlug: text("city_slug").notNull(),
    areaSlug: text("area_slug").notNull(),
    placement: directoryAdPlacement("placement").notNull(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    amountPaise: integer("amount_paise").notNull(),
    amountSetAt: timestamp("amount_set_at", { withTimezone: true }).notNull(),
    status: directoryAdBidStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("directory_ad_bids_business_placement_week_key").on(table.businessId, table.placement, table.weekStart),
    // Settlement's "which auctions have closed with bids still open".
    index("directory_ad_bids_status_week_start_idx").on(table.status, table.weekStart),
    index("directory_ad_bids_auction_idx").on(
      table.categorySlug,
      table.citySlug,
      table.areaSlug,
      table.placement,
      table.weekStart,
    ),
    check(
      "directory_ad_bids_listing_key_check",
      sql`char_length(${table.listingKey}) <= 200 and ${table.listingKey} ~ ${sql.raw(`'${LISTING_KEY_REGEX}'`)}`,
    ),
    // A `home` bid sits in its city's home-page auction (HOME_AD_SCOPE_SLUG); every other bid in the market its listing is in.
    check(
      "directory_ad_bids_market_check",
      sql`case ${table.placement}
        when 'home' then ${table.categorySlug} = ${sql.raw(`'${HOME_AD_SCOPE_SLUG}'`)} and ${table.areaSlug} = ${sql.raw(`'${HOME_AD_SCOPE_SLUG}'`)} and ${table.listingKey} like '%/' || ${table.citySlug} || '/%/%'
        else ${table.listingKey} like ${table.categorySlug} || '/' || ${table.citySlug} || '/' || ${table.areaSlug} || '/%'
      end`,
    ),
    check("directory_ad_bids_week_start_check", sql`extract(isodow from ${table.weekStart}) = 1`),
    check(
      "directory_ad_bids_amount_check",
      sql`${table.amountPaise} ${sql.raw(PAISE_RULE)} and ${table.amountPaise} % 100 = 0`,
    ),
  ],
);

/**
 * A spot won in a settled auction: which bid, which spot (1 is the top of its placement), the second price it pays
 * (net, in paise) and the `directory_ad` charge that asks for it with GST. The ad shows once the charge is paid,
 * until the week ends. Unpaid by `pay_by`, the win lapses, its charge is cancelled, and the spot passes to the next
 * bidder as a new win. At most one live (not lapsed) win per spot.
 */
export const directoryAdWins = pgTable(
  "directory_ad_wins",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    bidId: uuid("bid_id")
      .notNull()
      .references(() => directoryAdBids.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    listingKey: text("listing_key").notNull(),
    placeId: text("place_id").references(() => directoryPlaces.id),
    categorySlug: text("category_slug").notNull(),
    citySlug: text("city_slug").notNull(),
    areaSlug: text("area_slug").notNull(),
    placement: directoryAdPlacement("placement").notNull(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    spot: smallint("spot").notNull(),
    pricePaise: integer("price_paise").notNull(),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => charges.id),
    status: directoryAdWinStatus("status").notNull().default("awaiting_payment"),
    payBy: timestamp("pay_by", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    lapsedAt: timestamp("lapsed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("directory_ad_wins_bid_id_key").on(table.bidId),
    unique("directory_ad_wins_charge_id_key").on(table.chargeId),
    uniqueIndex("directory_ad_wins_one_live_per_spot_idx")
      .on(table.categorySlug, table.citySlug, table.areaSlug, table.placement, table.weekStart, table.spot)
      .where(sql`${table.status} <> 'lapsed'`),
    // The website's "this week's ads for this market" and the lapse sweep.
    index("directory_ad_wins_market_week_idx").on(table.categorySlug, table.citySlug, table.areaSlug, table.weekStart),
    index("directory_ad_wins_status_pay_by_idx").on(table.status, table.payBy),
    index("directory_ad_wins_business_id_idx").on(table.businessId, table.weekStart),
    index("directory_ad_wins_place_id_idx").on(table.placeId),
    check("directory_ad_wins_week_start_check", sql`extract(isodow from ${table.weekStart}) = 1`),
    check("directory_ad_wins_spot_check", spotRule(table.placement, table.spot)),
    check("directory_ad_wins_price_check", sql`${table.pricePaise} ${sql.raw(PAISE_RULE)}`),
    check(
      "directory_ad_wins_status_check",
      sql`case ${table.status}
        when 'awaiting_payment' then ${table.paidAt} is null and ${table.lapsedAt} is null
        when 'paid' then ${table.paidAt} is not null and ${table.lapsedAt} is null
        else ${table.paidAt} is null and ${table.lapsedAt} is not null
      end`,
    ),
  ],
);

/**
 * A picture staff upload for a staff-placed ad (docs/superpowers/specs/2026-10-12-staff-link-ads-design.md): stored at
 * exactly its spot's shape, shared by every week of a booking. Not a listing owner's picture, so it has no business and
 * needs no approval: staff made it. Served to the website only while a live staff ad uses it.
 */
export const directoryStaffAdPictures = pgTable(
  "directory_staff_ad_pictures",
  {
    /** Generated before the file is stored, because the storage key is built from it. */
    id: uuid("id").primaryKey(),
    /** `staff-ads/{id}/display`. */
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sha256: text("sha256").notNull(),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    /** Set when the last ad that used it is taken down; its file is deleted then. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    check("directory_staff_ad_pictures_storage_key_check", sql`${table.storageKey} = 'staff-ads/' || ${table.id} || '/display'`),
    check("directory_staff_ad_pictures_size_check", sql`${table.bytes} > 0 and ${table.width} > 0 and ${table.height} > 0`),
  ],
);

/**
 * An ad staff placed by hand for a business that asked for one: any listing, in any market (not only its own), on the
 * spot and week staff chose. It needs no account, no bid and no charge: what was agreed and how it was paid are
 * staff's own notes (`agreed_paise`, `note`). One row per week. A staff-placed ad holds its spot, so that week's
 * auction sells only the spots left; taking it down (`removed_at`) frees the spot again. At most one live staff ad
 * per spot, and never on a spot an auction win holds (0067's triggers).
 */
export const directoryStaffAds = pgTable(
  "directory_staff_ads",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** The advertised business's listing: where the ad leads. Null for a link ad, which leads to `linkUrl` instead. */
    listingKey: text("listing_key"),
    placeId: text("place_id").references(() => directoryPlaces.id),
    /** Where a link ad leads: any web address staff chose. Null for an ad that leads to a business's page. */
    linkUrl: text("link_url"),
    /** The picture staff uploaded for this ad, in place of the business's own or the category's stock photo; null for none. */
    pictureId: uuid("picture_id").references(() => directoryStaffAdPictures.id),
    /** The business's name, or a link ad's headline, as the ad shows it. */
    businessName: text("business_name").notNull(),
    /** Written or checked by staff, so it shows as it is. */
    tagline: text("tagline"),
    categorySlug: text("category_slug").notNull(),
    citySlug: text("city_slug").notNull(),
    areaSlug: text("area_slug").notNull(),
    placement: directoryAdPlacement("placement").notNull(),
    spot: smallint("spot").notNull(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    /** The weekly price agreed with the business, before GST; null when none was recorded. */
    agreedPaise: integer("agreed_paise"),
    note: text("note"),
    placedByUserId: text("placed_by_user_id")
      .notNull()
      .references(() => users.id),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedByUserId: text("removed_by_user_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("directory_staff_ads_one_live_per_spot_idx")
      .on(table.categorySlug, table.citySlug, table.areaSlug, table.placement, table.weekStart, table.spot)
      .where(sql`${table.removedAt} is null`),
    // The staff console's list of this week's and later ads.
    index("directory_staff_ads_week_start_idx").on(table.weekStart),
    check(
      "directory_staff_ads_listing_key_check",
      sql`${table.listingKey} is null or (char_length(${table.listingKey}) <= 200 and ${table.listingKey} ~ ${sql.raw(`'${LISTING_KEY_REGEX}'`)})`,
    ),
    check(
      "directory_staff_ads_link_url_check",
      sql`${table.linkUrl} is null or (char_length(${table.linkUrl}) between 12 and 500 and ${table.linkUrl} ~ '^https?://[^[:space:]]+$')`,
    ),
    // An ad leads to a business's page or to a link, never both and never neither.
    check("directory_staff_ads_target_check", sql`(${table.listingKey} is null) <> (${table.linkUrl} is null)`),
    check("directory_staff_ads_business_name_check", sql`char_length(${table.businessName}) between 1 and 200`),
    check(
      "directory_staff_ads_tagline_check",
      sql`${table.tagline} is null or (char_length(${table.tagline}) between 1 and 80 and ${table.tagline} = btrim(${table.tagline}) and ${table.tagline} !~ '[\\r\\n]')`,
    ),
    check(
      "directory_staff_ads_market_check",
      sql`${table.categorySlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)} and ${table.citySlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)} and ${table.areaSlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`,
    ),
    check("directory_staff_ads_week_start_check", sql`extract(isodow from ${table.weekStart}) = 1`),
    check("directory_staff_ads_spot_check", spotRule(table.placement, table.spot)),
    check(
      "directory_staff_ads_agreed_check",
      sql`${table.agreedPaise} is null or (${table.agreedPaise} between 0 and ${sql.raw(String(DIRECTORY_AD_MAX_PAISE))} and ${table.agreedPaise} % 100 = 0)`,
    ),
    check(
      "directory_staff_ads_note_check",
      sql`${table.note} is null or (char_length(${table.note}) between 1 and 200 and ${table.note} = btrim(${table.note}))`,
    ),
    check("directory_staff_ads_removed_check", sql`(${table.removedAt} is null) = (${table.removedByUserId} is null)`),
  ],
);

/**
 * A weekly price for a placement that is not priced by category alone: the home page (one price for the whole city,
 * kept under HOME_AD_SCOPE_SLUG) and a category's business pages. Like directory_ad_prices it is set by staff and is
 * the lowest bid; with no row the placement is closed to bids.
 */
export const directoryAdSpotPrices = pgTable(
  "directory_ad_spot_prices",
  {
    /** The category the price is for, or HOME_AD_SCOPE_SLUG for the home page. */
    scopeSlug: text("scope_slug").notNull(),
    placement: directoryAdPlacement("placement").notNull(),
    weekPaise: integer("week_paise").notNull(),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ name: "directory_ad_spot_prices_pkey", columns: [table.scopeSlug, table.placement] }),
    check("directory_ad_spot_prices_scope_slug_check", sql`${table.scopeSlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    // `home` is priced for the whole city and `profile` per category: never the other way round.
    check(
      "directory_ad_spot_prices_placement_check",
      sql`(${table.placement} = 'home' and ${table.scopeSlug} = ${sql.raw(`'${HOME_AD_SCOPE_SLUG}'`)}) or (${table.placement} = 'profile' and ${table.scopeSlug} <> ${sql.raw(`'${HOME_AD_SCOPE_SLUG}'`)})`,
    ),
    check("directory_ad_spot_prices_amount_check", sql`${table.weekPaise} ${sql.raw(PAISE_RULE)} and ${table.weekPaise} % 100 = 0`),
  ],
);

/** What visitors did with an ad: `impression` (it was on the page they saw) or `click` (they followed it). */
export const DIRECTORY_AD_EVENT_KINDS = ["impression", "click"] as const;
export const directoryAdEventKind = pgEnum("directory_ad_event_kind", DIRECTORY_AD_EVENT_KINDS);
export type DirectoryAdEventKind = (typeof DIRECTORY_AD_EVENT_KINDS)[number];

/**
 * How many visitors saw and clicked each business's ad in each placement each day (an Asia/Kolkata calendar day), for
 * the advertiser's reports. Like directory_daily_counts, only these aggregates are kept, and the platform counts a
 * visitor once per ad, placement, kind and day with a hashed rate-limit key, then forgets them. An ad is its
 * advertiser's place: the count is kept whoever held the spot, auction winner or staff.
 */
export const directoryAdDailyCounts = pgTable(
  "directory_ad_daily_counts",
  {
    placeId: text("place_id")
      .notNull()
      .references(() => directoryPlaces.id),
    placement: directoryAdPlacement("placement").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    kind: directoryAdEventKind("kind").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [
    primaryKey({ name: "directory_ad_daily_counts_pkey", columns: [table.placeId, table.placement, table.day, table.kind] }),
    // The report's range scan and the purge.
    index("directory_ad_daily_counts_day_idx").on(table.day),
    check("directory_ad_daily_counts_count_check", sql`${table.count} >= 0`),
  ],
);
