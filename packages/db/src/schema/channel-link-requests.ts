import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/** The networks that ask for a link to the customer's profile while their own Allow button is not approved for us yet. */
export const CHANNEL_LINK_NETWORKS = ["instagram", "facebook"] as const;
export type ChannelLinkNetwork = (typeof CHANNEL_LINK_NETWORKS)[number];

/**
 * Where a request stands: waiting for the team, the team added the customer as a tester (she accepts and presses Allow), the team could
 * not set the account up, or the account is connected.
 */
export const CHANNEL_LINK_STATES = ["requested", "invited", "refused", "connected"] as const;
export type ChannelLinkState = (typeof CHANNEL_LINK_STATES)[number];

const list = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(", ");

/**
 * The profile link a customer sent for Instagram or Facebook so our team can set the account up with her. One per brand and network: a new
 * link replaces the one that is waiting. The customer role adds a request and changes or takes back one that has not been answered; the team
 * answers it (invited, refused with a reason, connected) on the staff connection. See migration 0229.
 */
export const channelLinkRequests = pgTable(
  "channel_link_requests",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    /** The posting service's name for the brand (a workspace), so a business with several brands keeps one request each. */
    brandId: text("brand_id").notNull(),
    network: text("network").$type<ChannelLinkNetwork>().notNull(),
    /** The profile address, cleaned of tracking and a trailing slash. */
    url: text("url").notNull(),
    /** The account name read from the link, for example `acme_foods`. */
    handle: text("handle").notNull(),
    state: text("state").$type<ChannelLinkState>().notNull().default("requested"),
    /** Why the team could not set it up, in words for the customer. Only with `refused`. */
    reason: text("reason"),
    requestedByUserId: text("requested_by_user_id").references(() => users.id),
    /** When the team was told by email about this link; null until it was sent. */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    answeredByStaffId: text("answered_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("channel_link_requests_brand_network_idx").on(table.businessId, table.brandId, table.network),
    check("channel_link_requests_network_check", sql`${table.network} in (${sql.raw(list(CHANNEL_LINK_NETWORKS))})`),
    check("channel_link_requests_state_check", sql`${table.state} in (${sql.raw(list(CHANNEL_LINK_STATES))})`),
    check("channel_link_requests_url_check", sql`char_length(${table.url}) between 8 and 300 and ${table.url} ~ '^https://'`),
    check("channel_link_requests_handle_check", sql`char_length(btrim(${table.handle})) between 1 and 120`),
    check("channel_link_requests_reason_check", sql`${table.reason} is null or (${table.state} = 'refused' and char_length(btrim(${table.reason})) between 3 and 400)`),
  ],
);
export type ChannelLinkRequest = typeof channelLinkRequests.$inferSelect;
