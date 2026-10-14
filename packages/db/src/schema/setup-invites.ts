import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt } from "./columns";
import { leads } from "./leads";
import { staffMembers } from "./staff";

/**
 * A one-time link that lets exactly one person create exactly one account. Only the SHA-256 hash of the token is
 * stored, so a database copy cannot be used to redeem invites.
 */
export const setupInvites = pgTable(
  "setup_invites",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    email: text("email").notNull(),
    businessName: text("business_name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByStaffId: text("created_by_staff_id")
      .notNull()
      .references(() => staffMembers.userId),
    businessId: uuid("business_id").references(() => businesses.id),
    createdAt: createdAt(),
  },
  (table) => [index("setup_invites_lead_id_idx").on(table.leadId)],
);
