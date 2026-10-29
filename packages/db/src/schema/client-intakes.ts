import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/**
 * What a customer told us in the short questions between creating an account and paying: one row per business. The
 * services were already chosen on the website, so this is not a recommendation: it tells the team what the business is
 * so the kickoff call starts with context. The values are slugs the app's question rules define
 * (apps/platform/lib/intake); the database only bounds their size, so wording and options can change without a
 * migration. `asked_for_services` is the basket the questions were asked for, never what the customer owns: billing and
 * navigation read the bundled add-ons. A null column is a question not answered, which is allowed (Skip for now).
 */
export const clientIntakes = pgTable(
  "client_intakes",
  {
    businessId: uuid("business_id")
      .primaryKey()
      .references(() => businesses.id),
    /** Which version of the question rules the answers belong to. */
    schemaVersion: integer("schema_version").notNull().default(1),
    askedForServices: text("asked_for_services").array().$type<string[]>().notNull().default(sql`'{}'::text[]`),
    businessType: text("business_type"),
    businessSubtype: text("business_subtype"),
    primaryGoal: text("primary_goal"),
    websiteState: text("website_state"),
    existingWebsiteUrl: text("existing_website_url"),
    primaryAction: text("primary_action"),
    designDirection: text("design_direction"),
    socialChannels: text("social_channels").array().$type<string[]>().notNull().default(sql`'{}'::text[]`),
    searchScope: text("search_scope"),
    /** When the customer pressed Continue to checkout, with every question answered or skipped. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("client_intakes_services_check", sql`${table.askedForServices} <@ array['managed-website', 'digital-growth', 'local-seo-aeo']::text[]`),
    // The customer writes these columns, so the database keeps each one small whatever the app sends.
    check(
      "client_intakes_size_check",
      sql`coalesce(char_length(${table.businessType}), 0) <= 60 and coalesce(char_length(${table.businessSubtype}), 0) <= 60 and coalesce(char_length(${table.primaryGoal}), 0) <= 60
        and coalesce(char_length(${table.websiteState}), 0) <= 60 and coalesce(char_length(${table.primaryAction}), 0) <= 60 and coalesce(char_length(${table.designDirection}), 0) <= 60
        and coalesce(char_length(${table.searchScope}), 0) <= 60 and coalesce(char_length(${table.existingWebsiteUrl}), 0) <= 300
        and cardinality(${table.socialChannels}) <= 8 and cardinality(${table.askedForServices}) <= 3`,
    ),
  ],
);
export type ClientIntake = typeof clientIntakes.$inferSelect;
