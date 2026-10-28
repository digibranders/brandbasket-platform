import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import type { HitChannel, HitDevice, HitKind } from "../site-hit-lists";
import { businesses } from "./businesses";
import { createdAt } from "./columns";

/**
 * The public key a customer's website puts in its tracking script, one per business. It only names the business: it
 * cannot read anything, so it is safe in a page's HTML (unlike the site token, which stays on the site's server).
 */
export const siteKeys = pgTable(
  "site_keys",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("site_keys_business_idx").on(table.businessId),
    uniqueIndex("site_keys_key_idx").on(table.key),
    check("site_keys_key_check", sql`${table.key} ~ '^bbk_[A-Za-z0-9]{16,40}$'`),
  ],
);
export type SiteKey = typeof siteKeys.$inferSelect;

/**
 * One thing a visitor did on a customer's website. Nothing here names a person: no address, no browser string, no
 * cookie, no form content, and the visitor hash changes every day and for every business. Rows are never updated; the
 * nightly roll-up reads them, and a retention job deletes them after 90 days.
 */
export const siteHits = pgTable(
  "site_hits",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    kind: text("kind").$type<HitKind>().notNull(),
    path: text("path").notNull(),
    referrerHost: text("referrer_host"),
    channel: text("channel").$type<HitChannel>().notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    device: text("device").$type<HitDevice>().notNull(),
    /** Two capital letters from the edge's country header, or null when there was none. */
    country: text("country"),
    /** A host, a file type or a custom event's name, depending on the kind. */
    label: text("label"),
    visitorHash: text("visitor_hash").notNull(),
    engagedMs: integer("engaged_ms"),
    scrollPct: integer("scroll_pct"),
  },
  (table) => [
    index("site_hits_business_at_idx").on(table.businessId, table.at),
    index("site_hits_at_idx").on(table.at),
    check("site_hits_kind_check", sql`${table.kind} in ('pageview', 'engagement', 'call', 'whatsapp', 'email', 'directions', 'social', 'outbound', 'download', 'form', 'custom')`),
    check("site_hits_channel_check", sql`${table.channel} in ('direct', 'search', 'social', 'email', 'ai', 'paid', 'referral')`),
    check("site_hits_device_check", sql`${table.device} in ('mobile', 'tablet', 'desktop')`),
    check("site_hits_path_check", sql`char_length(${table.path}) between 1 and 200 and ${table.path} like '/%'`),
    check("site_hits_referrer_check", sql`${table.referrerHost} is null or char_length(${table.referrerHost}) <= 100`),
    check(
      "site_hits_utm_check",
      sql`coalesce(char_length(${table.utmSource}), 0) <= 60 and coalesce(char_length(${table.utmMedium}), 0) <= 60 and coalesce(char_length(${table.utmCampaign}), 0) <= 60`,
    ),
    check("site_hits_country_check", sql`${table.country} is null or ${table.country} ~ '^[A-Z]{2}$'`),
    check("site_hits_label_check", sql`${table.label} is null or char_length(${table.label}) <= 100`),
    check("site_hits_visitor_check", sql`${table.visitorHash} ~ '^[0-9a-f]{32}$'`),
    check("site_hits_engaged_check", sql`${table.engagedMs} is null or ${table.engagedMs} between 0 and 1800000`),
    check("site_hits_scroll_check", sql`${table.scrollPct} is null or ${table.scrollPct} between 0 and 100`),
  ],
);
export type SiteHit = typeof siteHits.$inferSelect;

/** The random salt for one day's visitor hashes. Deleted after two days, which is what keeps a visitor from being followed across days. */
export const visitorSalts = pgTable(
  "visitor_salts",
  {
    day: date("day", { mode: "string" }).primaryKey(),
    salt: text("salt").notNull(),
    createdAt: createdAt(),
  },
  (table) => [check("visitor_salts_salt_check", sql`char_length(${table.salt}) >= 32`)],
);
export type VisitorSalt = typeof visitorSalts.$inferSelect;
