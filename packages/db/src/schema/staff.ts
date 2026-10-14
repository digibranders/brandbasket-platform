import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt } from "./columns";

/**
 * What a staff member may do in the console. `support` runs the day-to-day (leads, clients, support, the directory);
 * `finance` adds money (pricing, invoices, exports, payments and charges); `admin` can do everything, including reading
 * the access log. Whether a role allows an action is decided in packages/shared/src/lib/access.ts.
 */
export const STAFF_ROLES = ["support", "finance", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Who may open the admin console. It is its own table, so no customer row can be edited into an admin account.
 * Rows that existed before roles were added are `admin`, so nobody lost access when roles arrived.
 */
export const staffMembers = pgTable(
  "staff_members",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id),
    active: boolean("active").notNull().default(true),
    role: text("role").$type<StaffRole>().notNull().default("admin"),
    createdAt: createdAt(),
  },
  (table) => [check("staff_members_role_check", sql`${table.role} in ('support', 'finance', 'admin')`)],
);
