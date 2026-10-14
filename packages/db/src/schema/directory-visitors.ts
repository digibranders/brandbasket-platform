import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { createdAt } from "./columns";

/**
 * A website visitor's account: made the first time a code is confirmed anywhere on the directory (a review, a
 * comment on one), after which the same browser sends enquiries, reviews and comments under this number with no
 * further code. Just a name and a verified phone, no password and no email. Not a dashboard login: owners have
 * `users`. Staff-only like the rest of the directory (0118): the website reaches it through the platform's
 * /api/directory/* routes, which run on the staff connection.
 */
export const directoryVisitors = pgTable(
  "directory_visitors",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** E.164, verified by a code at least once. One account per number. */
    phone: text("phone").notNull().unique(),
    /** The name they last gave. */
    name: text("name").notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("directory_visitors_phone_check", sql`${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    check("directory_visitors_name_check", sql`char_length(${table.name}) between 1 and 60`),
    index("directory_visitors_last_seen_at_idx").on(table.lastSeenAt),
  ],
);
export type DirectoryVisitor = typeof directoryVisitors.$inferSelect;
