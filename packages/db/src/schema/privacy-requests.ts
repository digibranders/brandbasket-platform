import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { createdAt, updatedAt } from "./columns";

/**
 * What a person is asking for: the rights in DPDP Act ss.11 to 14, a grievance (s.13), or a report about listed content.
 * `visitor_erasure` is a website visitor deleting all their reviews, comments and enquiries, and `contribution_deletion` one
 * visitor deleting a single review or comment of theirs. Both are carried out as soon as the person's number is proven, and
 * the request is filed already closed, as the record that it was done.
 */
export const PRIVACY_REQUEST_KINDS = [
  "access",
  "correction",
  "erasure",
  "visitor_erasure",
  "contribution_deletion",
  "nomination",
  "grievance",
  "listing_removal",
  "content_report",
] as const;
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number];

/** What each kind of request is called to staff, in the console and in alert emails. */
export const PRIVACY_REQUEST_KIND_LABELS: Readonly<Record<PrivacyRequestKind, string>> = {
  access: "Access to their data",
  correction: "Correction or update",
  erasure: "Erasure",
  visitor_erasure: "Visitor data erased (automatic)",
  contribution_deletion: "Review or comment deleted (automatic)",
  nomination: "Nominee",
  grievance: "Grievance",
  listing_removal: "Listing removal",
  content_report: "Content report",
};

/** Where a request came in. `staff` is one logged by hand from an email or a call. */
export const PRIVACY_REQUEST_CHANNELS = ["web", "app", "email", "staff"] as const;
export type PrivacyRequestChannel = (typeof PRIVACY_REQUEST_CHANNELS)[number];

/** Received and waiting; being checked as really from the person; being worked on; finished. A closed request stays closed. */
export const PRIVACY_REQUEST_STATUSES = ["received", "verifying", "in_progress", "closed"] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

/** How a closed request ended. */
export const PRIVACY_REQUEST_OUTCOMES = ["fulfilled", "refused", "withdrawn"] as const;
export type PrivacyRequestOutcome = (typeof PRIVACY_REQUEST_OUTCOMES)[number];

/**
 * Every rights request and grievance Brandbasket has received, with the date it is due (DPDP Act ss.11 to 14, Rules 2025 r.14:
 * a grievance is answered within a reasonable period of at most 90 days; our own target is 30). Staff only. A row can be
 * added and updated but never deleted, and a request once closed stays closed (see queries/privacy-requests.ts).
 *
 * `subject_contact` is how to reach the person (an email address or a mobile number) and `subject_user_id` the account the
 * request concerns, when there is one. It has no foreign key on purpose: the record of a request, and when it was answered,
 * must outlive the account erased by it. `details` is what the person wrote; `resolution` is what Brandbasket did, in a few
 * words, written when the request is closed.
 */
export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** What the person is told to quote, such as "PR-7K2M9QXD". */
    reference: text("reference").notNull(),
    kind: text("kind").notNull(),
    channel: text("channel").notNull().default("staff"),
    subjectName: text("subject_name"),
    subjectContact: text("subject_contact").notNull(),
    subjectUserId: text("subject_user_id"),
    details: text("details"),
    status: text("status").notNull().default("received"),
    /** When the person's identity was checked (a code sent to the number or address on file). */
    identityVerifiedAt: timestamp("identity_verified_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    handledBy: text("handled_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    outcome: text("outcome"),
    resolution: text("resolution"),
    /** The highest due-date stage staff have been emailed about: 0 none, 1 reminder, 2 urgent, 3 overdue. */
    reminderStage: smallint("reminder_stage").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("privacy_requests_reference_idx").on(table.reference),
    index("privacy_requests_status_due_idx").on(table.status, table.dueAt),
    check("privacy_requests_kind_check", sql`${table.kind} in ('access', 'correction', 'erasure', 'visitor_erasure', 'contribution_deletion', 'nomination', 'grievance', 'listing_removal', 'content_report')`),
    check("privacy_requests_channel_check", sql`${table.channel} in ('web', 'app', 'email', 'staff')`),
    check("privacy_requests_status_check", sql`${table.status} in ('received', 'verifying', 'in_progress', 'closed')`),
    check("privacy_requests_outcome_check", sql`${table.outcome} is null or ${table.outcome} in ('fulfilled', 'refused', 'withdrawn')`),
    check("privacy_requests_contact_check", sql`char_length(${table.subjectContact}) between 3 and 320`),
    check("privacy_requests_name_check", sql`${table.subjectName} is null or char_length(${table.subjectName}) <= 200`),
    check("privacy_requests_details_check", sql`${table.details} is null or char_length(${table.details}) <= 4000`),
    check("privacy_requests_resolution_check", sql`${table.resolution} is null or char_length(${table.resolution}) <= 2000`),
    check("privacy_requests_reminder_stage_check", sql`${table.reminderStage} between 0 and 3`),
    check("privacy_requests_due_check", sql`${table.dueAt} >= ${table.receivedAt}`),
    check(
      "privacy_requests_closed_check",
      sql`(${table.status} = 'closed') = (${table.closedAt} is not null and ${table.outcome} is not null)`,
    ),
  ],
);

/**
 * The pending-request code challenge: a request made on the public form waits in `payload` (what was asked, by whom) until
 * the code emailed to `email` is confirmed, which proves the person controls that address. Only then does it become a
 * privacy_requests row, with the identity check stamped, and this row is deleted. Same rules as booking_otps: 6 digits,
 * HMAC-hashed with the account code secret and salted with the row's id, 10 minutes, 5 attempts. Rows left behind are
 * purged an hour after they expire. Staff connection only.
 */
export const privacyRequestOtps = pgTable(
  "privacy_request_otps",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** Trimmed and lowercased: where the code was emailed. */
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("privacy_request_otps_expires_at_idx").on(table.expiresAt),
    check("privacy_request_otps_email_check", sql`${table.email} ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length(${table.email}) <= 254`),
    check("privacy_request_otps_code_hash_check", sql`char_length(${table.codeHash}) > 0`),
    check("privacy_request_otps_attempts_check", sql`${table.attempts} >= 0`),
  ],
);
