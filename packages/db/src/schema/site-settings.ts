import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { updatedAt } from "./columns";

/**
 * Settings staff change from the console without a deploy, one row per setting (docs/superpowers/specs/2026-10-15-setup-call-
 * link.md). The key names the setting and the value is its text; a setting with no row is not set. Staff connection only.
 */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  /** Who last changed it, so whoever picks the setting up later can see who to ask. Null if that account was removed. */
  updatedByStaffId: text("updated_by_staff_id").references(() => users.id),
  updatedAt: updatedAt(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
