import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/** The services that ask the customer for answers after the kickoff call (the website uses the onboarding steps). */
export const SETUP_SERVICES = ["social", "search"] as const;
export type SetupService = (typeof SETUP_SERVICES)[number];

/** The services an update or a number can belong to. */
export const ACTIVITY_SERVICES = ["website", "social", "search"] as const;
export type ActivityService = (typeof ACTIVITY_SERVICES)[number];

/**
 * What a customer told us for Social or Search, one row per business and service. `answers` is a flat object of
 * short values (apps/platform/lib/service-setup.ts says which keys exist); a save merges into it, so one item's form
 * never erases another's. The customer app role reads and writes its own row.
 */
export const serviceSetup = pgTable(
  "service_setup",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    service: text("service").$type<SetupService>().notNull(),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("service_setup_business_service_idx").on(table.businessId, table.service),
    check("service_setup_service_check", sql`${table.service} in ('social', 'search')`),
  ],
);
export type ServiceSetup = typeof serviceSetup.$inferSelect;

/**
 * A dated line staff add for a customer ("Ads narrowed to 4 km around the clinic"), shown under "What we did" on the
 * customer's Overview. Staff write, the customer reads their own.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    /** Which service the line belongs to, or null for a general line. */
    service: text("service").$type<ActivityService>(),
    title: text("title").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdByStaffId: text("created_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("activity_events_business_idx").on(table.businessId, table.occurredAt),
    check("activity_events_service_check", sql`${table.service} is null or ${table.service} in ('website', 'social', 'search')`),
    check("activity_events_title_check", sql`char_length(${table.title}) between 3 and 140`),
  ],
);
export type ActivityEvent = typeof activityEvents.$inferSelect;

/**
 * One month's numbers for a customer's Social or Search service, entered by staff. Every figure is optional: a figure
 * that was not measured stays null and the customer's Overview leaves that line out (it never shows a zero that means
 * "we do not know"). Money is in paise. `month` is the first day of the month.
 */
export const monthlySnapshots = pgTable(
  "monthly_snapshots",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    service: text("service").$type<SetupService>().notNull(),
    month: date("month", { mode: "string" }).notNull(),
    adSpendCents: integer("ad_spend_cents"),
    adBudgetCents: integer("ad_budget_cents"),
    adEnquiries: integer("ad_enquiries"),
    postsPublished: integer("posts_published"),
    postsPlanned: integer("posts_planned"),
    keywordsPageOne: integer("keywords_page_one"),
    keywordsPageOnePrev: integer("keywords_page_one_prev"),
    updatedByStaffId: text("updated_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("monthly_snapshots_business_service_month_idx").on(table.businessId, table.service, table.month),
    check("monthly_snapshots_service_check", sql`${table.service} in ('social', 'search')`),
    check("monthly_snapshots_month_check", sql`extract(day from ${table.month}) = 1`),
    check(
      "monthly_snapshots_figures_check",
      sql`coalesce(${table.adSpendCents}, 0) >= 0 and coalesce(${table.adBudgetCents}, 0) >= 0 and coalesce(${table.adEnquiries}, 0) >= 0
        and coalesce(${table.postsPublished}, 0) >= 0 and coalesce(${table.postsPlanned}, 0) >= 0
        and coalesce(${table.keywordsPageOne}, 0) >= 0 and coalesce(${table.keywordsPageOnePrev}, 0) >= 0`,
    ),
  ],
);
export type MonthlySnapshot = typeof monthlySnapshots.$inferSelect;
