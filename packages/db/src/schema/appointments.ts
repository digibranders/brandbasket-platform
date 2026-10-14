import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { patients } from "./patients";
import { practitioners } from "./practitioners";

/** Must match APPOINTMENT_STATUSES in packages/shared/src/lib/appointments/status.ts; packages/db does not
 * depend on @fynix/shared, so the values are written literally here and
 * packages/shared/src/lib/appointments/status-db-parity.test.ts asserts they agree. */
export const appointmentStatus = pgEnum("appointment_status", ["booked", "cancelled", "done", "no_show"]);
export type AppointmentStatus = (typeof appointmentStatus.enumValues)[number];

/** How a booking was made: `online` through the client site's OTP flow, `clinic` by reception's Add booking (a walk-in
 * or a phone call), which skips the emailed code because the clinic is booking deliberately for someone in front of it. */
export const appointmentSource = pgEnum("appointment_source", ["online", "clinic"]);
export type AppointmentSource = (typeof appointmentSource.enumValues)[number];

/**
 * One row per business, once the module is switched on. `accepting = false` shows `paused_message` on the client
 * site instead of the week grid. `slot_minutes`, `min_notice_minutes` and `horizon_days` drive slot generation
 * (see appointments/slots.ts in packages/shared): the clinic picks its own slot length and booking window here.
 * "New" is tracked per booking (see `appointments.seen_at` below), not at the settings level. Appointments send no
 * email of any kind.
 */
export const appointmentSettings = pgTable(
  "appointment_settings",
  {
    businessId: uuid("business_id")
      .primaryKey()
      .references(() => businesses.id),
    accepting: boolean("accepting").notNull().default(true),
    pausedMessage: text("paused_message"),
    slotMinutes: integer("slot_minutes").notNull().default(30),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(60),
    horizonDays: integer("horizon_days").notNull().default(28),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "appointment_settings_paused_message_check",
      sql`${table.pausedMessage} is null or char_length(${table.pausedMessage}) between 1 and 160`,
    ),
    check("appointment_settings_slot_minutes_check", sql`${table.slotMinutes} in (15, 20, 30, 45, 60)`),
    check(
      "appointment_settings_min_notice_minutes_check",
      sql`${table.minNoticeMinutes} between 0 and 10080`,
    ),
    check("appointment_settings_horizon_days_check", sql`${table.horizonDays} between 1 and 180`),
  ],
);

/** A bookable service the client offers, in the order it is shown. Archiving keeps past appointments' `service_name`
 * readable without letting the service be picked for a new one. */
export const appointmentServices = pgTable(
  "appointment_services",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("appointment_services_business_id_position_idx").on(table.businessId, table.position),
    check("appointment_services_name_check", sql`char_length(${table.name}) between 1 and 80`),
    // Target of the tenant-scoped (business_id, service_id) foreign key on appointments below: a plain
    // id reference would let one business's appointment point at another business's service.
    unique("appointment_services_business_id_id_unique").on(table.businessId, table.id),
  ],
);

