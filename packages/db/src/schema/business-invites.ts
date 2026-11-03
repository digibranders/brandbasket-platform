import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses, businessMemberRole } from "./businesses";
import { createdAt } from "./columns";

/**
 * An owner's invitation for someone to join their business as an editor or a viewer. The link carries a token; only
 * its SHA-256 hash is stored (hashInviteToken). Owners create and revoke their own business's invites through
 * row-level security; accepting adds the business_members row, which only the staff connection may write.
 */
export const businessInvites = pgTable(
  "business_invites",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    /** Stored lower case, so one address has one open invite. */
    email: text("email").notNull(),
    role: businessMemberRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("business_invites_business_idx").on(table.businessId, table.createdAt),
    uniqueIndex("business_invites_one_open_idx")
      .on(table.businessId, table.email)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    check("business_invites_role_check", sql`${table.role} in ('editor', 'viewer')`),
    check(
      "business_invites_email_check",
      sql`char_length(${table.email}) <= 320 and ${table.email} = lower(btrim(${table.email})) and ${table.email} ~ '^[^@[:space:]]+@[^@[:space:]]+$'`,
    ),
    check("business_invites_closed_check", sql`${table.acceptedAt} is null or ${table.revokedAt} is null`),
    check("business_invites_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);
export type BusinessInvite = typeof businessInvites.$inferSelect;
