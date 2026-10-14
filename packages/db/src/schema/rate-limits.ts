import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/** Fixed-window counters. One row per key per window; older windows for a key are removed on each hit. */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })],
);
