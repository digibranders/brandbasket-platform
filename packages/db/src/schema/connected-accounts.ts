import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/** The networks a post goes out on (deliverables.channel). */
export const POST_CHANNELS = ["facebook", "instagram", "google_business", "youtube", "linkedin", "x"] as const;
export type PostChannel = (typeof POST_CHANNELS)[number];

/** The accounts we look after: every post channel, plus WhatsApp Business, which the Social & Ads mock lists too. */
export const CONNECTED_PLATFORMS = [...POST_CHANNELS, "whatsapp_business"] as const;
export type ConnectedPlatform = (typeof CONNECTED_PLATFORMS)[number];

export const CONNECTED_ACCOUNT_STATUSES = ["connected", "needs_attention", "not_connected"] as const;
export type ConnectedAccountStatus = (typeof CONNECTED_ACCOUNT_STATUSES)[number];

/**
 * One of the customer's social or search accounts and whether we can post to it. Staff maintain it by hand until the
 * platform APIs are approved (plan 61, gate G5); the customer reads their own.
 */
export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    platform: text("platform").$type<ConnectedPlatform>().notNull(),
    /** "@apexdiagnostics", or the page's name. */
    handle: text("handle"),
    url: text("url"),
    status: text("status").$type<ConnectedAccountStatus>().notNull().default("not_connected"),
    /** When staff last checked it. Null until the first check. */
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("connected_accounts_business_platform_idx").on(table.businessId, table.platform),
    index("connected_accounts_status_idx").on(table.status),
    check(
      "connected_accounts_platform_check",
      sql`${table.platform} in ('facebook', 'instagram', 'google_business', 'youtube', 'linkedin', 'x', 'whatsapp_business')`,
    ),
    check("connected_accounts_status_check", sql`${table.status} in ('connected', 'needs_attention', 'not_connected')`),
    check("connected_accounts_handle_check", sql`${table.handle} is null or char_length(btrim(${table.handle})) between 1 and 120`),
    check("connected_accounts_url_check", sql`${table.url} is null or (char_length(${table.url}) <= 500 and ${table.url} ~ '^https://')`),
  ],
);
export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
