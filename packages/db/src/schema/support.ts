import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { staffMembers } from "./staff";

export const supportCategory = pgEnum("support_category", ["bug", "support", "feature", "billing", "website_change", "account_access", "general", "other"]);
export const supportStatus = pgEnum("support_status", ["new", "triaged", "in_progress", "waiting_on_you", "resolved", "closed"]);
export const supportPriority = pgEnum("support_priority", ["low", "normal", "high", "urgent"]);
export const supportVisibility = pgEnum("support_visibility", ["public", "internal"]);
export const supportAuthorRole = pgEnum("support_author_role", ["customer", "staff"]);
export const supportAttachmentState = pgEnum("support_attachment_state", ["staged", "attached", "deleting", "deleted"]);
export type SupportCategory = (typeof supportCategory.enumValues)[number];
export type SupportStatus = (typeof supportStatus.enumValues)[number];
export type SupportPriority = (typeof supportPriority.enumValues)[number];
export type SupportVisibility = (typeof supportVisibility.enumValues)[number];
export interface SupportDetails {
  readonly pageUrl?: string; readonly stepsToReproduce?: string; readonly expectedBehavior?: string;
  readonly actualBehavior?: string; readonly browserDevice?: string; readonly invoiceReference?: string;
  readonly requestedChange?: string; readonly accountEmail?: string;
}

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  displayRef: text("display_ref").notNull().unique(),
  requesterUserId: text("requester_user_id").notNull().references(() => users.id),
  businessId: uuid("business_id").references(() => businesses.id),
  category: supportCategory("category").notNull(), subject: text("subject").notNull(),
  status: supportStatus("status").notNull().default("new"),
  priority: supportPriority("priority").notNull().default("normal"),
  assigneeStaffId: text("assignee_staff_id").references(() => staffMembers.userId),
  version: integer("version").notNull().default(1),
  submissionKey: text("submission_key").notNull(), submissionHash: text("submission_hash").notNull(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  retentionStartedAt: timestamp("retention_started_at", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  unique("support_tickets_requester_submission_unique").on(t.requesterUserId, t.submissionKey),
  index("support_tickets_requester_id_idx").on(t.requesterUserId, t.id),
  index("support_tickets_queue_idx").on(t.status, t.id),
  index("support_tickets_status_activity_idx").on(t.status, t.lastActivityAt),
  index("support_tickets_category_id_idx").on(t.category, t.id),
  index("support_tickets_assignee_idx").on(t.assigneeStaffId, t.status),
  check("support_tickets_subject_check", sql`length(btrim(${t.subject})) between 3 and 120 and ${t.subject} = btrim(${t.subject})`),
  check("support_tickets_version_check", sql`${t.version} > 0`),
  check("support_tickets_submission_key_check", sql`${t.submissionKey} ~ '^[A-Za-z0-9_-]{8,128}$'`),
  check("support_tickets_submission_hash_check", sql`${t.submissionHash} ~ '^[0-9a-f]{64}$'`),
]);

export const supportMessages = pgTable("support_messages", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id),
  visibility: supportVisibility("visibility").notNull().default("public"),
  authorRole: supportAuthorRole("author_role").notNull(),
  authorUserId: text("author_user_id").notNull().references(() => users.id),
  body: text("body").notNull(), details: jsonb("details").$type<SupportDetails>(),
  submissionKey: text("submission_key").notNull(), submissionHash: text("submission_hash").notNull(),
  createdAt: createdAt(),
}, (t) => [
  unique("support_messages_id_ticket_unique").on(t.id, t.ticketId),
  unique("support_messages_author_submission_unique").on(t.authorUserId, t.submissionKey),
  index("support_messages_ticket_id_idx").on(t.ticketId, t.id),
  check("support_messages_body_check", sql`length(btrim(${t.body})) between 1 and 5000 and ${t.body} = btrim(${t.body})`),
  check("support_messages_customer_public_check", sql`${t.authorRole} <> 'customer' or ${t.visibility} = 'public'`),
  check("support_messages_submission_key_check", sql`${t.submissionKey} ~ '^[A-Za-z0-9_-]{8,128}$'`),
  check("support_messages_submission_hash_check", sql`${t.submissionHash} ~ '^[0-9a-f]{64}$'`),
  check("support_messages_details_check", sql`${t.details} is null or (jsonb_typeof(${t.details}) = 'object' and octet_length(${t.details}::text) <= 8192)`),
]);

export const supportAttachments = pgTable("support_attachments", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => users.id),
  ticketId: uuid("ticket_id").references(() => supportTickets.id), messageId: uuid("message_id"),
  storageKey: text("storage_key").notNull().unique(), filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(), byteSize: integer("byte_size").notNull(),
  width: integer("width"), height: integer("height"), sha256: text("sha256").notNull(),
  state: supportAttachmentState("state").notNull().default("staged"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ name: "support_attachments_message_ticket_fk", columns: [t.messageId, t.ticketId], foreignColumns: [supportMessages.id, supportMessages.ticketId] }),
  index("support_attachments_message_idx").on(t.messageId), index("support_attachments_expiry_idx").on(t.state, t.expiresAt),
  check("support_attachments_association_check", sql`(${t.ticketId} is null) = (${t.messageId} is null) and (${t.state} <> 'attached' or ${t.messageId} is not null) and (${t.state} <> 'staged' or ${t.messageId} is null)`),
  check("support_attachments_size_check", sql`${t.byteSize} between 1 and 4194304`),
  check("support_attachments_image_check", sql`${t.mimeType} in ('image/png', 'image/jpeg', 'image/webp') and ${t.width} is not null and ${t.height} is not null and ${t.width} between 1 and 12000 and ${t.height} between 1 and 12000 and ${t.width}::bigint * ${t.height}::bigint <= 16000000`),
  check("support_attachments_hash_check", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  check("support_attachments_filename_check", sql`length(${t.filename}) between 1 and 255`),
  check("support_attachments_key_check", sql`${t.storageKey} ~ '^support/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`),
]);

export const supportEvents = pgTable("support_events", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id),
  actorUserId: text("actor_user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(), data: jsonb("data").$type<Readonly<Record<string, string | number | null>>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("support_events_ticket_idx").on(t.ticketId, t.id), check("support_events_kind_check", sql`${t.kind} in ('created', 'message_added', 'updated', 'reopened')`)]);

export const supportReadStates = pgTable("support_read_states", {
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id),
  userId: text("user_id").notNull().references(() => users.id),
  lastReadMessageId: uuid("last_read_message_id").notNull(), updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ columns: [t.ticketId, t.userId] }),
  foreignKey({ name: "support_read_states_message_ticket_fk", columns: [t.lastReadMessageId, t.ticketId], foreignColumns: [supportMessages.id, supportMessages.ticketId] }),
]);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type SupportAttachment = typeof supportAttachments.$inferSelect;
