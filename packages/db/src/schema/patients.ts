import { sql } from "drizzle-orm";
import { check, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/**
 * One person a clinic has seen, built from its bookings (docs/superpowers/specs/2026-09-29-clinic-patients-design.md).
 * It is a register, not a medical record: a name, a phone number, an optional second number and a few short tags,
 * and nothing clinical. Rows are never inserted by the customer: the `appointments_link_patient` trigger (0050)
 * finds or creates one for every booking by its phone number, so every booking path (the site's OTP confirm,
 * reception's Add booking, scripts) links itself the same way.
 *
 * `phone` is unique per business, which is what lets that trigger's `INSERT ... ON CONFLICT (business_id, phone) DO
 * NOTHING` make two concurrent first bookings from one number share one patient. `alt_phone` is a second number the
 * clinic recorded (or the phone of a record merged into this one); a booking from it links here too, so it must
 * differ from `phone`. `tags` are free labels ("VIP", "Insurance"); their length and wording are validated by the
 * app, and only their count is held here.
 */
export const patients = pgTable(
  "patients",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    altPhone: text("alt_phone"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Target of the tenant-scoped (business_id, patient_id) foreign key on appointments: a plain id reference would
    // let one business's booking point at another business's patient.
    unique("patients_business_id_id_key").on(table.businessId, table.id),
    // One patient per number per clinic, and the conflict target of the link trigger's insert.
    unique("patients_business_id_phone_key").on(table.businessId, table.phone),
    // The link trigger's second lookup (a booking from a patient's second number), and the merge/edit checks that
    // a number is not already someone else's.
    index("patients_business_id_alt_phone_idx")
      .on(table.businessId, table.altPhone)
      .where(sql`${table.altPhone} is not null`),
    check("patients_name_check", sql`char_length(${table.name}) between 1 and 80`),
    // E.164, the same literal-in-template pattern as appointments_phone_check (see there for why it is inline).
    check("patients_phone_check", sql`${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    check(
      "patients_alt_phone_check",
      sql`${table.altPhone} is null or (${table.altPhone} ~ '^\\+[0-9]{8,15}$' and ${table.altPhone} <> ${table.phone})`,
    ),
    check("patients_tags_check", sql`cardinality(${table.tags}) <= 5`),
  ],
);
