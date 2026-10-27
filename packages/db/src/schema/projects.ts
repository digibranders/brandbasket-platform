import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/** The build's state machine. See docs/superpowers/specs/2026-09-15-brandbasket-platform-design.md §5.3. */
export const projectStatus = pgEnum("project_status", [
  "onboarding",
  "submitted",
  "building",
  "preview",
  "revisions",
  "approved",
  "live",
  "on_hold",
  "cancelled",
]);
export type ProjectStatus = (typeof projectStatus.enumValues)[number];

export const projectKind = pgEnum("project_kind", ["initial_build", "redesign"]);
export type ProjectKind = (typeof projectKind.enumValues)[number];

export const projects = pgTable(
  "projects",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    kind: projectKind("kind").notNull().default("initial_build"),
    status: projectStatus("status").notNull().default("onboarding"),
    onboardingSubmittedAt: timestamp("onboarding_submitted_at", { withTimezone: true }),
    /** First preview promised by this time: 48 hours after submission. */
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    /** Set together, when staff send a preview: recordProjectPreviewSent. Null until the first one goes out. */
    previewUrl: text("preview_url"),
    previewSentAt: timestamp("preview_sent_at", { withTimezone: true }),
    onHoldReason: text("on_hold_reason"),
    revisionRoundsIncluded: integer("revision_rounds_included").notNull().default(2),
    revisionRoundsGranted: integer("revision_rounds_granted").notNull().default(0),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // One open project per business; finished and cancelled ones accumulate.
    uniqueIndex("projects_one_open_per_business_idx")
      .on(table.businessId)
      .where(sql`${table.status} not in ('live', 'cancelled')`),
    // Target of the (project_id, business_id) foreign keys below. Foreign key checks bypass row-level security,
    // so a plain project_id reference would let one tenant attach rows to another tenant's project.
    unique("projects_id_business_id_unique").on(table.id, table.businessId),
    // A pause reason belongs to a paused project only.
    check(
      "projects_hold_reason_check",
      sql`${table.onHoldReason} is null or (${table.status} = 'on_hold' and char_length(btrim(${table.onHoldReason})) between 3 and 200)`,
    ),
  ],
);

export const onboardingStep = pgEnum("onboarding_step", ["business", "content", "brand", "domain", "review"]);
export type OnboardingStep = (typeof onboardingStep.enumValues)[number];

export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    projectId: uuid("project_id").notNull(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    step: onboardingStep("step").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.step] }),
    foreignKey({
      name: "onboarding_progress_project_business_fk",
      columns: [table.projectId, table.businessId],
      foreignColumns: [projects.id, projects.businessId],
    }),
  ],
);

/**
 * The kickoff call a business booked from its dashboard (the setup call link, lib/setup-call-link.ts): at most one row a
 * business, written when the booking page says a time was picked. `startsAt` and `endsAt` are the meeting's time, filled
 * in when the dashboard books it through Cal.com; a booking page that reports only that a call was booked leaves them null,
 * so the dashboard stops asking for one. Cal.com's webhook moves the row when the call is rescheduled from its email, and
 * removes it when the call is cancelled there.
 */
export const setupCallBookings = pgTable(
  "setup_call_bookings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    /** The booking page's address for this booking (Calendly's invitee link), when it gave one. */
    inviteeUri: text("invitee_uri"),
    bookedAt: timestamp("booked_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the meeting starts and ends. Null until the booking page has reported it. Set together. */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** When staff marked the call as held. Ends the customer's first look (apps/platform/lib/first-look.ts). Null until then. */
    heldAt: timestamp("held_at", { withTimezone: true }),
    /** The staff member who marked it. */
    heldByStaffId: text("held_by_staff_id").references(() => users.id),
    /** What was agreed on the call, written by staff once it is held (plan 32). All three are set together. */
    summary: text("summary"),
    summaryAt: timestamp("summary_at", { withTimezone: true }),
    summaryByStaffId: text("summary_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("setup_call_bookings_business_idx").on(table.businessId),
    check("setup_call_bookings_invitee_check", sql`${table.inviteeUri} is null or char_length(${table.inviteeUri}) <= 300`),
    check(
      "setup_call_bookings_time_check",
      sql`(${table.startsAt} is null and ${table.endsAt} is null) or (${table.startsAt} is not null and ${table.endsAt} is not null and ${table.endsAt} > ${table.startsAt})`,
    ),
    check("setup_call_bookings_held_check", sql`(${table.heldAt} is null) = (${table.heldByStaffId} is null)`),
    check(
      "setup_call_bookings_summary_check",
      sql`(${table.summary} is null) = (${table.summaryAt} is null) and (${table.summary} is null) = (${table.summaryByStaffId} is null) and (${table.summary} is null or (${table.heldAt} is not null and char_length(btrim(${table.summary})) between 3 and 600))`,
    ),
  ],
);
export type SetupCallBooking = typeof setupCallBookings.$inferSelect;
