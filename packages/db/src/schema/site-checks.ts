import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";

/** up: the site answered below 400. down: it answered 400 or above, or could not be reached. error: our check itself failed. */
export const SITE_CHECK_STATUSES = ["up", "down", "error"] as const;
export type SiteCheckStatus = (typeof SITE_CHECK_STATUSES)[number];

/**
 * One check of a live customer website by the site health job (plan 61, Phase 12): whether it answered, how fast, when its
 * certificate ends, and once a day its phone speed from Google PageSpeed Insights. Written by the job on the staff connection;
 * the customer reads their own.
 */
export const siteChecks = pgTable(
  "site_checks",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    url: text("url").notNull(),
    status: text("status").$type<SiteCheckStatus>().notNull(),
    /** The HTTP status of the answer, null when there was none. */
    httpStatus: integer("http_status"),
    /** Time to the answer's headers, null when there was none. */
    responseMs: integer("response_ms"),
    sslExpiresAt: timestamp("ssl_expires_at", { withTimezone: true }),
    /** PageSpeed Insights mobile performance score, on the run that measured it (at most daily). */
    phoneSpeedScore: integer("phone_speed_score"),
    phoneLcpMs: integer("phone_lcp_ms"),
    /** What went wrong, for staff: the failed fetch, the failed certificate read or the failed speed check. */
    error: text("error"),
  },
  (table) => [
    index("site_checks_business_checked_idx").on(table.businessId, table.checkedAt),
    check("site_checks_status_check", sql`${table.status} in ('up', 'down', 'error')`),
    check("site_checks_url_check", sql`char_length(${table.url}) <= 2000 and ${table.url} ~ '^https://'`),
    check("site_checks_http_status_check", sql`${table.httpStatus} is null or ${table.httpStatus} between 100 and 599`),
    check("site_checks_response_ms_check", sql`${table.responseMs} is null or ${table.responseMs} >= 0`),
    check("site_checks_phone_speed_score_check", sql`${table.phoneSpeedScore} is null or ${table.phoneSpeedScore} between 0 and 100`),
    check("site_checks_phone_lcp_ms_check", sql`${table.phoneLcpMs} is null or ${table.phoneLcpMs} >= 0`),
    check("site_checks_error_check", sql`${table.error} is null or char_length(${table.error}) <= 1000`),
  ],
);
export type SiteCheck = typeof siteChecks.$inferSelect;
export type NewSiteCheck = typeof siteChecks.$inferInsert;
