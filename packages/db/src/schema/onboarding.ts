import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { projects } from "./projects";

/**
 * What the customer tells us during onboarding, one table per concern. Every row carries `business_id`, which is
 * what row-level security scopes the app connection by.
 */
export const businessProfiles = pgTable("business_profiles", {
  businessId: uuid("business_id")
    .primaryKey()
    .references(() => businesses.id),
  displayName: text("display_name").notNull(),
  tagline: text("tagline"),
  description: text("description"),
  phone: text("phone"),
  email: text("email"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  country: text("country"),
  serviceAreas: text("service_areas"),
  googleBusinessUrl: text("google_business_url"),
  updatedAt: updatedAt(),
});

/**
 * Opening hours. `day_of_week` is 0-6 with Monday = 0; a day may have several rows for split shifts, and a day with
 * no row has no hours given. A row is one of three kinds, which the CHECK keeps apart:
 * - closed: `closed`, not `open_all_day`;
 * - open all day: `open_all_day` with no times;
 * - open: both times, which must differ. A closing time earlier than the opening time means the day closes after
 *   midnight (18:00 to 02:00).
 */
export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    dayOfWeek: integer("day_of_week").notNull(),
    opensAt: time("opens_at"),
    closesAt: time("closes_at"),
    closed: boolean("closed").notNull().default(false),
    openAllDay: boolean("open_all_day").notNull().default(false),
  },
  (table) => [
    index("business_hours_business_id_idx").on(table.businessId),
    check("business_hours_day_of_week_check", sql`${table.dayOfWeek} between 0 and 6`),
    // An open day needs both times, and they must differ. A null time must not slip through as "unknown".
    check(
      "business_hours_open_times_check",
      sql`(${table.closed} and not ${table.openAllDay})
        or (${table.openAllDay} and not ${table.closed} and ${table.opensAt} is null and ${table.closesAt} is null)
        or (not ${table.closed} and not ${table.openAllDay} and ${table.opensAt} is not null and ${table.closesAt} is not null and ${table.opensAt} <> ${table.closesAt})`,
    ),
  ],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    summary: text("summary"),
    /** Free text such as "From $40" or "Call for a quote". Never parsed as money. */
    priceText: text("price_text"),
    position: integer("position").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("services_business_id_position_idx").on(table.businessId, table.position)],
);

export const projectBriefs = pgTable(
  "project_briefs",
  {
    projectId: uuid("project_id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    notesForBuilder: text("notes_for_builder"),
    styleLikes: text("style_likes"),
    referenceUrls: text("reference_urls")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Composite, so the brief's project must belong to the brief's business (see projects_id_business_id_unique).
    foreignKey({
      name: "project_briefs_project_business_fk",
      columns: [table.projectId, table.businessId],
      foreignColumns: [projects.id, projects.businessId],
    }),
  ],
);

/** Only `pending` is reached in this phase; the rest belong to domain verification (spec §5.5). */
export const domainStatus = pgEnum("domain_status", [
  "pending",
  "awaiting_dns",
  "verifying",
  "misconfigured",
  "active",
  "degraded",
]);
export type DomainStatus = (typeof domainStatus.enumValues)[number];

export const domains = pgTable(
  "domains",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    hostname: text("hostname").notNull(),
    status: domainStatus("status").notNull().default("pending"),
    isPrimary: boolean("is_primary").notNull().default(true),
    /** When the customer ticked "I own this domain". We never ask for registrar logins. */
    ownerConfirmedAt: timestamp("owner_confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    // A hostname can be live for one business only, whatever its case.
    uniqueIndex("domains_live_hostname_idx")
      .on(sql`lower(${table.hostname})`)
      .where(sql`${table.removedAt} is null`),
    uniqueIndex("domains_one_primary_per_business_idx")
      .on(table.businessId)
      .where(sql`${table.isPrimary} and ${table.removedAt} is null`),
  ],
);
