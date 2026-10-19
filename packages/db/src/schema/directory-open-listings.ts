import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";
import { directoryPlaces } from "./directory-places";

const SLUG_REGEX = "^[a-z0-9]+(-[a-z0-9]+)*$";
/** An ordinary Indian number in E.164, as the website shows it (lib/site-phones.ts there). */
const PHONE_REGEX = "^\\+91[1-9][0-9]{9}$";

/** Postgres's full-text document type; read-only here (a generated column). */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/** Which dataset a listing came from: OSM rows need the OpenStreetMap credit; "survey" is the Brandbasket team's own. */
export const openListingSource = pgEnum("directory_open_listing_source", ["osm", "overture", "survey"]);
export type OpenListingSource = (typeof openListingSource.enumValues)[number];

/**
 * One business the /in directory shows from the dataset build: the open data and the Brandbasket survey
 * (local-directory-data/thane, loaded by `pnpm directory:import-listings`). Platform businesses (clients, owner-added)
 * are not here; they come from their own tables through the feed. Keyed by the permanent place id, whose URL label
 * lives in directory_places.
 *
 * A business that leaves the dataset is hidden (hidden_at), never deleted: its id, reviews and old links stay valid.
 * The phone is the one the directory may show without the owner confirming it (website-listing lib/site-phones.ts):
 * found on the business's own website (phone_found_on is that page) or confirmed on a survey call ("call").
 * `search` is the Postgres full-text document for the state-wide search; nothing reads it yet. Staff-only (0090).
 */
export const directoryOpenListings = pgTable(
  "directory_open_listings",
  {
    placeId: text("place_id")
      .primaryKey()
      .references(() => directoryPlaces.id),
    name: text("name").notNull(),
    categorySlug: text("category_slug").notNull(),
    citySlug: text("city_slug").notNull(),
    areaSlug: text("area_slug").notNull(),
    address: text("address").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    website: text("website").notNull().default(""),
    source: openListingSource("source").notNull(),
    phone: text("phone"),
    phoneFoundOn: text("phone_found_on"),
    phoneCheckedOn: date("phone_checked_on", { mode: "string" }),
    phoneWhatsapp: boolean("phone_whatsapp").notNull().default(false),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', f_unaccent(coalesce(name, ''))), 'A') || setweight(to_tsvector('simple', replace(category_slug, '-', ' ')), 'B') || setweight(to_tsvector('simple', replace(area_slug || ' ' || city_slug, '-', ' ')), 'C')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("directory_open_listings_name_check", sql`char_length(${table.name}) between 1 and 200`),
    check("directory_open_listings_category_slug_check", sql`${table.categorySlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check("directory_open_listings_city_slug_check", sql`${table.citySlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check("directory_open_listings_area_slug_check", sql`${table.areaSlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check("directory_open_listings_point_check", sql`${table.lat} between -90 and 90 and ${table.lon} between -180 and 180`),
    check(
      "directory_open_listings_phone_check",
      sql`(${table.phone} is null and ${table.phoneFoundOn} is null and ${table.phoneCheckedOn} is null)
        or (${table.phone} ~ ${sql.raw(`'${PHONE_REGEX}'`)} and ${table.phoneCheckedOn} is not null
          and (${table.phoneFoundOn} = 'call' or ${table.phoneFoundOn} ~ '^https?://'))`,
    ),
    // Area and category pages.
    index("directory_open_listings_city_area_category_idx").on(table.citySlug, table.areaSlug, table.categorySlug),
    // Full-text and typo search (state-wide plan).
    index("directory_open_listings_search_idx").using("gin", table.search),
    index("directory_open_listings_name_trgm_idx").using("gin", sql`lower(f_unaccent(${table.name})) gin_trgm_ops`),
  ],
);
