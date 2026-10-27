import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { createdAt } from "./columns";
import { staffMembers, type StaffRole } from "./staff";

/**
 * A one-time link that lets one person join the console with one role. Only the SHA-256 hash of the token is stored,
 * so a copy of the database cannot be used to join. A new invite to the same address revokes the open one.
 */
export const staffInvites = pgTable(
  "staff_invites",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** Trimmed and lower case, as Better Auth stores addresses. */
    email: text("email").notNull(),
    role: text("role").$type<StaffRole>().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => staffMembers.userId),
    createdAt: createdAt(),
  },
  (table) => [
    index("staff_invites_email_idx").on(table.email),
    check("staff_invites_role_check", sql`${table.role} in ('support', 'finance', 'admin')`),
    check("staff_invites_email_check", sql`${table.email} = lower(btrim(${table.email})) and char_length(${table.email}) between 3 and 254`),
    check("staff_invites_used_once_check", sql`not (${table.acceptedAt} is not null and ${table.revokedAt} is not null)`),
  ],
);
