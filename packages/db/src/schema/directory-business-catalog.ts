import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/*
 * What a free listing account's business sells, from the Services and Products tabs of its Business profile: the
 * things it does and the things it stocks (and, from the FAQ tab, the questions its customers ask), each with the details the sheet lists (name, description, price, and a
 * service's duration and area or a product's category and availability).
 *
 * The customer reads its own rows through row-level security and writes nothing directly: every write runs on the
 * staff connection after the platform has checked who is asking, like the profile row (see 0081).
 */

/** The most services, and the most products, one business lists. */
export const BUSINESS_CATALOG_MAX_ITEMS = 40;
export const BUSINESS_ITEM_NAME_MAX_LENGTH = 80;
export const BUSINESS_ITEM_DESCRIPTION_MAX_LENGTH = 300;
/** A service's description is the long one the popup shows (added 2026-10-10); a product's stays short. */
export const BUSINESS_SERVICE_DESCRIPTION_MAX_LENGTH = 2000;
/** The one line under a service's name in the list (added 2026-10-10). */
export const BUSINESS_SERVICE_SUMMARY_MAX_LENGTH = 120;
export const BUSINESS_ITEM_CATEGORY_MAX_LENGTH = 60;
export const BUSINESS_ITEM_AREA_MAX_LENGTH = 120;
/** The most questions one business answers on its FAQ tab, and how long each question and answer may be. */
export const BUSINESS_FAQ_MAX_ITEMS = 20;
export const BUSINESS_FAQ_QUESTION_MAX_LENGTH = 150;
export const BUSINESS_FAQ_ANSWER_MAX_LENGTH = 600;
/** The highest price kept, in whole rupees. */
export const BUSINESS_ITEM_PRICE_MAX_INR = 10_000_000;

/** Whether a product can be had now. */
export const BUSINESS_PRODUCT_AVAILABILITY = ["in_stock", "out_of_stock", "made_to_order"] as const;
export type BusinessProductAvailability = (typeof BUSINESS_PRODUCT_AVAILABILITY)[number];

/** A single line of plain text, trimmed, within `max` characters; the shape every catalogue text column holds. */
function line(column: string, max: number): string {
  return `char_length("${column}") between 1 and ${String(max)} and "${column}" = btrim("${column}") and "${column}" !~ '[\\r\\n]'`;
}

export const directoryBusinessServices = pgTable(
  "directory_business_services",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    /** The group the service sits under on the page: "Cleaning", "Root canal". */
    category: text("category").notNull(),
    name: text("name").notNull(),
    /** One line under the name in the list; null shows none. */
    summary: text("summary"),
    /** The long explanation the popup shows. */
    description: text("description"),
    /** The price in whole rupees; null when it is on request. */
    priceInr: integer("price_inr"),
    durationMinutes: smallint("duration_minutes"),
    /** Where this service is offered, when it differs from the business's own area. */
    serviceArea: text("service_area"),
    /** The order the owner put them in, from 0. */
    position: smallint("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("directory_business_services_business_id_idx").on(table.businessId, table.position),
    check("directory_business_services_category_check", sql.raw(line("category", BUSINESS_ITEM_CATEGORY_MAX_LENGTH))),
    check("directory_business_services_name_check", sql.raw(line("name", BUSINESS_ITEM_NAME_MAX_LENGTH))),
    check(
      "directory_business_services_description_check",
      sql`${table.description} is null or (char_length(${table.description}) between 1 and ${sql.raw(String(BUSINESS_SERVICE_DESCRIPTION_MAX_LENGTH))} and ${table.description} = btrim(${table.description}))`,
    ),
    check(
      "directory_business_services_summary_check",
      sql`${table.summary} is null or (char_length(${table.summary}) between 1 and ${sql.raw(String(BUSINESS_SERVICE_SUMMARY_MAX_LENGTH))} and ${table.summary} = btrim(${table.summary}) and ${table.summary} !~ '[\\r\\n]')`,
    ),
    check(
      "directory_business_services_price_check",
      sql`${table.priceInr} is null or ${table.priceInr} between 0 and ${sql.raw(String(BUSINESS_ITEM_PRICE_MAX_INR))}`,
    ),
    check("directory_business_services_duration_check", sql`${table.durationMinutes} is null or ${table.durationMinutes} between 1 and 1440`),
    check(
      "directory_business_services_area_check",
      sql`${table.serviceArea} is null or (char_length(${table.serviceArea}) between 1 and ${sql.raw(String(BUSINESS_ITEM_AREA_MAX_LENGTH))} and ${table.serviceArea} = btrim(${table.serviceArea}) and ${table.serviceArea} !~ '[\\r\\n]')`,
    ),
    check("directory_business_services_position_check", sql`${table.position} between 0 and ${sql.raw(String(BUSINESS_CATALOG_MAX_ITEMS))}`),
  ],
);

