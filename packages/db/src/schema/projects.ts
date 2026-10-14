import { sql } from "drizzle-orm";
import {
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
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/** The build's state machine. See docs/superpowers/specs/2026-09-15-firstfold-platform-design.md §5.3. */
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
