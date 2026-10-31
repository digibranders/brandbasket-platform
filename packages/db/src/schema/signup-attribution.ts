import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";

/** True when the column is null or at most `max` characters: the same caps the sign-up token holds the values to. */
const within = (column: AnyPgColumn, max: number): SQL => sql`(${column} is null or char_length(${column}) <= ${sql.raw(String(max))})`;

/**
 * The ad a business came from (plan 59), written once when its account is created from the ad landing page's sign-up link,
 * and never changed: the first ad wins. Staff only. The consent columns say what the visitor allowed when the browser ids
 * were read, which is what later decides where a payment may be reported.
 */
export const signupAttribution = pgTable(
  "signup_attribution",
  {
    businessId: uuid("business_id")
      .primaryKey()
      .references(() => businesses.id),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    gclid: text("gclid"),
    fbclid: text("fbclid"),
    fbp: text("fbp"),
    fbc: text("fbc"),
    gaClientId: text("ga_client_id"),
    gaSessionId: text("ga_session_id"),
    landingPath: text("landing_path"),
    referrerHost: text("referrer_host"),
    consentMeasurement: boolean("consent_measurement").notNull(),
    consentAdvertising: boolean("consent_advertising").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "signup_attribution_campaign_check",
      sql`${within(table.utmSource, 120)} and ${within(table.utmMedium, 120)} and ${within(table.utmCampaign, 120)} and ${within(table.utmTerm, 120)} and ${within(table.utmContent, 120)} and ${within(table.gclid, 120)} and ${within(table.fbclid, 120)}`,
    ),
    check(
      "signup_attribution_browser_check",
      sql`${within(table.fbp, 60)} and ${within(table.fbc, 120)} and ${within(table.gaClientId, 40)} and ${within(table.gaSessionId, 20)} and ${within(table.referrerHost, 100)}`,
    ),
    check("signup_attribution_path_check", sql`${table.landingPath} is null or (char_length(${table.landingPath}) between 1 and 200 and ${table.landingPath} like '/%')`),
  ],
);
export type SignupAttribution = typeof signupAttribution.$inferSelect;
