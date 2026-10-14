import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt } from "./columns";

/**
 * One doctor (or other practitioner) a clinic takes bookings for. Every appointment points at exactly one of these
 * (see `appointments.practitioner_id`), so a business with the appointments module always has at least one: the
 * module switch seeds a default named after the business, and 0044 backfilled the same for businesses that already
 * had the module on. Archiving keeps past bookings pointing at a readable row while taking the practitioner off
 * every new booking; nothing is ever deleted, for the same reason `appointment_services` is never deleted.
 *
 * `uses_clinic_hours` (the default) means the practitioner's weekly schedule is simply `business_hours`; only when it
 * is false are their own `practitioner_hours` rows read. `photo_media_id` names a media asset but carries no foreign
 * key yet: the `practitioner` media purpose it will reference is added with the photo upload.
 */
export const practitioners = pgTable(
  "practitioners",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    title: text("title"),
    photoMediaId: uuid("photo_media_id"),
    usesClinicHours: boolean("uses_clinic_hours").notNull().default(true),
    position: integer("position").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // Target of the tenant-scoped (business_id, practitioner_id) foreign keys on practitioner_hours,
    // practitioner_leave and appointments: a plain id reference would let one business's row point at another
    // business's practitioner.
    unique("practitioners_business_id_id_key").on(table.businessId, table.id),
    index("practitioners_business_id_position_idx").on(table.businessId, table.position),
    check("practitioners_name_check", sql`char_length(${table.name}) between 1 and 80`),
    check("practitioners_title_check", sql`${table.title} is null or char_length(${table.title}) between 1 and 80`),
  ],
);

/**
 * A practitioner's own weekly schedule, read only while their `uses_clinic_hours` is false. The columns and the three
 * kinds of row the CHECK keeps apart are exactly those of `business_hours` (onboarding.ts), so the same slot engine
 * reads either: `day_of_week` is 0-6 with Monday = 0, a day may have several rows for split shifts, a day with no row
 * has no hours, and a closing time earlier than the opening time means the shift runs past midnight.
 */
export const practitionerHours = pgTable(
  "practitioner_hours",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    // Not a plain `.references()`: the FK is composite, declared below with business_id, so the practitioner is
    // always one of this row's own business's.
    practitionerId: uuid("practitioner_id").notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    opensAt: time("opens_at"),
    closesAt: time("closes_at"),
    closed: boolean("closed").notNull().default(false),
    openAllDay: boolean("open_all_day").notNull().default(false),
  },
  (table) => [
    index("practitioner_hours_practitioner_id_idx").on(table.practitionerId),
    foreignKey({
      name: "practitioner_hours_practitioner_business_fk",
      columns: [table.businessId, table.practitionerId],
      foreignColumns: [practitioners.businessId, practitioners.id],
    }),
    check("practitioner_hours_day_of_week_check", sql`${table.dayOfWeek} between 0 and 6`),
    // An open day needs both times, and they must differ. A null time must not slip through as "unknown".
    check(
      "practitioner_hours_open_times_check",
      sql`(${table.closed} and not ${table.openAllDay})
        or (${table.openAllDay} and not ${table.closed} and ${table.opensAt} is null and ${table.closesAt} is null)
        or (not ${table.closed} and not ${table.openAllDay} and ${table.opensAt} is not null and ${table.closesAt} is not null and ${table.opensAt} <> ${table.closesAt})`,
    ),
  ],
);

/**
 * A stretch of days one practitioner is away (leave, a conference), the per-practitioner counterpart of
 * `business_closures` with the same shape and limits. Dates travel as plain `YYYY-MM-DD` strings, read in
 * `businesses.time_zone`.
 */
export const practitionerLeave = pgTable(
  "practitioner_leave",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    // Composite FK below, for the same reason as practitioner_hours.practitioner_id.
    practitionerId: uuid("practitioner_id").notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (table) => [
    index("practitioner_leave_practitioner_id_starts_on_idx").on(table.practitionerId, table.startsOn),
    foreignKey({
      name: "practitioner_leave_practitioner_business_fk",
      columns: [table.businessId, table.practitionerId],
      foreignColumns: [practitioners.businessId, practitioners.id],
    }),
    check("practitioner_leave_dates_check", sql`${table.endsOn} >= ${table.startsOn}`),
    check(
      "practitioner_leave_note_check",
      sql`${table.note} is null or char_length(${table.note}) between 1 and 80`,
    ),
  ],
);