/**
 * A slot booked from the client's static site (staff connection, after OTP verification) and worked from the
 * business dashboard (app connection). `service_id`/`service_name` are kept separately because the appointment must
 * still name a service after that service is archived or renamed; `service_name` is a snapshot taken at insert.
 * `service_id` is tied to this row's own `business_id` by a composite foreign key (see below), so an appointment can
 * never point at another business's service.
 *
 * `local_date`/`local_start`/`local_end` are the slot as the clinic's calendar shows it (wall-clock time in the
 * business's time zone); `starts_at`/`ends_at` are the same instant in UTC, and are what overlap checks and the
 * partial unique index below key on. Both are stored so the grid never has to convert back through a time zone that
 * might change later.
 *
 * Every appointment belongs to one practitioner (`practitioner_id`), tied to this row's own `business_id` by a
 * composite foreign key the same way `service_id` is. A clinic with several doctors can have several bookings at the
 * same instant, one per doctor, so double booking is a per-practitioner question.
 *
 * Every booking with a phone number is linked to one of the business's `patients` (`patient_id`, composite foreign
 * key like the other two) by the `appointments_link_patient` trigger in 0050, which finds the patient by phone or
 * second phone or creates one. `patient_name`/`phone` stay on the row as what was typed for this booking, a
 * snapshot; the dashboard shows the linked patient's current name. Erasing a patient (erasePatient) clears
 * `patient_id`, `phone`, `email`, `patient_note` and `clinic_note` and renames the booking "Deleted patient", so the
 * slot still counts on the calendar with nobody attached: `appointments_patient_link_check` holds that a booking has
 * both a patient and a phone or neither.
 *
 * Double booking is prevented two ways: `bookSlot` (packages/db/src/queries/appointments.ts) takes a
 * business-scoped advisory lock and checks for an overlapping non-cancelled appointment before inserting, and the
 * partial unique index on (practitioner_id, starts_at) below is the backstop that catches anything that slips past
 * it.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    // Not a plain `.references()`: the FK is composite, declared with the other business_id below, so it ties
    // the service to this row's own business rather than any business's.
    serviceId: uuid("service_id"),
    serviceName: text("service_name"),
    // Composite FK below, like service_id: the practitioner is always one of this row's own business's.
    practitionerId: uuid("practitioner_id").notNull(),
    // Composite FK below, like service_id: the patient is always one of this row's own business's. Null only once
    // the patient has been erased (see appointments_patient_link_check).
    patientId: uuid("patient_id"),
    patientName: text("patient_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    patientNote: text("patient_note"),
    localDate: date("local_date", { mode: "string" }).notNull(),
    localStart: time("local_start").notNull(),
    localEnd: time("local_end").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: appointmentStatus("status").notNull().default("booked"),
    cancelReason: text("cancel_reason"),
    clinicNote: text("clinic_note"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** Stamped by the booked -> no_show transition and never changed afterwards (the guard trigger in 0051). */
    noShowAt: timestamp("no_show_at", { withTimezone: true }),
    source: appointmentSource("source").notNull().default("online"),
    createdAt: createdAt(),
    handledByUserId: text("handled_by_user_id").references(() => users.id),
    /** "New" is per booking, like unread: null until the clinic dashboard has shown this appointment once, via
     * markAppointmentSeen. Once set it can only stay the same -- the guard trigger in 0042 refuses to clear it or
     * change it to a different value, so a booking can never silently go back to unseen. */
    seenAt: timestamp("seen_at", { withTimezone: true }),
  },
  (table) => [
    index("appointments_business_id_local_date_idx").on(table.businessId, table.localDate),
    index("appointments_business_id_created_at_idx").on(table.businessId, table.createdAt),
    // The backstop for bookSlot's advisory lock, which stays the primary guard: a cancelled appointment frees its
    // slot, so only non-cancelled rows are held to one-per-(practitioner, starts_at). It is keyed on the
    // practitioner rather than the business because two doctors in the same clinic can be booked at the same time.
    uniqueIndex("appointments_practitioner_id_starts_at_idx")
      .on(table.practitionerId, table.startsAt)
      .where(sql`${table.status} <> 'cancelled'`),
    // No longer unique (see above), but still what bookSlot's overlap check and listBusyIntervals scan by: every
    // appointment of one business in a time window.
    index("appointments_business_id_starts_at_idx").on(table.businessId, table.startsAt),
    foreignKey({
      name: "appointments_service_business_fk",
      columns: [table.businessId, table.serviceId],
      foreignColumns: [appointmentServices.businessId, appointmentServices.id],
    }),
    foreignKey({
      name: "appointments_practitioner_business_fk",
      columns: [table.businessId, table.practitionerId],
      foreignColumns: [practitioners.businessId, practitioners.id],
    }),
    foreignKey({
      name: "appointments_patient_business_fk",
      columns: [table.businessId, table.patientId],
      foreignColumns: [patients.businessId, patients.id],
    }),
    // A patient's visit history, and what the foreign key above scans when a patient is deleted or merged away.
    index("appointments_business_id_patient_id_idx").on(table.businessId, table.patientId),
    check("appointments_patient_name_check", sql`char_length(${table.patientName}) between 1 and 80`),
    // Only an erased booking has neither a patient nor a phone; every other one has both (the link trigger fills
    // patient_id from the phone on insert). Added in 0050 only after the backfill had linked every existing row.
    check("appointments_patient_link_check", sql`(${table.patientId} is null) = (${table.phone} is null)`),
    // E.164: a leading "+", then 8 to 15 digits. The literal is written directly in the template (not
    // interpolated as a JS value) so drizzle-kit emits it inline rather than as a bound query parameter, which a
    // CHECK constraint cannot hold -- see businesses.ts's websiteUrl check for the same pattern.
    check("appointments_phone_check", sql`${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    check("appointments_email_check", sql`${table.email} is null or char_length(${table.email}) between 3 and 254`),
    check(
      "appointments_service_name_check",
      sql`${table.serviceName} is null or char_length(${table.serviceName}) between 1 and 80`,
    ),
    check(
      "appointments_patient_note_check",
      sql`${table.patientNote} is null or char_length(${table.patientNote}) between 1 and 300`,
    ),
    check(
      "appointments_cancel_reason_check",
      sql`${table.cancelReason} is null or char_length(${table.cancelReason}) between 1 and 200`,
    ),
    check(
      "appointments_clinic_note_check",
      sql`${table.clinicNote} is null or char_length(${table.clinicNote}) between 1 and 500`,
    ),
    check("appointments_ends_at_check", sql`${table.endsAt} > ${table.startsAt}`),
    // Backs the "starts_at >= X - interval '1 day'" bound that bookSlot's overlap check and listBusyIntervals add
    // to their WHERE clauses: with this in place, any appointment that could overlap a given window is guaranteed
    // to start no earlier than one day before it, so that bound never excludes a real overlap while still letting
    // both queries use the (business_id, starts_at) index instead of scanning every appointment ever made.
    check(
      "appointments_max_duration_check",
      sql`${table.endsAt} <= ${table.startsAt} + interval '1 day'`,
    ),
  ],
);

/**
 * One pending booking's code challenge. `payload` holds the parsed booking fields the code will turn into an
 * appointment once confirmed (name, phone, serviceId, serviceName, date, start, end, startsAt, endsAt, practitionerId),
 * so the confirm step only needs `{otpId, code}` -- nothing about the booking is re-sent by the client. `email` is the
 * address the code was emailed to and so the one the patient proved; `phone` is the number the clinic calls, collected
 * but never verified, and nothing is sent to it (the patients registry keys on it). `code_hash` is an HMAC-SHA256 of the 6-digit code
 * with the account code secret; the plaintext code is never stored. Staff-only: the client site never reads or writes
 * this table directly, only through the platform's own server routes on the staff connection.
 */
export const bookingOtps = pgTable(
  "booking_otps",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    /** Trimmed and lowercased: where the code was emailed. */
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("booking_otps_business_id_phone_created_at_idx").on(table.businessId, table.phone, table.createdAt),
    check("booking_otps_email_check", sql`${table.email} ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length(${table.email}) <= 254`),
    check("booking_otps_phone_check", sql`${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    check("booking_otps_code_hash_check", sql`char_length(${table.codeHash}) > 0`),
    check("booking_otps_attempts_check", sql`${table.attempts} >= 0`),
  ],
);
