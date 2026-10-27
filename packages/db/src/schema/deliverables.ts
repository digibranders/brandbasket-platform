import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import type { DeliverableKind, DeliverableStatus } from "../deliverable-states";
import { users } from "./auth";
import { businesses } from "./businesses";
import type { SetupService } from "./client-activity";
import { createdAt, updatedAt } from "./columns";

/**
 * One piece of Social & Ads or Search work: a post (waits for the customer's OK), a page we improved or a listing we
 * fixed. Staff write it (named columns only, see 0193), the customer reads their own, and the customer's one write
 * is the function approve_deliverables. A post's picture is a file in media storage under
 * `deliverables/{id}/display`; the `image_*` columns describe it.
 */
export const deliverables = pgTable(
  "deliverables",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    service: text("service").$type<SetupService>().notNull(),
    kind: text("kind").$type<DeliverableKind>().notNull(),
    title: text("title").notNull(),
    /** The words that go with a post, as the customer reads them on its card. */
    caption: text("caption"),
    /** The day a post goes out, or the day a page or listing was done. */
    dueOn: date("due_on", { mode: "string" }),
    status: text("status").$type<DeliverableStatus>().notNull().default("planned"),
    /** Where the published post or the improved page lives. https only. */
    linkUrl: text("link_url"),
    imageKey: text("image_key"),
    imageMime: text("image_mime"),
    imageBytes: integer("image_bytes"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    imageSha256: text("image_sha256"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: text("approved_by_user_id").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByStaffId: text("created_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("deliverables_business_status_idx").on(table.businessId, table.status, table.dueOn),
    index("deliverables_business_service_idx").on(table.businessId, table.service, table.kind),
    check("deliverables_kind_service_check", sql`(${table.kind} = 'post' and ${table.service} = 'social') or (${table.kind} in ('page', 'listing') and ${table.service} = 'search')`),
    check("deliverables_status_check", sql`${table.status} in ('planned', 'awaiting_approval', 'approved', 'published')`),
    check("deliverables_title_check", sql`char_length(btrim(${table.title})) between 3 and 140`),
    check("deliverables_caption_check", sql`${table.caption} is null or char_length(${table.caption}) <= 600`),
    check("deliverables_link_check", sql`${table.linkUrl} is null or (char_length(${table.linkUrl}) <= 500 and ${table.linkUrl} ~ '^https://')`),
    check("deliverables_post_date_check", sql`${table.kind} <> 'post' or ${table.dueOn} is not null`),
    check("deliverables_post_only_check", sql`${table.kind} = 'post' or (${table.status} in ('planned', 'published') and ${table.imageKey} is null and ${table.caption} is null)`),
    check("deliverables_image_check", sql`num_nulls(${table.imageKey}, ${table.imageMime}, ${table.imageBytes}, ${table.imageWidth}, ${table.imageHeight}, ${table.imageSha256}) in (0, 6)`),
    check("deliverables_image_key_check", sql`${table.imageKey} is null or ${table.imageKey} = 'deliverables/' || ${table.id} || '/display'`),
    check("deliverables_approved_check", sql`${table.status} <> 'approved' or (${table.approvedAt} is not null and ${table.approvedByUserId} is not null)`),
    check("deliverables_published_check", sql`${table.status} <> 'published' or ${table.publishedAt} is not null`),
    check("deliverables_published_post_check", sql`${table.kind} <> 'post' or ${table.status} <> 'published' or ${table.approvedAt} is not null`),
  ],
);
export type Deliverable = typeof deliverables.$inferSelect;

/** One month's report for a service, as a link staff paste in. */
export const monthlyReports = pgTable(
  "monthly_reports",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    service: text("service").$type<SetupService>().notNull(),
    /** The first day of the month the report covers. */
    month: date("month", { mode: "string" }).notNull(),
    url: text("url").notNull(),
    updatedByStaffId: text("updated_by_staff_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("monthly_reports_business_service_month_idx").on(table.businessId, table.service, table.month),
    check("monthly_reports_service_check", sql`${table.service} in ('social', 'search')`),
    check("monthly_reports_month_check", sql`extract(day from ${table.month}) = 1`),
    check("monthly_reports_url_check", sql`char_length(${table.url}) <= 500 and ${table.url} ~ '^https://'`),
  ],
);
export type MonthlyReport = typeof monthlyReports.$inferSelect;

export const SITE_EVENT_KINDS = ["call", "whatsapp", "form"] as const;
export type SiteEventKind = (typeof SITE_EVENT_KINDS)[number];

/** A call tap, a WhatsApp tap or a form sent on the customer's website. A kind and a time: nothing about the visitor. */
export const siteEvents = pgTable(
  "site_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    kind: text("kind").$type<SiteEventKind>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("site_events_business_idx").on(table.businessId, table.occurredAt),
    check("site_events_kind_check", sql`${table.kind} in ('call', 'whatsapp', 'form')`),
  ],
);
export type SiteEvent = typeof siteEvents.$inferSelect;
