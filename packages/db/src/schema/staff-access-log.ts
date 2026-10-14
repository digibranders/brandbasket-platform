import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { createdAt } from "./columns";

/** What can happen to a staff access: it worked, it was attempted and failed (a wrong password), or it was refused. */
export const STAFF_ACCESS_RESULTS = ["ok", "failed", "denied"] as const;
export type StaffAccessResult = (typeof STAFF_ACCESS_RESULTS)[number];

/**
 * Who in the staff console opened, exported or changed what, and when (DPDP Rules 2025 r.6(1)(c): visibility on access
 * to personal data through logs, kept for one year). Append only: the staff connection may read and insert and nothing
 * else, so a record cannot be edited or erased by the people it describes. Rows are removed by a purge function added
 * with the retention job, after 13 months.
 *
 * `target_id` and `business_id` carry no foreign keys on purpose: the record must outlive the thing it points at.
 * `detail` is a short note with no personal data (a month, a row count).
 */
export const staffAccessLog = pgTable(
  "staff_access_log",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    staffUserId: text("staff_user_id")
      .notNull()
      .references(() => users.id),
    /** A dotted name from STAFF_ACCESS_ACTIONS in queries/staff-access-log.ts, such as "client.view". */
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    businessId: uuid("business_id"),
    result: text("result").notNull().default("ok"),
    detail: text("detail"),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (table) => [
    index("staff_access_log_created_at_idx").on(table.createdAt),
    index("staff_access_log_staff_created_at_idx").on(table.staffUserId, table.createdAt),
    check("staff_access_log_action_check", sql`char_length(${table.action}) between 1 and 64`),
    check("staff_access_log_result_check", sql`${table.result} in ('ok', 'failed', 'denied')`),
    check("staff_access_log_detail_check", sql`${table.detail} is null or char_length(${table.detail}) <= 200`),
  ],
);
