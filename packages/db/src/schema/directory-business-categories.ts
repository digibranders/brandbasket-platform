import { sql } from "drizzle-orm";
import { check, pgTable, primaryKey, smallint, text, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { createdAt } from "./columns";

/*
 * The categories a business lists in besides its main one (the category in its listing key, which also fixes its
 * address). Up to BUSINESS_EXTRA_CATEGORIES_MAX of them: the business then also shows on those categories' list pages
 * in its area, and its leads are counted per category. The main category never appears here (the platform checks).
 *
 * Like the services and products tables, the customer reads its own rows through row-level security and writes
 * nothing directly: every write runs on the staff connection after the platform has checked who is asking.
 */

/** The most extra categories one business lists in. */
export const BUSINESS_EXTRA_CATEGORIES_MAX = 3;

export const directoryBusinessCategories = pgTable(
  "directory_business_categories",
  {
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    categorySlug: text("category_slug").notNull(),
    /** The order the owner put them in, from 0. */
    position: smallint("position").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.businessId, table.categorySlug] }),
    check(
      "directory_business_categories_slug_check",
      sql`char_length(${table.categorySlug}) between 1 and 100 and ${table.categorySlug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check(
      "directory_business_categories_position_check",
      sql`${table.position} between 0 and ${sql.raw(String(BUSINESS_EXTRA_CATEGORIES_MAX - 1))}`,
    ),
  ],
);
