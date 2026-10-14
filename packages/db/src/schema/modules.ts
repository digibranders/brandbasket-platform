import { boolean, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses } from "./businesses";

/** Must match BUSINESS_MODULES in packages/shared/src/lib/business-modules.ts; packages/db does not depend on
 * @firstfold/shared, so the values are written literally here and
 * packages/shared/src/lib/appointments/status-db-parity.test.ts asserts they agree. */
export const businessModule = pgEnum("business_module", ["appointments"]);
export type BusinessModule = (typeof businessModule.enumValues)[number];

/**
 * Which optional modules a business has. Only staff write here (the admin Features section). A row with
 * enabled = false remembers who last switched it off; no row means it was never on.
 */
export const businessModules = pgTable(
  "business_modules",
  {
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    module: businessModule("module").notNull(),
    enabled: boolean("enabled").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [primaryKey({ columns: [table.businessId, table.module] })],
);
