import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { updatedAt } from "./columns";

/**
 * What a signed-in owner has chosen about their own data. Today that is one thing: the person they name to use their rights
 * for them if they die or cannot act (DPDP Act s.14), with a mobile number to reach that person. A row exists only while a nominee is
 * named; clearing the nominee deletes it. One row per user, read and written by that user alone (row-level security on the
 * customer connection), and read by staff when a nominee comes forward.
 *
 * The nominee is someone else's personal data, given to us by the owner for this purpose only, so the row is erased with the
 * account (see queries/account-erasure.ts).
 */
export const userPrivacySettings = pgTable(
  "user_privacy_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    nomineeName: text("nominee_name").notNull(),
    /** The nominee's mobile number, E.164: how to reach them. Firstfold holds no email addresses, so a number is the only contact. */
    nomineePhone: text("nominee_phone").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("user_privacy_settings_name_check", sql`char_length(${table.nomineeName}) between 1 and 120`),
    check("user_privacy_settings_phone_check", sql`${table.nomineePhone} ~ '^\\+[0-9]{8,15}$'`),
  ],
);
export type UserPrivacySettings = typeof userPrivacySettings.$inferSelect;
