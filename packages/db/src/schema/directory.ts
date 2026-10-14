import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { directoryPlaces } from "./directory-places";

const SLUG = "^[a-z0-9]+(-[a-z0-9]+)*$";

/**
 * Where a client's Featured listing sits on Firstfold Local (firstfold.io/in): its address parts, map pin and the
 * links behind its buttons. Staff-owned: the customer role can read its own row and write nothing, because every
 * column here shapes the listing's web address or has been checked by staff (docs/superpowers/specs/
 * 2026-09-29-customer-listing-tab-design.md).
 */
export const directoryListings = pgTable(
  "directory_listings",
  {
    businessId: uuid("business_id")
      .primaryKey()
      .references(() => businesses.id),
    categorySlug: text("category_slug").notNull(),
    stateCode: text("state_code").notNull(),
    citySlug: text("city_slug").notNull(),
    areaSlug: text("area_slug").notNull(),
    slug: text("slug").notNull(),
    /**
     * The business's permanent directory_places id: a fresh one, or the open-data business this listing replaces
     * (the client takes over its id). Set by backfillDirectoryPlaces (0077); null for a listing made since it ran.
     */
    placeId: text("place_id").references(() => directoryPlaces.id),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    /** What the client sees for the pin, e.g. "Gokhale Road, near Thane station". */
    pinLabel: text("pin_label").notNull(),
    /** Null means WhatsApp goes to business_profiles.phone. */
    whatsappPhone: text("whatsapp_phone"),
    /** The client site's booking page, behind the Book button. */
    bookingUrl: text("booking_url"),
    /** The unconfirmed directory page this listing replaces, e.g. "/in/dentists/mh/thane/naupada/smile-dental". */
    replacesSourcePath: text("replaces_source_path"),
    /** Earlier addresses, oldest first; the directory redirects each to the current one. */
    previousPaths: text("previous_paths").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("directory_listings_address_key").on(
      table.categorySlug,
      table.stateCode,
      table.citySlug,
      table.areaSlug,
      table.slug,
    ),
    uniqueIndex("directory_listings_place_id_idx").on(table.placeId).where(sql`${table.placeId} is not null`),
    check("directory_listings_category_slug_check", sql`${table.categorySlug} ~ ${sql.raw(`'${SLUG}'`)}`),
    check("directory_listings_state_code_check", sql`${table.stateCode} ~ '^[a-z]{2}$'`),
    check("directory_listings_city_slug_check", sql`${table.citySlug} ~ ${sql.raw(`'${SLUG}'`)}`),
    check("directory_listings_area_slug_check", sql`${table.areaSlug} ~ ${sql.raw(`'${SLUG}'`)}`),
    check(
      "directory_listings_slug_check",
      sql`${table.slug} ~ ${sql.raw(`'${SLUG}'`)} and char_length(${table.slug}) <= 80`,
    ),
    check("directory_listings_pin_label_check", sql`char_length(${table.pinLabel}) between 1 and 120`),
    check(
      "directory_listings_whatsapp_phone_check",
      sql`${table.whatsappPhone} is null or ${table.whatsappPhone} ~ '^\\+[0-9]{8,15}$'`,
    ),
    check(
      "directory_listings_booking_url_check",
      sql`${table.bookingUrl} is null or ${table.bookingUrl} ~ '^https://'`,
    ),
    check(
      "directory_listings_replaces_source_path_check",
      sql`${table.replacesSourcePath} is null or ${table.replacesSourcePath} ~ '^/in/[a-z0-9/-]+$'`,
    ),
  ],
);

/**
 * What the client writes about their listing. Created by staff together with the placement row; the customer role
 * may only update it (column grant in 0053), never insert or delete.
 */
export const listingContent = pgTable(
  "listing_content",
  {
    businessId: uuid("business_id")
      .primaryKey()
      .references(() => directoryListings.businessId),
    about: text("about"),
    /** The tagline card on the business's page: one line, and the colour it is drawn in (LISTING_TAGLINE_COLOURS). */
    tagline: text("tagline"),
    taglineColour: text("tagline_colour").notNull().default("rose"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    showCall: boolean("show_call").notNull().default(true),
    showWhatsapp: boolean("show_whatsapp").notNull().default(true),
    showBook: boolean("show_book").notNull().default(false),
    showDirections: boolean("show_directions").notNull().default(true),
    showWebsite: boolean("show_website").notNull().default(true),
    visible: boolean("visible").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("listing_content_about_check", sql`${table.about} is null or char_length(${table.about}) between 1 and 160`),
    check("listing_content_about_single_line_check", sql`${table.about} is null or ${table.about} !~ '[\\r\\n]'`),
    check(
      "listing_content_tagline_check",
      sql`${table.tagline} is null or (char_length(${table.tagline}) between 1 and 80 and ${table.tagline} !~ '[\\r\\n]')`,
    ),
    check(
      "listing_content_tagline_colour_check",
      sql`${table.taglineColour} in ('rose', 'burgundy', 'sand', 'sage', 'sky', 'ink')`,
    ),
    check("listing_content_tags_check", sql`cardinality(${table.tags}) <= 8`),
  ],
);
