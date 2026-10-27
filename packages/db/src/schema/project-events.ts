import { sql } from "drizzle-orm";
import { check, customType, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { projects, projectStatus } from "./projects";

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
