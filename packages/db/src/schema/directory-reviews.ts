import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { createdAt, updatedAt } from "./columns";
import { directoryPlaces } from "./directory-places";

/**
 * The local directory's ratings, reviews and enquiries (docs/superpowers/specs/2026-09-29-directory-reviews-enquiries-
 * design.md). The directory's businesses live in the marketing website's static listing file, not here: a business
 * is named by its listing key, `<service>/<city>/<area>/<slug>`, and the platform keeps only that key and a snapshot
 * of the business's name. Every table is staff-only (see 0055 and 0057): the website reaches them through the
 * platform's /api/directory/* routes, which run on the staff connection.
 *
 * Moving to permanent ids (docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md): each table also has
 * `place_id`, the business's directory_places id (0077), and every write since Task 7 sets it when the business has a
 * place. A row keeps the listing key it was asked by, if any: a write by id alone has none (0078 lets reviews, review
 * codes, enquiries and daily counts go without), and a key no place has is still written by the key alone. Each row
 * names its business one way or the other (the `_business_check`s). backfillDirectoryPlaces fills place_id on rows
 * written by key before their place was known, and the partial unique indexes on it hold the same one-per-business
 * rules as the key's.
 */

/**
 * The highlight ids a review may pick, in the order that breaks a tie for a business's top highlight. Must match
 * REVIEW_HIGHLIGHTS in apps/platform/lib/directory-api.ts; packages/db does not depend on the apps, so the ids are
 * written literally here and apps/platform/lib/directory-parity.test.ts asserts the two agree.
 */
export const DIRECTORY_REVIEW_HIGHLIGHT_IDS = [
  "good_service",
  "value_for_money",
  "friendly_staff",
  "clean",
  "on_time",
  "quality",
  "expert",
  "quick_response",
] as const;
export type DirectoryReviewHighlightId = (typeof DIRECTORY_REVIEW_HIGHLIGHT_IDS)[number];

/** Same four kebab segments as LISTING_KEY_PATTERN in the contract, as a Postgres regular expression. */
const LISTING_KEY_REGEX = "^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$";
const HIGHLIGHT_ARRAY_LITERAL = `ARRAY[${DIRECTORY_REVIEW_HIGHLIGHT_IDS.map((id) => `'${id}'`).join(", ")}]::text[]`;

export const directoryReviewStatus = pgEnum("directory_review_status", ["published", "hidden"]);
export type DirectoryReviewStatus = (typeof directoryReviewStatus.enumValues)[number];

/** Who wrote a comment: a visitor (confirmed by a code) or the business's own verified owner (signed in). */
export const directoryCommentAuthor = pgEnum("directory_comment_author", ["visitor", "owner"]);
export type DirectoryCommentAuthor = (typeof directoryCommentAuthor.enumValues)[number];

/** The longest a visitor's comment may be, and the longer room a business's owner gets to answer one. */
export const DIRECTORY_VISITOR_COMMENT_MAX = 300;
export const DIRECTORY_OWNER_REPLY_MAX = 500;

export const directoryEnquiryKind = pgEnum("directory_enquiry_kind", ["business", "top_list"]);
export type DirectoryEnquiryKind = (typeof directoryEnquiryKind.enumValues)[number];

export const directoryEnquiryStatus = pgEnum("directory_enquiry_status", ["new", "handled"]);
/** What a visitor's name is changed to wherever their words or number had been kept, once they have erased their data. */
export const ERASED_VISITOR_NAME = "Erased visitor";

export type DirectoryEnquiryStatus = (typeof directoryEnquiryStatus.enumValues)[number];

/**
 * One visitor's review of one directory business, confirmed by a code sent to `phone`. One per business and phone
 * (by place, or by listing key for a key no place has): a second review from the same number replaces the first and
 * publishes it again (see publishDirectoryReviewFromOtp). Hidden reviews stay stored but stop counting and stop showing; staff can restore
 * them. The full name and phone are never shown publicly: the website only ever sees a first name and an initial.
 */
