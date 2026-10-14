import { timestamp } from "drizzle-orm/pg-core";

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Set by the database on insert and refreshed by Drizzle on every update made through the ORM. */
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
