import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";

/**
 * India Post's PIN code directory, one row per PIN (src/india-post.ts): which state and district a business is in, and
 * the post-office localities the owner picks from. Reference data, the same for everyone: the import writes it, the
 * platform only reads it.
 */
export const indiaPincodes = pgTable(
  "india_pincodes",
  {
    pincode: text("pincode").primaryKey(),
    stateCode: text("state_code").notNull(),
    districtSlug: text("district_slug").notNull(),
    districtName: text("district_name").notNull(),
    /** [{ slug, name }], A to Z, never empty. */
    localities: jsonb("localities").$type<readonly { readonly slug: string; readonly name: string }[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("india_pincodes_pincode_check", sql`${table.pincode} ~ '^[1-9][0-9]{5}$'`),
    check("india_pincodes_state_code_check", sql`${table.stateCode} ~ '^[a-z]{2}$'`),
    check("india_pincodes_district_slug_check", sql`${table.districtSlug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("india_pincodes_localities_check", sql`jsonb_typeof(${table.localities}) = 'array' and jsonb_array_length(${table.localities}) > 0`),
  ],
);
