import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt } from "./columns";
import { paymentLinks } from "./payment-links";

/**
 * A custom recurring price agreed in a deal (docs/plans/66), kept after the deal is paid so re-pricing sites (reactivation, keep my plan,
 * a service joining a live basket) honour it instead of the catalogue. One row per business, service and billing period, GST included.
 * Staff-only, like payment links: bb_app is granted nothing, and the customer app reads it on the staff connection.
 */
export const businessPriceOverrides = pgTable(
  "business_price_overrides",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    /** Catalogue id of the service: managed-website, social-media, paid-ads or expert-monitoring. */
    addOn: text("add_on").notNull(),
    billingInterval: text("billing_interval").notNull(),
    netCents: integer("net_cents").notNull(),
    paymentLinkId: uuid("payment_link_id").references(() => paymentLinks.id),
    setByStaffId: text("set_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    unique("business_price_overrides_unique").on(table.businessId, table.addOn, table.billingInterval),
    check("business_price_overrides_add_on_check", sql`${table.addOn} in ('managed-website', 'social-media', 'paid-ads', 'expert-monitoring')`),
    check("business_price_overrides_interval_check", sql`${table.billingInterval} in ('month', 'year')`),
    check("business_price_overrides_price_check", sql`${table.netCents} > 0`),
  ],
);

export type BusinessPriceOverride = typeof businessPriceOverrides.$inferSelect;
export type NewBusinessPriceOverride = typeof businessPriceOverrides.$inferInsert;
