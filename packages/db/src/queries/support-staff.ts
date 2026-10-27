import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Database } from "../client";
import { users } from "../schema/auth";
import { staffMembers } from "../schema/staff";
import { businesses } from "../schema/businesses";
import { isPhoneAccountEmail } from "../phone-account";
import { supportAttachments, supportCategory, supportEvents, supportMessages, supportPriority, supportStatus, supportTickets, type SupportCategory, type SupportMessage, type SupportPriority, type SupportStatus, type SupportTicket, type SupportVisibility } from "../schema/support";
import { withUserScope, type ScopedTransaction } from "../scope";
import { assertSupportSubmissionKey, assertSupportUuid, claimSupportAttachments, lockSupportSubmission, normalizeSupportAttachmentIds, supportPageLimit, supportSubmissionHash, supportText, SupportQueryError, type SupportTicketDetail } from "./support";

export interface StaffSupportListOptions {
  readonly cursor?: string; readonly limit?: number; readonly status?: SupportStatus; readonly category?: SupportCategory;
  readonly priority?: SupportPriority; readonly assigneeStaffId?: string | null; readonly search?: string;
}
export interface StaffSupportTicketPage { readonly items: SupportTicket[]; readonly nextCursor: string | null }
export async function listSupportTicketsForStaff(db: Database, options: StaffSupportListOptions = {}): Promise<StaffSupportTicketPage> {
  const limit = supportPageLimit(options.limit);
  if (options.cursor) assertSupportUuid(options.cursor, "Cursor");
  const search = options.search?.trim();
  if (search && search.length > 120) throw new SupportQueryError("invalid_input", "Search must be at most 120 characters.");
  const pattern = search ? `%${search.replaceAll(/[\\%_]/g, "\\$&")}%` : undefined;
  const rows = await db.select().from(supportTickets).where(and(
    options.cursor ? lt(supportTickets.id, options.cursor) : undefined,
    options.status ? eq(supportTickets.status, options.status) : undefined,
    options.category ? eq(supportTickets.category, options.category) : undefined,
    options.priority ? eq(supportTickets.priority, options.priority) : undefined,
    options.assigneeStaffId === null ? sql`${supportTickets.assigneeStaffId} is null` : options.assigneeStaffId ? eq(supportTickets.assigneeStaffId, options.assigneeStaffId) : undefined,
    pattern ? or(ilike(supportTickets.subject, pattern), ilike(supportTickets.displayRef, pattern)) : undefined,
  )).orderBy(desc(supportTickets.id)).limit(limit + 1);
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]?.id ?? null : null };
}
export interface StaffSupportTicketDetail extends SupportTicketDetail { readonly events: (typeof supportEvents.$inferSelect)[] }
export async function getSupportTicketForStaff(db: Database, ticketId: string): Promise<StaffSupportTicketDetail | null> {
  assertSupportUuid(ticketId, "Ticket ID");
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (!ticket) return null;
  const [messages, attachments, events] = await Promise.all([
    db.select().from(supportMessages).where(eq(supportMessages.ticketId, ticketId)).orderBy(supportMessages.id),
    db.select().from(supportAttachments).where(and(eq(supportAttachments.ticketId, ticketId), eq(supportAttachments.state, "attached"))).orderBy(supportAttachments.id),
    db.select().from(supportEvents).where(eq(supportEvents.ticketId, ticketId)).orderBy(supportEvents.id),
  ]);
  return { ticket, messages, attachments, events };
}
export async function listAssignableSupportStaff(db: Database): Promise<{ userId: string; name: string }[]> {
  return db.select({ userId: staffMembers.userId, name: users.name }).from(staffMembers).innerJoin(users, eq(staffMembers.userId, users.id)).where(eq(staffMembers.active, true)).orderBy(users.name, staffMembers.userId);
}
export interface SupportRequesterContext { readonly name: string; readonly contact: string | null; readonly businessName: string | null }
export async function getSupportRequesterContext(db: Database, ticketId: string): Promise<SupportRequesterContext | null> {
  assertSupportUuid(ticketId, "Ticket ID");
  const [row] = await db.select({ name: users.name, email: users.email, phone: users.phoneNumber, businessName: businesses.name }).from(supportTickets)
    .innerJoin(users, eq(supportTickets.requesterUserId, users.id)).leftJoin(businesses, eq(supportTickets.businessId, businesses.id)).where(eq(supportTickets.id, ticketId)).limit(1);
  return row ? { name: row.name, contact: row.phone ?? (isPhoneAccountEmail(row.email) ? null : row.email), businessName: row.businessName } : null;
}
async function assertActiveStaff(tx: ScopedTransaction, staffUserId: string): Promise<void> {
  const [staff] = await tx.select({ id: staffMembers.userId }).from(staffMembers).where(and(eq(staffMembers.userId, staffUserId), eq(staffMembers.active, true))).limit(1);
  if (!staff) throw new SupportQueryError("forbidden", "An active staff account is required.");
}
const TRANSITIONS: Readonly<Record<SupportStatus, readonly SupportStatus[]>> = {
  new: ["triaged", "in_progress", "waiting_on_you", "resolved", "closed"], triaged: ["in_progress", "waiting_on_you", "resolved", "closed"],
  in_progress: ["triaged", "waiting_on_you", "resolved", "closed"], waiting_on_you: ["triaged", "in_progress", "resolved", "closed"],
  resolved: ["triaged", "in_progress", "closed"], closed: [],
};
export interface UpdateSupportTicketByStaffInput {
  readonly staffUserId: string; readonly ticketId: string; readonly expectedVersion: number;
  readonly status?: SupportStatus; readonly priority?: SupportPriority; readonly category?: SupportCategory; readonly assigneeStaffId?: string | null;
}
export async function updateSupportTicketByStaff(db: Database, input: UpdateSupportTicketByStaffInput): Promise<SupportTicket> {
  assertSupportUuid(input.ticketId, "Ticket ID");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) throw new SupportQueryError("invalid_input", "A valid ticket version is required.");
  if (input.status && !supportStatus.enumValues.includes(input.status)) throw new SupportQueryError("invalid_input", "Invalid support status.");
  if (input.priority && !supportPriority.enumValues.includes(input.priority)) throw new SupportQueryError("invalid_input", "Invalid support priority.");
  if (input.category && !supportCategory.enumValues.includes(input.category)) throw new SupportQueryError("invalid_input", "Invalid support category.");
  return withUserScope(db, input.staffUserId, async (tx) => {
    await assertActiveStaff(tx, input.staffUserId);
    const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, input.ticketId)).for("update").limit(1);
    if (!ticket) throw new SupportQueryError("not_found", "Support ticket was not found.");
    if (ticket.retentionStartedAt !== null) throw new SupportQueryError("closed", "This old support ticket is being removed and cannot be edited.");
    if (ticket.version !== input.expectedVersion) throw new SupportQueryError("conflict", "This ticket changed. Refresh it before saving.");
    if (input.status && input.status !== ticket.status && !TRANSITIONS[ticket.status].includes(input.status)) throw new SupportQueryError("invalid_input", `Cannot change a ${ticket.status} ticket to ${input.status}.`);
    if (input.assigneeStaffId) await assertActiveStaff(tx, input.assigneeStaffId);
    const [updated] = await tx.update(supportTickets).set({ status: input.status, priority: input.priority, category: input.category, assigneeStaffId: input.assigneeStaffId, version: ticket.version + 1 }).where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.version, input.expectedVersion))).returning();
    if (!updated) throw new SupportQueryError("conflict", "This ticket changed. Refresh it before saving.");
    await tx.insert(supportEvents).values({ id: uuidv7(), ticketId: ticket.id, actorUserId: input.staffUserId, kind: "updated", data: {
      status: updated.status, previousStatus: ticket.status, priority: updated.priority, previousPriority: ticket.priority,
      category: updated.category, previousCategory: ticket.category, assigneeStaffId: updated.assigneeStaffId, previousAssigneeStaffId: ticket.assigneeStaffId,
    } });
    return updated;
  });
}
export interface AppendSupportMessageByStaffInput {
  readonly staffUserId: string; readonly ticketId: string; readonly body: string; readonly visibility: SupportVisibility;
  readonly attachmentIds?: readonly string[]; readonly submissionKey: string;
}
export async function appendSupportMessageByStaff(db: Database, input: AppendSupportMessageByStaffInput): Promise<SupportMessage> {
  return (await appendSupportMessageByStaffWithOutcome(db, input)).message;
}
/** `created` is false for a replay of a message already saved under the same submission key, so callers act on a new message only once. */
export async function appendSupportMessageByStaffWithOutcome(db: Database, input: AppendSupportMessageByStaffInput): Promise<{ readonly message: SupportMessage; readonly created: boolean }> {
  assertSupportUuid(input.ticketId, "Ticket ID"); assertSupportSubmissionKey(input.submissionKey);
  if (input.visibility !== "public" && input.visibility !== "internal") throw new SupportQueryError("invalid_input", "Invalid message visibility.");
  const body = supportText(input.body, "Message", 1, 5000), attachmentIds = normalizeSupportAttachmentIds(input.attachmentIds);
  const submissionHash = supportSubmissionHash({ ticketId: input.ticketId, body, attachmentIds, visibility: input.visibility });
  return withUserScope(db, input.staffUserId, async (tx) => {
    await assertActiveStaff(tx, input.staffUserId); await lockSupportSubmission(tx, input.staffUserId, input.submissionKey);
    const [existing] = await tx.select().from(supportMessages).where(and(eq(supportMessages.authorUserId, input.staffUserId), eq(supportMessages.submissionKey, input.submissionKey))).limit(1);
    if (existing) {
      if (existing.submissionHash !== submissionHash) throw new SupportQueryError("conflict", "This submission key was already used for a different message.");
      return { message: existing, created: false };
    }
    const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, input.ticketId)).for("update").limit(1);
    if (!ticket) throw new SupportQueryError("not_found", "Support ticket was not found.");
    if (ticket.retentionStartedAt !== null) throw new SupportQueryError("closed", "This old support ticket is being removed and cannot receive messages.");
    if (ticket.status === "closed" && input.visibility === "public") throw new SupportQueryError("closed", "This ticket is closed and cannot receive public replies.");
    const [message] = await tx.insert(supportMessages).values({ ticketId: ticket.id, authorRole: "staff", authorUserId: input.staffUserId, body, visibility: input.visibility, submissionKey: input.submissionKey, submissionHash }).returning();
    if (!message) throw new SupportQueryError("conflict", "The staff message could not be created.");
    await claimSupportAttachments(tx, input.staffUserId, ticket.id, message.id, attachmentIds);
    return { message, created: true };
  });
}