export const directoryBusinessProducts = pgTable(
  "directory_business_products",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    description: text("description"),
    /** The price in whole rupees; null when it is on request. */
    priceInr: integer("price_inr"),
    /** The group the product sits under on the page: "Toothbrushes", "Sofas". */
    category: text("category"),
    availability: text("availability").notNull().default("in_stock"),
    /**
     * The product's own photo, added from its edit sheet (docs/superpowers/specs/2026-10-12-product-photos-design.md): all six
     * columns are set together or none are. The file lives in media storage at `t/{businessId}/{photoId}/display`; a new photo
     * gets a new id, so the website can cache a photo's address for good. It goes live at once, like a gallery photo.
     */
    photoId: uuid("photo_id"),
    photoMime: text("photo_mime"),
    photoBytes: integer("photo_bytes"),
    photoWidth: integer("photo_width"),
    photoHeight: integer("photo_height"),
    photoSha256: text("photo_sha256"),
    position: smallint("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("directory_business_products_business_id_idx").on(table.businessId, table.position),
    uniqueIndex("directory_business_products_photo_id_idx")
      .on(table.photoId)
      .where(sql`${table.photoId} is not null`),
    check(
      "directory_business_products_photo_check",
      sql`(${table.photoId} is null and ${table.photoMime} is null and ${table.photoBytes} is null and ${table.photoWidth} is null and ${table.photoHeight} is null and ${table.photoSha256} is null) or (${table.photoId} is not null and ${table.photoMime} is not null and ${table.photoBytes} > 0 and ${table.photoWidth} > 0 and ${table.photoHeight} > 0 and ${table.photoSha256} is not null)`,
    ),
    check("directory_business_products_name_check", sql.raw(line("name", BUSINESS_ITEM_NAME_MAX_LENGTH))),
    check(
      "directory_business_products_description_check",
      sql`${table.description} is null or (char_length(${table.description}) between 1 and ${sql.raw(String(BUSINESS_ITEM_DESCRIPTION_MAX_LENGTH))} and ${table.description} = btrim(${table.description}))`,
    ),
    check(
      "directory_business_products_price_check",
      sql`${table.priceInr} is null or ${table.priceInr} between 0 and ${sql.raw(String(BUSINESS_ITEM_PRICE_MAX_INR))}`,
    ),
    check(
      "directory_business_products_category_check",
      sql`${table.category} is null or (char_length(${table.category}) between 1 and ${sql.raw(String(BUSINESS_ITEM_CATEGORY_MAX_LENGTH))} and ${table.category} = btrim(${table.category}) and ${table.category} !~ '[\\r\\n]')`,
    ),
    check("directory_business_products_availability_check", sql`${table.availability} in ('in_stock', 'out_of_stock', 'made_to_order')`),
    check("directory_business_products_position_check", sql`${table.position} between 0 and ${sql.raw(String(BUSINESS_CATALOG_MAX_ITEMS))}`),
  ],
);

export const directoryBusinessFaqs = pgTable(
  "directory_business_faqs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    /** The order the owner put them in, from 0. */
    position: smallint("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("directory_business_faqs_business_id_idx").on(table.businessId, table.position),
    check("directory_business_faqs_question_check", sql.raw(line("question", BUSINESS_FAQ_QUESTION_MAX_LENGTH))),
    check(
      "directory_business_faqs_answer_check",
      sql`char_length(${table.answer}) between 1 and ${sql.raw(String(BUSINESS_FAQ_ANSWER_MAX_LENGTH))} and ${table.answer} = btrim(${table.answer})`,
    ),
    check("directory_business_faqs_position_check", sql`${table.position} between 0 and ${sql.raw(String(BUSINESS_FAQ_MAX_ITEMS))}`),
  ],
);
