import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { createdAt, updatedAt } from "./columns";

export const GOOGLE_CONNECTION_PURPOSES = ["read", "write"] as const;
export type GoogleConnectionPurpose = (typeof GOOGLE_CONNECTION_PURPOSES)[number];
export const GOOGLE_CONNECTION_STATUSES = ["connected", "access_lost"] as const;
export type GoogleConnectionStatus = (typeof GOOGLE_CONNECTION_STATUSES)[number];

/**
 * The Brandbasket Google account's sign-ins (plan 62). One row per account slot and purpose: `read` is the read only token
 * the nightly job uses, `write` is the token used only when a site goes live. The refresh token is sealed with the auth
 * secret before it is stored. Staff connection only: no customer or public role has a grant, so no policy exists for them.
 */
export const googleConnections = pgTable(
  "google_connections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    slot: integer("slot").notNull().default(1),
    purpose: text("purpose").$type<GoogleConnectionPurpose>().notNull(),
    accountEmail: text("account_email").notNull(),
    scopes: text("scopes").array().notNull(),
    sealedRefreshToken: text("sealed_refresh_token").notNull(),
    status: text("status").$type<GoogleConnectionStatus>().notNull().default("connected"),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
    lastError: text("last_error"),
    connectedByStaffId: text("connected_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("google_connections_slot_purpose_idx").on(table.slot, table.purpose),
    check("google_connections_purpose_check", sql`${table.purpose} in ('read', 'write')`),
    check("google_connections_status_check", sql`${table.status} in ('connected', 'access_lost')`),
    check("google_connections_slot_check", sql`${table.slot} >= 1`),
    check("google_connections_error_check", sql`${table.lastError} is null or char_length(${table.lastError}) <= 300`),
  ],
);
export type GoogleConnectionRow = typeof googleConnections.$inferSelect;
