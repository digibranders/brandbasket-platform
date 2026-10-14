import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";

/**
 * Better Auth core tables. Property names must match Better Auth's field names; column names are snake_case.
 * The adapter is configured with usePlural, so the model "user" maps to the export `users`.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /**
     * Every account has one, because Better Auth signs in and looks accounts up by it. An account opened with a phone
     * number has no real address: it holds a placeholder made from the number (see phoneAccountEmail), which is
     * never written to.
     */
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    /**
     * The number a free listing owner signs in with, E.164. Ours, not Better Auth's: declared to it as an additional
     * field (packages/auth) so it is set when the account is created and read back with the session.
     */
    phoneNumber: text("phone_number").unique(),
    /** The owner entered the code we texted to `phoneNumber`. Only a verified number signs in or resets a password. */
    phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("users_phone_number_check", sql`${table.phoneNumber} is null or ${table.phoneNumber} ~ '^\\+[0-9]{8,15}$'`),
    check("users_phone_number_verified_check", sql`${table.phoneNumber} is not null or not ${table.phoneNumberVerified}`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);
