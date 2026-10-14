import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { createdAt, updatedAt } from "./columns";

const SLUG_REGEX = "^[a-z0-9]+(-[a-z0-9]+)*$";

/** live: its areas, category pages and ads are open. soon: shown as "Soon". off: not shown anywhere. */
export const geoDistrictStatus = pgEnum("geo_district_status", ["live", "soon", "off"]);
export type GeoDistrictStatus = (typeof geoDistrictStatus.enumValues)[number];

/** on: offered and shown. off: hidden from pickers and pages, but every business already in it keeps it. */
export const geoItemStatus = pgEnum("geo_item_status", ["on", "off"]);
export type GeoItemStatus = (typeof geoItemStatus.enumValues)[number];

/*
 * The places and categories the directory is built from: reference data that staff edit in the console (apps/admin
 * /geography) and the platform and the website read, replacing the fixed lists in places.json and the website's
 * content/local files. Nothing is ever deleted: a row is switched off. A slug is part of public URLs and permanent
 * business ids, so the database freezes it (slug_locked_at, set by a trigger the first time the row is switched on,
 * migration 0113) and refuses to change it afterwards.
 */

/** One district of a state: /in/<state>/<district>. */
export const geoDistricts = pgTable(
  "geo_districts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    stateCode: text("state_code").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: geoDistrictStatus("status").notNull().default("off"),
    slugLockedAt: timestamp("slug_locked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("geo_districts_state_slug_key").on(table.stateCode, table.slug),
    check("geo_districts_state_code_check", sql`${table.stateCode} ~ '^[a-z]{2}$'`),
    check("geo_districts_slug_check", sql`${table.slug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check("geo_districts_name_check", sql`char_length(${table.name}) between 1 and 80`),
  ],
);

/** One area of a district: /in/<state>/<district>/<area>. Area slugs are unique across the district. */
export const geoAreas = pgTable(
  "geo_areas",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    districtId: uuid("district_id")
      .notNull()
      .references(() => geoDistricts.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** The town the area belongs to. Internal only (listing keys, ad markets); it is never in an address. */
    citySlug: text("city_slug").notNull(),
    cityName: text("city_name").notNull(),
    /** The PIN codes the area covers. */
    pincodes: text("pincodes").array().notNull().default(sql`'{}'::text[]`),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    status: geoItemStatus("status").notNull().default("on"),
    slugLockedAt: timestamp("slug_locked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("geo_areas_district_slug_key").on(table.districtId, table.slug),
    index("geo_areas_district_id_idx").on(table.districtId),
    check("geo_areas_slug_check", sql`${table.slug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check("geo_areas_city_slug_check", sql`${table.citySlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check("geo_areas_name_check", sql`char_length(${table.name}) between 1 and 80 and char_length(${table.cityName}) between 1 and 80`),
    check(
      "geo_areas_pincodes_check",
      sql`array_to_string(${table.pincodes}, ',') ~ '^([1-9][0-9]{5}(,[1-9][0-9]{5})*)?$'`,
    ),
    check(
      "geo_areas_point_check",
      sql`(${table.lat} is null) = (${table.lon} is null) and (${table.lat} is null or (${table.lat} between -90 and 90 and ${table.lon} between -180 and 180))`,
    ),
  ],
);

/** A category a business may be listed in: /in/<state>/<district>/<area>/<category>. A sub-category names its parent. */
export const geoCategories = pgTable(
  "geo_categories",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    slug: text("slug").notNull().unique("geo_categories_slug_key"),
    /** Plural, as a heading and in lists: "Dentists". */
    label: text("label").notNull(),
    /** One of them: "Dentist". */
    singular: text("singular").notNull(),
    /** The slug of the category this is a sub-category of; null for a top-level one. */
    parentSlug: text("parent_slug"),
    /** Words and phrases that place a parent's business in this sub-category by its name. */
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    /** The id in the taxonomy sheet (02-001), for the seed's categories; null for one staff added. */
    taxonomyId: text("taxonomy_id"),
    /** Whether the category has its own page on the website, which also makes it an ad market. */
    hasPage: boolean("has_page").notNull().default(false),
    status: geoItemStatus("status").notNull().default("on"),
    slugLockedAt: timestamp("slug_locked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("geo_categories_parent_slug_idx").on(table.parentSlug),
    check("geo_categories_slug_check", sql`${table.slug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check("geo_categories_parent_check", sql`${table.parentSlug} is null or (${table.parentSlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)} and ${table.parentSlug} <> ${table.slug})`),
    check("geo_categories_label_check", sql`char_length(${table.label}) between 1 and 80 and char_length(${table.singular}) between 1 and 80`),
  ],
);

export type GeoDistrictRow = typeof geoDistricts.$inferSelect;
export type GeoAreaRow = typeof geoAreas.$inferSelect;
export type GeoCategoryRow = typeof geoCategories.$inferSelect;
