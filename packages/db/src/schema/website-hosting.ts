import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/**
 * Where a client's website is hosted, so a lapsed plan can pause it there (docs/plans/57-site-lapse-hosting-enforcement.md).
 * One row per business, written by staff on the console and by the hourly sync. The customer's own database role has no
 * grant on it: a customer never sees or edits the project their site runs on.
 */
export const websiteHosting = pgTable(
  "website_hosting",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .unique()
      .references(() => businesses.id),
    /** The Vercel project id, `prj_...`. */
    vercelProjectId: text("vercel_project_id").notNull(),
    /** The Vercel team id, `team_...`; null when the project sits on the token's own account. */
    vercelTeamId: text("vercel_team_id"),
    /** When the sync paused the project. Null while the project is running. */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    /** The last time the sync looked at this site, whether or not it changed anything. */
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** What went wrong the last time the sync tried to pause or unpause it; null after a clean run. */
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "website_hosting_project_id_check",
      sql`${table.vercelProjectId} ~ '^prj_[A-Za-z0-9]+$' and char_length(${table.vercelProjectId}) <= 64`,
    ),
    check(
      "website_hosting_team_id_check",
      sql`${table.vercelTeamId} is null or (${table.vercelTeamId} ~ '^team_[A-Za-z0-9]+$' and char_length(${table.vercelTeamId}) <= 64)`,
    ),
    check("website_hosting_last_error_check", sql`${table.lastError} is null or char_length(${table.lastError}) <= 500`),
  ],
);

export type WebsiteHosting = typeof websiteHosting.$inferSelect;