export const directoryReviews = pgTable(
  "directory_reviews",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** The address the review was asked by; null for one asked by place id. */
    listingKey: text("listing_key"),
    placeId: text("place_id").references(() => directoryPlaces.id),
    businessName: text("business_name").notNull(),
    reviewerName: text("reviewer_name").notNull(),
    /** The reviewer's confirmed number. A review its writer erases is deleted, not kept without it (eraseDirectoryVisitorData). */
    phone: text("phone").notNull(),
    rating: integer("rating").notNull(),
    text: text("text"),
    highlights: text("highlights")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** How many visitors marked the review Helpful. A replaced review starts again at 0 (see publishDirectoryReviewFromOtp). */
    helpfulCount: integer("helpful_count").notNull().default(0),
    status: directoryReviewStatus("status").notNull().default("published"),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenByUserId: text("hidden_by_user_id").references(() => users.id),
    /**
     * The reviewer ticked "Let this business contact me about this review" (added 2026-10-13, N14): only then does the
     * business's owner see their number, to resolve the review. Never set for reviews posted before the box existed, and
     * set again from each re-review, so unticking it on a new review withdraws it.
     */
    ownerMayContact: boolean("owner_may_contact").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // One review per number per business, and the conflict target of the publish upsert.
    unique("directory_reviews_listing_key_phone_key").on(table.listingKey, table.phone),
    // A business page's reviews, newest first.
    index("directory_reviews_listing_key_created_at_idx").on(table.listingKey, table.createdAt),
    index("directory_reviews_place_id_idx").on(table.placeId, table.createdAt),
    // One published review per number per business. Published only, so a hidden review never blocks a new one: a
    // re-review replaces the old one, as the listing-key unique above does.
    uniqueIndex("directory_reviews_place_id_phone_idx")
      .on(table.placeId, table.phone)
      .where(sql`${table.placeId} is not null and ${table.status} = 'published'`),
    // The staff console's list, newest first.
    index("directory_reviews_created_at_idx").on(table.createdAt),
    check(
      "directory_reviews_listing_key_check",
      sql`char_length(${table.listingKey}) <= 200 and ${table.listingKey} ~ ${sql.raw(`'${LISTING_KEY_REGEX}'`)}`,
    ),
    check("directory_reviews_business_check", sql`${table.listingKey} is not null or ${table.placeId} is not null`),
    check("directory_reviews_business_name_check", sql`char_length(${table.businessName}) between 1 and 200`),
    check("directory_reviews_reviewer_name_check", sql`char_length(${table.reviewerName}) between 1 and 60`),
    // E.164, the same literal-in-template pattern as appointments_phone_check.
    check("directory_reviews_phone_check", sql`${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    check("directory_reviews_rating_check", sql`${table.rating} between 1 and 5`),
    check("directory_reviews_helpful_count_check", sql`${table.helpfulCount} >= 0`),
    check("directory_reviews_text_check", sql`${table.text} is null or char_length(${table.text}) between 1 and 500`),
    // At most two, both from the fixed list, and not the same one twice.
    check(
      "directory_reviews_highlights_check",
      sql`cardinality(${table.highlights}) <= 2 and ${table.highlights} <@ ${sql.raw(HIGHLIGHT_ARRAY_LITERAL)} and (cardinality(${table.highlights}) < 2 or ${table.highlights}[1] <> ${table.highlights}[2])`,
    ),
    // A published review carries no trace of having been hidden; a hidden one always says when.
    check(
      "directory_reviews_hidden_check",
      sql`(${table.status} = 'hidden' and ${table.hiddenAt} is not null) or (${table.status} = 'published' and ${table.hiddenAt} is null and ${table.hiddenByUserId} is null)`,
    ),
  ],
);

/**
 * The pending-review code challenge: the review itself waits in `payload` until the code sent to `phone` is
 * confirmed, then becomes (or replaces) a directory_reviews row and this row is deleted. Same shape and rules as
 * booking_otps, without a business: 6 digits, HMAC-hashed with the account code secret and salted with the row's id,
 * 10 minutes, 5 attempts. Rows left behind are purged an hour after they expire.
 */
export const directoryReviewOtps = pgTable(
  "directory_review_otps",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** The address the review was asked by; null for one asked by place id. */
    listingKey: text("listing_key"),
    placeId: text("place_id").references(() => directoryPlaces.id),
    /**
     * Set when the code is for a comment on this review rather than for a review: the business columns above are then
     * the review's own, and the payload is a DirectoryCommentOtpPayload. A review's code (null) never publishes a comment
     * and a comment's never publishes a review.
     */
    reviewId: uuid("review_id").references(() => directoryReviews.id),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // The purge's range scan.
    index("directory_review_otps_expires_at_idx").on(table.expiresAt),
    check(
      "directory_review_otps_listing_key_check",
      sql`char_length(${table.listingKey}) <= 200 and ${table.listingKey} ~ ${sql.raw(`'${LISTING_KEY_REGEX}'`)}`,
    ),
    check("directory_review_otps_business_check", sql`${table.listingKey} is not null or ${table.placeId} is not null`),
    check("directory_review_otps_phone_check", sql`${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    check("directory_review_otps_code_hash_check", sql`char_length(${table.codeHash}) > 0`),
    check("directory_review_otps_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

/**
 * A visitor's comment on a published review, confirmed by a code sent to `phone` like the review itself (the code waits
 * in directory_review_otps with its review_id set). Shown under the review as the commenter's first name and initial;
 * the full name and phone stay with staff. Like a review, a hidden comment stays stored but stops showing, and staff can
 * restore it. Its writer can delete it (a privacy request, 0156), and it goes with its review when that is deleted.
 *
 * A comment may instead be the business's own answer (`author_kind = 'owner'`): written by a signed-in, verified owner,
 * with no code and no phone, and shown with an "Owner" tag signed with the business's name. An owner may edit what they
 * wrote and take it down (which hides it), but never touches a visitor's comment or review.
 */
export const directoryReviewComments = pgTable(
  "directory_review_comments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => directoryReviews.id),
    /** Who wrote it. An `owner` comment is the business's verified owner answering, shown with an "Owner" tag. */
    authorKind: directoryCommentAuthor("author_kind").notNull().default("visitor"),
    /** For staff only: a visitor's full name, or the owner's account name. Publicly an owner's comment is signed with the business's name. */
    commenterName: text("commenter_name").notNull(),
    /** The visitor's confirmed number; null for an owner, who is signed in and needs no code. */
    phone: text("phone"),
    /** The signed-in account behind an owner's comment; null for a visitor's. */
    ownerUserId: text("owner_user_id").references(() => users.id),
    text: text("text").notNull(),
    /** When an owner last changed what they wrote; null while it is as first posted. */
    editedAt: timestamp("edited_at", { withTimezone: true }),
    status: directoryReviewStatus("status").notNull().default("published"),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenByUserId: text("hidden_by_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    // A review's comments, oldest first.
    index("directory_review_comments_review_id_created_at_idx").on(table.reviewId, table.createdAt),
    // The staff console's list, newest first.
    index("directory_review_comments_created_at_idx").on(table.createdAt),
    check("directory_review_comments_commenter_name_check", sql`char_length(${table.commenterName}) between 1 and 60`),
    check("directory_review_comments_phone_check", sql`${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    // A visitor's number and no account; an owner's account and no number.
    check(
      "directory_review_comments_author_check",
      sql`(${table.authorKind} = 'visitor' and ${table.phone} is not null and ${table.ownerUserId} is null and ${table.editedAt} is null) or (${table.authorKind} = 'owner' and ${table.phone} is null and ${table.ownerUserId} is not null)`,
    ),
    check(
      "directory_review_comments_text_check",
      sql`char_length(${table.text}) between 1 and (case when ${table.authorKind} = 'owner' then ${sql.raw(String(DIRECTORY_OWNER_REPLY_MAX))} else ${sql.raw(String(DIRECTORY_VISITOR_COMMENT_MAX))} end)`,
    ),
    check(
      "directory_review_comments_hidden_check",
      sql`(${table.status} = 'hidden' and ${table.hiddenAt} is not null) or (${table.status} = 'published' and ${table.hiddenAt} is null and ${table.hiddenByUserId} is null)`,
    ),
  ],
);

/**
 * "Send enquiry" from a directory card or business page (`business`, about one listing), or the list page's "Get the
 * list of top …" form (`top_list`, about a service in an area, so no listing). No code confirms them; Brandbasket staff
 * read them in the console and pass them on, then mark them handled.
 */
export const directoryEnquiries = pgTable(
  "directory_enquiries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    listingKey: text("listing_key"),
    placeId: text("place_id").references(() => directoryPlaces.id),
    businessName: text("business_name"),
    serviceLabel: text("service_label").notNull(),
    areaLabel: text("area_label").notNull(),
    kind: directoryEnquiryKind("kind").notNull(),
    name: text("name").notNull(),
    /** The enquirer's number; null once they have erased their data. */
    phone: text("phone"),
    message: text("message"),
    status: directoryEnquiryStatus("status").notNull().default("new"),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    handledByUserId: text("handled_by_user_id").references(() => users.id),
    /** When the enquirer erased their name, number and message; null otherwise. */
    erasedAt: timestamp("erased_at", { withTimezone: true }),
    /**
     * When the business's owner marked this enquiry as replied on their Leads page; null while it is still new to them.
     * Not `status`/`handledAt`: those are Brandbasket staff passing a top-list request on, and say nothing about the owner.
     */
    ownerRepliedAt: timestamp("owner_replied_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // The staff console's New / Handled lists, newest first.
    index("directory_enquiries_status_created_at_idx").on(table.status, table.createdAt),
    // A business's enquiries, for its owner's Listing page.
    index("directory_enquiries_place_id_idx").on(table.placeId),
    check(
      "directory_enquiries_listing_key_check",
      sql`${table.listingKey} is null or (char_length(${table.listingKey}) <= 200 and ${table.listingKey} ~ ${sql.raw(`'${LISTING_KEY_REGEX}'`)})`,
    ),
    check(
      "directory_enquiries_business_name_check",
      sql`${table.businessName} is null or char_length(${table.businessName}) between 1 and 200`,
    ),
    // An enquiry about one business names it, by place or listing key; a top-list request is about a service and an
    // area, never a listing.
    check(
      "directory_enquiries_kind_check",
      sql`(${table.kind} = 'business' and (${table.listingKey} is not null or ${table.placeId} is not null) and ${table.businessName} is not null) or (${table.kind} = 'top_list' and ${table.listingKey} is null and ${table.placeId} is null and ${table.businessName} is null)`,
    ),
    check("directory_enquiries_service_label_check", sql`char_length(${table.serviceLabel}) between 1 and 120`),
    check("directory_enquiries_area_label_check", sql`char_length(${table.areaLabel}) between 1 and 120`),
    check("directory_enquiries_name_check", sql`char_length(${table.name}) between 1 and 60`),
    check("directory_enquiries_phone_check", sql`${table.phone} is null or ${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    // An enquiry has a number unless its sender erased it.
    check("directory_enquiries_erased_check", sql`${table.phone} is not null or ${table.erasedAt} is not null`),
    check(
      "directory_enquiries_message_check",
      sql`${table.message} is null or char_length(${table.message}) between 1 and 500`,
    ),
    check(
      "directory_enquiries_handled_check",
      sql`(${table.status} = 'handled' and ${table.handledAt} is not null) or (${table.status} = 'new' and ${table.handledAt} is null and ${table.handledByUserId} is null)`,
    ),
  ],
);

/**
 * A directory business Brandbasket has verified: staff confirmed its name, address and phone number (by calling it, or
 * because it is a client). The website shows a Verified tag for these, and a verified business is the only kind whose
 * phone number reaches the site; `phone` is null when the business asked for its number not to be shown. One row per
 * business: per place, or per listing key for a key no place has. Staff always verify at a listing key (the console's
 * page address, or the key of the claim they approve), so the key stays the primary key until the contract step.
 * Removing a verification deletes the row: this is staff data about a business, not a customer's history, so nothing
 * is lost that anyone else relies on.
 */
export const directoryVerifications = pgTable(
  "directory_verifications",
  {
    listingKey: text("listing_key").primaryKey(),
    placeId: text("place_id").references(() => directoryPlaces.id),
    businessName: text("business_name").notNull(),
    phone: text("phone"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    verifiedByUserId: text("verified_by_user_id")
      .notNull()
      .references(() => users.id),
    /**
     * Staff granted the Trusted tag by hand. The website also shows Trusted for a verified business whose owner lists a
     * licence (an earned route); this flag is the direct route and needs no licence. It only means anything while the
     * row exists, so removing the verification takes the tag with it.
     */
    trusted: boolean("trusted").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (table) => [
    // The staff console's list, newest first.
    index("directory_verifications_verified_at_idx").on(table.verifiedAt),
    // One verification per business, by id as by key.
    uniqueIndex("directory_verifications_place_id_idx").on(table.placeId).where(sql`${table.placeId} is not null`),
    check(
      "directory_verifications_listing_key_check",
      sql`char_length(${table.listingKey}) <= 200 and ${table.listingKey} ~ ${sql.raw(`'${LISTING_KEY_REGEX}'`)}`,
    ),
    check("directory_verifications_business_name_check", sql`char_length(${table.businessName}) between 1 and 200`),
    check("directory_verifications_phone_check", sql`${table.phone} is null or ${table.phone} ~ '^\\+[0-9]{8,15}$'`),
  ],
);

/**
 * What a visitor did on a directory business: a page view or a contact tap (both feed the Trending tag), or a share of
 * its profile (counted for the ranking, never for Trending). Must match DIRECTORY_EVENT_KINDS in
 * apps/platform/lib/directory-api.ts (apps/platform/lib/directory-parity.test.ts checks).
 */
export const DIRECTORY_EVENT_KINDS = ["view", "call", "whatsapp", "enquire", "directions", "website", "share"] as const;
export const directoryEventKind = pgEnum("directory_event_kind", DIRECTORY_EVENT_KINDS);
export type DirectoryEventKind = (typeof DIRECTORY_EVENT_KINDS)[number];

/**
 * How many visitors did each thing on each directory business each day (an Asia/Kolkata calendar day), for the
 * Trending tag. Only these aggregate counts are stored: no address, no user agent, nothing about any one visitor.
 * The platform counts a visitor once per business, kind and day with a hashed rate-limit key, then forgets them.
 * Rows older than 60 days are purged (purgeOldDirectoryDailyCounts): Trending only ever looks back 14. Share rows are
 * the exception: the ranking counts every share a profile ever had, so they are kept.
 */
export const directoryDailyCounts = pgTable(
  "directory_daily_counts",
  {
    /** The key a counter of a key no place has is kept under; null on a place's counter, which every key of it shares. */
    listingKey: text("listing_key"),
    placeId: text("place_id").references(() => directoryPlaces.id),
    day: date("day", { mode: "string" }).notNull(),
    kind: directoryEventKind("kind").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [
    // One counter per listing key, day and kind: the conflict target of a count for a key no place has. Was the
    // primary key until 0078; a count by place id has no key, so it cannot be one any more.
    unique("directory_daily_counts_listing_key_day_kind_key").on(table.listingKey, table.day, table.kind),
    // The place's own counter: the conflict target of a count for a business with a place.
    uniqueIndex("directory_daily_counts_place_day_kind_idx")
      .on(table.placeId, table.day, table.kind)
      .where(sql`${table.placeId} is not null`),
    // The purge's range scan.
    index("directory_daily_counts_day_idx").on(table.day),
    check(
      "directory_daily_counts_listing_key_check",
      sql`char_length(${table.listingKey}) <= 200 and ${table.listingKey} ~ ${sql.raw(`'${LISTING_KEY_REGEX}'`)}`,
    ),
    check("directory_daily_counts_business_check", sql`${table.listingKey} is not null or ${table.placeId} is not null`),
    check("directory_daily_counts_count_check", sql`${table.count} >= 0`),
  ],
);
