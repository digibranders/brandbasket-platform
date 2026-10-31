import { sql } from "drizzle-orm";
import { check, customType, foreignKey, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { projects, projectStatus } from "./projects";
import { supportTickets } from "./support";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * Every status a project entered, with the date. Written only by the trigger `projects_record_event` (migration 0192), so no
 * code path can move a project without leaving a dated line. The customer role reads its own and writes nothing, and no role
 * can delete a row: they go only with their project (`on delete cascade`, which the database runs as the table owner).
 */
export const projectEvents = pgTable(
  "project_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: uuid("project_id").notNull(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    status: projectStatus("status").notNull(),
    /** The pause reason, set only on an `on_hold` event. Shown to the customer. */
    reason: text("reason"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("project_events_project_idx").on(table.projectId, table.occurredAt),
    foreignKey({
      name: "project_events_project_business_fk",
      columns: [table.projectId, table.businessId],
      foreignColumns: [projects.id, projects.businessId],
    }).onDelete("cascade"),
    check("project_events_reason_check", sql`${table.reason} is null or (${table.status} = 'on_hold' and char_length(${table.reason}) between 3 and 200)`),
  ],
);
export type ProjectEvent = typeof projectEvents.$inferSelect;

/**
 * The picture of a project's preview, taken when staff save the preview link. One row per project, replaced by the next
 * preview. `previewUrl` is the link it was taken of: the customer's page shows the picture only while it still equals the
 * project's `preview_url`, so a stale picture never sits beside a new link.
 */
export const projectPreviewImages = pgTable(
  "project_preview_images",
  {
    projectId: uuid("project_id").notNull(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    previewUrl: text("preview_url").notNull(),
    contentType: text("content_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    image: bytea("image").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId] }),
    foreignKey({
      name: "project_preview_images_project_business_fk",
      columns: [table.projectId, table.businessId],
      foreignColumns: [projects.id, projects.businessId],
    }),
    check("project_preview_images_type_check", sql`${table.contentType} = 'image/webp'`),
    check("project_preview_images_size_check", sql`${table.width} between 1 and 4000 and ${table.height} between 1 and 8000 and octet_length(${table.image}) between 1 and 1048576`),
  ],
);
export type ProjectPreviewImage = typeof projectPreviewImages.$inferSelect;

/**
 * The support ticket a customer sent as feedback on a preview, and the revision round it asked for. Written only through the
 * platform's staff connection when the feedback is sent, so the customer's role has no grant on it. The ticket goes with
 * its row (`on delete cascade` from support_tickets); the row goes with its project.
 */
export const projectFeedbackTickets = pgTable(
  "project_feedback_tickets",
  {
    ticketId: uuid("ticket_id")
      .primaryKey()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    round: integer("round").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("project_feedback_tickets_project_idx").on(table.projectId, table.createdAt),
    foreignKey({
      name: "project_feedback_tickets_project_business_fk",
      columns: [table.projectId, table.businessId],
      foreignColumns: [projects.id, projects.businessId],
    }).onDelete("cascade"),
    check("project_feedback_tickets_round_check", sql`${table.round} >= 1`),
  ],
);
export type ProjectFeedbackTicket = typeof projectFeedbackTickets.$inferSelect;

/** The outcomes staff can record for a kickoff call. */
export const KICKOFF_OUTCOMES = ["completed", "customer_no_show", "team_no_show", "rescheduled", "unknown"] as const;
export const kickoffOutcome = pgEnum("kickoff_outcome", KICKOFF_OUTCOMES);
export type KickoffOutcome = (typeof KICKOFF_OUTCOMES)[number];

/**
 * What staff recorded about a kickoff call, one row per record. Append only: the staff connection reads and inserts, and no
 * role changes or removes a line. The call's times are a snapshot of the booking when the record was made, so a later
 * reschedule leaves the record as it was. The rows go with their business (`on delete cascade`, run by the table owner).
 */
export const setupCallOutcomes = pgTable(
  "setup_call_outcomes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    outcome: kickoffOutcome("outcome").notNull(),
    note: text("note"),
    callStartsAt: timestamp("call_starts_at", { withTimezone: true }),
    callEndsAt: timestamp("call_ends_at", { withTimezone: true }),
    recordedByStaffId: text("recorded_by_staff_id")
      .notNull()
      .references(() => users.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("setup_call_outcomes_business_idx").on(table.businessId, table.recordedAt),
    check("setup_call_outcomes_note_check", sql`${table.note} is null or char_length(btrim(${table.note})) between 3 and 600`),
  ],
);
export type SetupCallOutcome = typeof setupCallOutcomes.$inferSelect;

/**
 * One row per preview staff send, numbered from 1 for each project. Each send is kept, so staff can see which link the customer
 * was sent and when. The rows go with their project (`on delete cascade`, run by the table owner). `sentByStaffId` is null for
 * the first send of a project whose preview predates this table: its version 1 was backfilled from the project's own preview link.
 */
export const projectPreviewVersions = pgTable(
  "project_preview_versions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: uuid("project_id").notNull(),
    businessId: uuid("business_id").notNull(),
    version: integer("version").notNull(),
    previewUrl: text("preview_url").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    sentByStaffId: text("sent_by_staff_id").references(() => users.id),
  },
  (table) => [
    uniqueIndex("project_preview_versions_project_version_idx").on(table.projectId, table.version),
    foreignKey({
      name: "project_preview_versions_project_business_fk",
      columns: [table.projectId, table.businessId],
      foreignColumns: [projects.id, projects.businessId],
    }).onDelete("cascade"),
    check("project_preview_versions_version_check", sql`${table.version} >= 1`),
  ],
);
export type ProjectPreviewVersion = typeof projectPreviewVersions.$inferSelect;

/**
 * A launch check staff ticked by hand, with who ticked it and when. One row per check per project: ticking inserts it and
 * unticking deletes it, so the presence of a row is the check. The keys are listed in queries/project-launch-checks.ts. The rows
 * go with their project (`on delete cascade`, run by the table owner).
 */
export const projectLaunchChecks = pgTable(
  "project_launch_checks",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: uuid("project_id").notNull(),
    businessId: uuid("business_id").notNull(),
    checkKey: text("check_key").notNull(),
    checkedByStaffId: text("checked_by_staff_id")
      .notNull()
      .references(() => users.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_launch_checks_project_key_idx").on(table.projectId, table.checkKey),
    foreignKey({
      name: "project_launch_checks_project_business_fk",
      columns: [table.projectId, table.businessId],
      foreignColumns: [projects.id, projects.businessId],
    }).onDelete("cascade"),
    check("project_launch_checks_key_check", sql`${table.checkKey} ~ '^[a-z_]{3,40}$'`),
  ],
);
export type ProjectLaunchCheck = typeof projectLaunchChecks.$inferSelect;
