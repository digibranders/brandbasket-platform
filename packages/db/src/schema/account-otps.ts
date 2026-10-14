import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { createdAt } from "./columns";

/**
 * `signup`: proving a number before a free listing account is opened with it. `password_reset`: choosing a new
 * password. `verify_business`: an owner proving the business's number, so it is marked Verified.
 */
export const ACCOUNT_OTP_PURPOSES = ["signup", "password_reset", "verify_business"] as const;
export const accountOtpPurpose = pgEnum("account_otp_purpose", ACCOUNT_OTP_PURPOSES);
export type AccountOtpPurpose = (typeof ACCOUNT_OTP_PURPOSES)[number];

/**
 * A code sent to a phone number (texted) or an email address (emailed) for an account: to open one, or to get back into
 * one. A row has exactly one of the two. Same rules as booking_otps
 * and directory_review_otps: 6 digits, HMAC-hashed and salted with the row's id, 10 minutes, 5 attempts, deleted the
 * moment it is used, and purged an hour after it runs out. It holds the number or the address only: the name and
 * password typed at sign-up stay in the browser until the code is confirmed, so no password ever waits here. Only a
 * `signup` code is ever addressed to an email (the Fynix sign-up, migration 0163); a password reset by email is a link.
 */
export const accountOtps = pgTable(
  "account_otps",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    purpose: accountOtpPurpose("purpose").notNull(),
    /** E.164, for a code that was texted; null for one that was emailed. */
    phone: text("phone"),
    /** Trimmed and lowercased, for a code that was emailed; null for one that was texted. */
    email: text("email"),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    // The purge's range scan.
    index("account_otps_expires_at_idx").on(table.expiresAt),
    check("account_otps_phone_check", sql`${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    check("account_otps_email_check", sql`${table.email} ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length(${table.email}) <= 254`),
    check("account_otps_contact_check", sql`(${table.phone} IS NULL) <> (${table.email} IS NULL)`),
    check("account_otps_code_hash_check", sql`char_length(${table.codeHash}) > 0`),
    check("account_otps_attempts_check", sql`${table.attempts} >= 0`),
  ],
);
