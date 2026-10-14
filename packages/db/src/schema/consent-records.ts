import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { createdAt } from "./columns";

/** What happened to a consent: it was given, or it was withdrawn. A withdrawal is a new row, never an edit. */
export const CONSENT_EVENTS = ["given", "withdrawn"] as const;
export type ConsentEvent = (typeof CONSENT_EVENTS)[number];

/**
 * What a person agreed to and when (DPDP Act 2023 s.6(1) and r.3: proof that a notice was shown and consent was given
 * for a stated purpose, kept so Firstfold can show it if asked). One row per event, so the history is the record:
 * the current state of a consent is its latest row. Append only: the staff connection may read and add rows, the
 * public form connection may add rows, and nothing may edit one. The one exception is `subject_erased_at`, which the
 * nightly retention run sets once the data a row covers is gone; three years after that the row may be deleted
 * (retention schedule, M1 in docs/privacy/PRIVACY-PLAN.md), and not before.
 *
 * `subject_ref` has no foreign key on purpose: the subject may be a user, a lead or a visitor, and the record must
 * outlive an erased account (the person is then identified only by the reference). `ip_hash` is a keyed hash made by
 * the caller, never the address itself. `purpose` and `channel` are the vocabulary in queries/consent-records.ts;
 * the database checks only their length, so adding a purpose needs no migration.
 */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    subjectType: text("subject_type").notNull(),
    subjectRef: text("subject_ref").notNull(),
    purpose: text("purpose").notNull(),
    event: text("event").$type<ConsentEvent>().notNull().default("given"),
    /** The version of the privacy notice (and terms) on screen when the person acted. */
    noticeVersion: text("notice_version").notNull(),
    language: text("language").notNull().default("en"),
    channel: text("channel").notNull(),
    ipHash: text("ip_hash"),
    /** When the retention run first found the subject's data gone. The row is kept three years after this, then deleted. */
    subjectErasedAt: timestamp("subject_erased_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("consent_records_subject_idx").on(table.subjectType, table.subjectRef, table.purpose, table.createdAt),
    check("consent_records_subject_check", sql`char_length(${table.subjectType}) between 1 and 32 and char_length(${table.subjectRef}) between 1 and 200`),
    check("consent_records_purpose_check", sql`char_length(${table.purpose}) between 1 and 64`),
    check("consent_records_event_check", sql`${table.event} in ('given', 'withdrawn')`),
    check("consent_records_notice_version_check", sql`char_length(${table.noticeVersion}) between 1 and 40`),
    check("consent_records_language_check", sql`char_length(${table.language}) between 2 and 8`),
    check("consent_records_channel_check", sql`char_length(${table.channel}) between 1 and 32`),
    check("consent_records_ip_hash_check", sql`${table.ipHash} is null or char_length(${table.ipHash}) <= 128`),
  ],
);
