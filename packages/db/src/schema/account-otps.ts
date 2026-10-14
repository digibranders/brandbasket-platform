import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { createdAt } from "./columns";

/** `signup`: proving an email address before an account is opened with it. A password reset is a link, never a code. */
export const ACCOUNT_OTP_PURPOSES = ["signup"] as const;
export const accountOtpPurpose = pgEnum("account_otp_purpose", ACCOUNT_OTP_PURPOSES);
export type AccountOtpPurpose = (typeof ACCOUNT_OTP_PURPOSES)[number];

/**
 * A code emailed to an address to open an account with it. Same rules as booking_otps: 6 digits, HMAC-hashed and salted
 * with the row's id, 10 minutes, 5 attempts, deleted the moment it is used, and purged an hour after it runs out. It
 * holds the address only: the name and password typed at sign-up stay in the browser until the code is confirmed, so no
 * password ever waits here.
 */
export const accountOtps = pgTable(
  "account_otps",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    purpose: accountOtpPurpose("purpose").notNull(),
    /** Trimmed and lowercased: where the code was emailed. */
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    // The purge's range scan.
    index("account_otps_expires_at_idx").on(table.expiresAt),
    check("account_otps_email_check", sql`${table.email} ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length(${table.email}) <= 254`),
    check("account_otps_code_hash_check", sql`char_length(${table.codeHash}) > 0`),
    check("account_otps_attempts_check", sql`${table.attempts} >= 0`),
  ],
);
