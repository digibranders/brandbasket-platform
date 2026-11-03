import { sql } from "drizzle-orm";
import { check, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { createdAt } from "./columns";

/**
 * The pages of the customer's website, as its sitemap lists them. The nightly sync (syncWebsitePages) upserts what
 * the sitemap names and removes what it no longer names; the customer reads their own. `title` stays null until a
 * source for it exists: a sitemap has none.
 */
export const websitePages = pgTable(
  "website_pages",
  {
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    url: text("url").notNull(),
    title: text("title"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.businessId, table.url] }),
    check("website_pages_url_check", sql`char_length(${table.url}) <= 2000 and ${table.url} ~ '^https?://'`),
    check("website_pages_title_check", sql`${table.title} is null or char_length(${table.title}) <= 300`),
  ],
);
export type WebsitePage = typeof websitePages.$inferSelect;
