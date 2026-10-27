import { createHash } from "node:crypto";
import { and, count, desc, eq, gt, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Database } from "../client";
import { isChangeKind, type ChangeKind } from "../change-states";
import { businessMembers } from "../schema/businesses";
import { accountClosures } from "../schema/account-closures";
import { supportAttachments, supportCategory, supportMessages, supportReadStates, supportTickets, type SupportAttachment, type SupportCategory, type SupportDetails, type SupportMessage, type SupportStatus, type SupportTicket } from "../schema/support";
import { withUserScope, type ScopedTransaction } from "../scope";

export type { SupportAttachment, SupportCategory, SupportDetails, SupportMessage, SupportStatus, SupportTicket } from "../schema/support";
export type SupportRunner = Database | ScopedTransaction;
async function supportUserScope<T>(db: SupportRunner, userId: string, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  if (userId.trim() === "") throw new SupportQueryError("invalid_input", "A support user ID is required.");
  return db.transaction(async (tx) => { await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`); return work(tx); });
}
export async function lockSupportUser(tx: ScopedTransaction, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`support-user:${userId}`}, 0))`);
}
export async function withSupportUploadLock<T>(db: Database, userId: string, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withUserScope(db, userId, async (tx) => { await lockSupportUser(tx, userId); return work(tx); });
}
export class SupportQueryError extends Error {
  constructor(readonly code: "invalid_input" | "not_found" | "conflict" | "closed" | "invalid_attachment" | "forbidden", message: string) {
    super(message); this.name = "SupportQueryError";
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAILS_LIMITS: Readonly<Record<keyof SupportDetails, number>> = { pageUrl: 2048, stepsToReproduce: 2000, expectedBehavior: 2000, actualBehavior: 2000, browserDevice: 200, invoiceReference: 200, requestedChange: 2000, accountEmail: 254 };

export function assertSupportUuid(value: string, field: string): void {
  if (!UUID.test(value)) throw new SupportQueryError("invalid_input", `${field} must be a UUID.`);
}
export function supportText(value: string, field: string, min: number, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(trimmed)) throw new SupportQueryError("invalid_input", `${field} must contain ${min} to ${max} characters without control characters.`);
  return trimmed;
}
export function assertSupportSubmissionKey(key: string): void {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new SupportQueryError("invalid_input", "Invalid submission key.");
}
export function normalizeSupportAttachmentIds(ids: readonly string[] = []): string[] {
  if (ids.length > 3 || new Set(ids).size !== ids.length) throw new SupportQueryError("invalid_attachment", "Choose up to three distinct attachments.");
  for (const id of ids) assertSupportUuid(id, "Attachment ID");
  return [...ids].sort();
}
function normalizeDetails(details: SupportDetails | undefined): SupportDetails | null {
  if (!details) return null;
  const normalized: Record<string, string> = {};
  for (const key of Object.keys(details).sort()) {
    if (!(key in DETAILS_LIMITS)) throw new SupportQueryError("invalid_input", `Unknown support detail: ${key}.`);
    const value = details[key as keyof SupportDetails];
    if (typeof value !== "string") throw new SupportQueryError("invalid_input", `Invalid support detail: ${key}.`);
    const trimmed = supportText(value, key, 0, DETAILS_LIMITS[key as keyof SupportDetails]);
    if (trimmed !== "") normalized[key] = trimmed;
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 8000) throw new SupportQueryError("invalid_input", "Keep structured support details within 8 KiB.");
  return Object.keys(normalized).length === 0 ? null : normalized;
}
export function supportSubmissionHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
export async function lockSupportSubmission(tx: ScopedTransaction, userId: string, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`support:${userId}:${key}`}, 0))`);
}
export async function claimSupportAttachments(tx: ScopedTransaction, userId: string, ticketId: string, messageId: string, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    const rows = await tx.update(supportAttachments).set({ state: "attached", ticketId, messageId }).where(and(
      eq(supportAttachments.id, id), eq(supportAttachments.uploadedByUserId, userId), eq(supportAttachments.state, "staged"), gt(supportAttachments.expiresAt, sql`now()`),
    )).returning({ id: supportAttachments.id });
    if (rows.length !== 1) throw new SupportQueryError("invalid_attachment", "An attachment is unavailable, expired, or already used.");
  }
}

export interface CreateSupportTicketInput {
  readonly userId: string; readonly businessId?: string | null; readonly category: SupportCategory;
  readonly subject: string; readonly description: string; readonly details?: SupportDetails;
  readonly attachmentIds?: readonly string[]; readonly submissionKey: string;
  /** Makes the ticket a request for a change (migration 0190): needs a business. Without it the ticket is a plain question. */
  readonly changeRequest?: { readonly kind: ChangeKind; readonly page?: string | null };
}
/** The page a change is about, in the customer's words: trimmed, up to 200 characters, or null when left empty. */
function changePage(page: string | null | undefined): string | null {
  const trimmed = supportText(page ?? "", "Page", 0, 200);
  return trimmed === "" ? null : trimmed;
}
export async function createSupportTicket(db: Database, input: CreateSupportTicketInput): Promise<SupportTicket> {
  return (await createSupportTicketWithOutcome(db, input)).ticket;
}
/** `created` is false when the submission key was already used by the same request, so callers act on a new ticket only once. */
export async function createSupportTicketWithOutcome(db: Database, input: CreateSupportTicketInput): Promise<{ readonly ticket: SupportTicket; readonly created: boolean }> {
  assertSupportSubmissionKey(input.submissionKey);
  if (!supportCategory.enumValues.includes(input.category)) throw new SupportQueryError("invalid_input", "Invalid support category.");
  const subject = supportText(input.subject, "Subject", 3, 120), description = supportText(input.description, "Description", 10, 5000);
  const details = normalizeDetails(input.details), attachmentIds = normalizeSupportAttachmentIds(input.attachmentIds);
  const businessId = input.businessId ?? null;
  if (businessId !== null) assertSupportUuid(businessId, "Business ID");
  const changeRequest = input.changeRequest === undefined ? null : { kind: input.changeRequest.kind, page: changePage(input.changeRequest.page) };
  if (changeRequest !== null && (!isChangeKind(changeRequest.kind) || businessId === null)) throw new SupportQueryError("invalid_input", "A change request needs a kind and a business.");
  // The change details join the hash only when present, so a plain ticket's hash is what it always was.
  const submissionHash = supportSubmissionHash({ category: input.category, subject, description, details, attachmentIds, businessId, ...(changeRequest === null ? {} : { changeRequest }) });
  return withUserScope(db, input.userId, async (tx) => {
    await lockSupportSubmission(tx, input.userId, input.submissionKey);
    const [existing] = await tx.select().from(supportTickets).where(and(eq(supportTickets.requesterUserId, input.userId), eq(supportTickets.submissionKey, input.submissionKey))).limit(1);
    if (existing) {
      if (existing.submissionHash !== submissionHash) throw new SupportQueryError("conflict", "This submission key was already used for different feedback.");
      return { ticket: existing, created: false };
    }
    if (businessId !== null) {
      const membership = await tx.select({ id: businessMembers.businessId }).from(businessMembers).where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, input.userId))).limit(1);
      if (membership.length === 0) throw new SupportQueryError("forbidden", "The selected business does not belong to your account.");
    }
    const id = uuidv7();
    const [ticket] = await tx.insert(supportTickets).values({ id, displayRef: `FY-${id.replaceAll("-", "").toUpperCase()}`, requesterUserId: input.userId, businessId, category: input.category, subject, submissionKey: input.submissionKey, submissionHash }).returning();
    if (!ticket) throw new SupportQueryError("conflict", "The support ticket could not be created.");
    const [message] = await tx.insert(supportMessages).values({ ticketId: id, authorRole: "customer", authorUserId: input.userId, body: description, details, submissionKey: input.submissionKey, submissionHash }).returning();
    if (!message) throw new SupportQueryError("conflict", "The initial support message could not be created.");
    await claimSupportAttachments(tx, input.userId, id, message.id, attachmentIds);
    if (changeRequest !== null) await tx.execute(sql`select create_change_request(${id}::uuid, ${changeRequest.kind}, ${changeRequest.page})`);
    const [result] = await tx.select().from(supportTickets).where(eq(supportTickets.id, id));
    if (!result) throw new SupportQueryError("not_found", "The newly created support ticket was not found.");
    return { ticket: result, created: true };
  });
}

export interface SupportTicketListOptions { readonly cursor?: string; readonly limit?: number; readonly status?: SupportStatus }
export interface SupportTicketListItem extends SupportTicket { readonly unread: boolean }
export interface SupportTicketPage { readonly items: SupportTicketListItem[]; readonly nextCursor: string | null }
export function supportPageLimit(limit = 25): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new SupportQueryError("invalid_input", "Support page size must be between 1 and 25.");
  return limit;
}
export function unreadCondition(userId: string): SQL {
  return sql`exists (select 1 from ${supportMessages} m where m.ticket_id = ${supportTickets.id} and m.author_role = 'staff' and m.visibility = 'public' and m.id > coalesce((select r.last_read_message_id from ${supportReadStates} r where r.ticket_id = ${supportTickets.id} and r.user_id = ${userId}), '00000000-0000-0000-0000-000000000000'::uuid))`;
}
export async function listSupportTickets(db: Database, userId: string, options: SupportTicketListOptions = {}): Promise<SupportTicketPage> {
  const limit = supportPageLimit(options.limit);
  if (options.cursor) assertSupportUuid(options.cursor, "Cursor");
  return withUserScope(db, userId, async (tx) => {
    const rows = await tx.select({ ticket: supportTickets, unread: sql<boolean>`${unreadCondition(userId)}` }).from(supportTickets).where(and(
      eq(supportTickets.requesterUserId, userId), options.cursor ? lt(supportTickets.id, options.cursor) : undefined, options.status ? eq(supportTickets.status, options.status) : undefined,
    )).orderBy(desc(supportTickets.id)).limit(limit + 1);
    return { items: rows.slice(0, limit).map((r) => ({ ...r.ticket, unread: r.unread })), nextCursor: rows.length > limit ? rows[limit - 1]?.ticket.id ?? null : null };
  });
}
export interface SupportTicketDetail { readonly ticket: SupportTicket; readonly messages: SupportMessage[]; readonly attachments: SupportAttachment[] }
export async function getSupportTicket(db: Database, userId: string, ticketId: string): Promise<SupportTicketDetail | null> {
  assertSupportUuid(ticketId, "Ticket ID");
  return withUserScope(db, userId, async (tx) => {
    const [ticket] = await tx.select().from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.requesterUserId, userId))).limit(1);
    if (!ticket) return null;
    const messages = await tx.select().from(supportMessages).where(and(eq(supportMessages.ticketId, ticketId), eq(supportMessages.visibility, "public"))).orderBy(supportMessages.id);
    const attachments = await tx.select().from(supportAttachments).where(and(eq(supportAttachments.ticketId, ticketId), eq(supportAttachments.state, "attached"))).orderBy(supportAttachments.id);
    return { ticket, messages, attachments };
  });
}
export async function getSupportUnreadCount(db: Database, userId: string): Promise<number> {
  return withUserScope(db, userId, async (tx) => {
    const [row] = await tx.select({ n: count() }).from(supportTickets).where(and(eq(supportTickets.requesterUserId, userId), unreadCondition(userId)));
    return row?.n ?? 0;
  });
}
export interface AppendSupportReplyInput { readonly userId: string; readonly ticketId: string; readonly body: string; readonly attachmentIds?: readonly string[]; readonly submissionKey: string }
export async function appendSupportReply(db: Database, input: AppendSupportReplyInput): Promise<SupportMessage> {
  return (await appendSupportReplyWithOutcome(db, input)).message;
}
/** `created` is false for a replay of a reply that was already saved under the same submission key. */
export async function appendSupportReplyWithOutcome(db: Database, input: AppendSupportReplyInput): Promise<{ readonly message: SupportMessage; readonly created: boolean }> {
  assertSupportUuid(input.ticketId, "Ticket ID"); assertSupportSubmissionKey(input.submissionKey);
  const body = supportText(input.body, "Reply", 1, 5000), attachmentIds = normalizeSupportAttachmentIds(input.attachmentIds);
  const submissionHash = supportSubmissionHash({ ticketId: input.ticketId, body, attachmentIds, visibility: "public" });
  return withUserScope(db, input.userId, async (tx) => {
    await lockSupportSubmission(tx, input.userId, input.submissionKey);
    const [existing] = await tx.select().from(supportMessages).where(and(eq(supportMessages.authorUserId, input.userId), eq(supportMessages.submissionKey, input.submissionKey))).limit(1);
    if (existing) {
      if (existing.submissionHash !== submissionHash) throw new SupportQueryError("conflict", "This submission key was already used for a different reply.");
      return { message: existing, created: false };
    }
    const [ticket] = await tx.select().from(supportTickets).where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.requesterUserId, input.userId))).limit(1);
    if (!ticket) throw new SupportQueryError("not_found", "Support ticket was not found.");
    if (ticket.retentionStartedAt !== null) throw new SupportQueryError("closed", "This old support ticket is being removed and cannot receive replies.");
    if (ticket.status === "closed") throw new SupportQueryError("closed", "This support ticket is closed and cannot receive replies.");
    const [message] = await tx.insert(supportMessages).values({ ticketId: input.ticketId, authorRole: "customer", authorUserId: input.userId, body, submissionKey: input.submissionKey, submissionHash }).returning();
    if (!message) throw new SupportQueryError("conflict", "The support reply could not be created.");
    await claimSupportAttachments(tx, input.userId, input.ticketId, message.id, attachmentIds);
    return { message, created: true };
  });
}
export async function markSupportTicketRead(db: Database, userId: string, ticketId: string, messageId: string): Promise<void> {
  assertSupportUuid(ticketId, "Ticket ID"); assertSupportUuid(messageId, "Message ID");
  await withUserScope(db, userId, async (tx) => {
    const [message] = await tx.select({ id: supportMessages.id }).from(supportMessages).where(and(eq(supportMessages.id, messageId), eq(supportMessages.ticketId, ticketId), eq(supportMessages.visibility, "public"))).limit(1);
    if (!message) throw new SupportQueryError("not_found", "The displayed public message was not found.");
    await tx.insert(supportReadStates).values({ userId, ticketId, lastReadMessageId: messageId }).onConflictDoUpdate({ target: [supportReadStates.ticketId, supportReadStates.userId], set: { lastReadMessageId: sql`greatest(${supportReadStates.lastReadMessageId}, ${messageId}::uuid)`, updatedAt: new Date() } });
  });
}

export interface StageSupportAttachmentInput {
  readonly id: string; readonly userId: string; readonly storageKey: string; readonly filename: string; readonly mimeType: string;
  readonly byteSize: number; readonly width: number | null; readonly height: number | null; readonly sha256: string; readonly expiresAt: Date;
}
export async function stageSupportAttachment(db: SupportRunner, input: StageSupportAttachmentInput): Promise<SupportAttachment> {
  assertSupportUuid(input.id, "Attachment ID");
  if (!/^support\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.storageKey) || !input.storageKey.endsWith(`/${input.id}`)) throw new SupportQueryError("invalid_attachment", "Invalid private attachment storage key.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(input.mimeType) || !Number.isInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > 4194304) throw new SupportQueryError("invalid_attachment", "Screenshots must be PNG, JPEG, or WebP and at most 4 MiB.");
  if (input.width === null || input.height === null || !Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1 || input.width > 12000 || input.height > 12000 || input.width * input.height > 16000000) throw new SupportQueryError("invalid_attachment", "Invalid screenshot dimensions.");
  if (!/^[0-9a-f]{64}$/.test(input.sha256) || !Number.isFinite(input.expiresAt.getTime()) || input.expiresAt.getTime() <= Date.now() || input.expiresAt.getTime() > Date.now() + 86400000) throw new SupportQueryError("invalid_attachment", "Invalid screenshot hash or expiry.");
  const filename = supportText(input.filename, "Filename", 1, 255).replaceAll(/[/\\]/g, "_");
  return supportUserScope(db, input.userId, async (tx) => {
    const [row] = await tx.insert(supportAttachments).values({ ...input, uploadedByUserId: input.userId, filename }).returning();
    if (!row) throw new SupportQueryError("invalid_attachment", "The screenshot could not be staged.");
    return row;
  });
}
export async function getSupportAttachmentForUser(db: Database, userId: string, attachmentId: string): Promise<SupportAttachment | null> {
  assertSupportUuid(attachmentId, "Attachment ID");
  return withUserScope(db, userId, async (tx) => {
    const rows = await tx.select({ attachment: supportAttachments }).from(supportAttachments).innerJoin(supportMessages, and(eq(supportAttachments.messageId, supportMessages.id), eq(supportMessages.visibility, "public"))).innerJoin(supportTickets, eq(supportAttachments.ticketId, supportTickets.id)).where(and(eq(supportAttachments.id, attachmentId), eq(supportAttachments.state, "attached"), eq(supportTickets.requesterUserId, userId))).limit(1);
    return rows[0]?.attachment ?? null;
  });
}
export async function getSupportAttachmentForStaff(db: Database, attachmentId: string): Promise<SupportAttachment | null> {
  assertSupportUuid(attachmentId, "Attachment ID");
  const [row] = await db.select().from(supportAttachments).where(and(eq(supportAttachments.id, attachmentId), eq(supportAttachments.state, "attached"))).limit(1);
  return row ?? null;
}
/** Staff connection after object upload: a concurrent erasure/deletion must not leave an orphaned object. */
export async function confirmSupportAttachmentUpload(db: SupportRunner, userId: string, attachmentId: string): Promise<boolean> {
  assertSupportUuid(attachmentId, "Attachment ID");
  const [row] = await db.select({ id: supportAttachments.id }).from(supportAttachments).where(and(
    eq(supportAttachments.id, attachmentId), eq(supportAttachments.uploadedByUserId, userId),
    eq(supportAttachments.state, "staged"), gt(supportAttachments.expiresAt, sql`now()`),
    sql`not exists (select 1 from ${accountClosures} c where c.user_id = ${userId} and c.restored_at is null)`,
  )).limit(1);
  return row !== undefined;
}
export async function getStagedSupportAttachment(db: Database, userId: string, attachmentId: string): Promise<SupportAttachment | null> {
  assertSupportUuid(attachmentId, "Attachment ID");
  return withUserScope(db, userId, async (tx) => {
    const [row] = await tx.select().from(supportAttachments).where(and(eq(supportAttachments.id, attachmentId), eq(supportAttachments.uploadedByUserId, userId), inArray(supportAttachments.state, ["staged", "deleting"]), isNull(supportAttachments.messageId))).limit(1);
    return row ?? null;
  });
}
export async function markSupportAttachmentDeleted(db: SupportRunner, userId: string, attachmentId: string): Promise<boolean> {
  assertSupportUuid(attachmentId, "Attachment ID");
  return supportUserScope(db, userId, async (tx) => (await tx.update(supportAttachments).set({ state: "deleting" }).where(and(eq(supportAttachments.id, attachmentId), eq(supportAttachments.uploadedByUserId, userId), inArray(supportAttachments.state, ["staged", "deleting"]), isNull(supportAttachments.messageId))).returning({ id: supportAttachments.id })).length > 0);
}
export async function listExpiredSupportAttachments(db: Database, now: Date, limit = 100): Promise<SupportAttachment[]> {
  return db.select().from(supportAttachments).where(and(eq(supportAttachments.state, "staged"), lt(supportAttachments.expiresAt, now))).orderBy(supportAttachments.expiresAt).limit(cleanupLimit(limit));
}
function cleanupLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new SupportQueryError("invalid_input", "Cleanup limit must be between 1 and 1000.");
  return limit;
}
export async function claimExpiredSupportAttachments(db: Database, now: Date, limit = 100): Promise<SupportAttachment[]> {
  return db.transaction(async (tx) => {
    const rows = await tx.select({ id: supportAttachments.id }).from(supportAttachments).where(and(eq(supportAttachments.state, "staged"), lt(supportAttachments.expiresAt, now))).orderBy(supportAttachments.expiresAt).limit(cleanupLimit(limit)).for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    return tx.update(supportAttachments).set({ state: "deleting" }).where(inArray(supportAttachments.id, rows.map((r) => r.id))).returning();
  });
}
export async function listDeletingSupportAttachments(db: Database, limit = 100): Promise<SupportAttachment[]> {
  return db.select().from(supportAttachments).where(eq(supportAttachments.state, "deleting")).orderBy(supportAttachments.updatedAt).limit(cleanupLimit(limit));
}
export async function markSupportAttachmentPurged(db: Database, attachmentId: string): Promise<void> {
  assertSupportUuid(attachmentId, "Attachment ID");
  await db.update(supportAttachments).set({ state: "deleted" }).where(and(eq(supportAttachments.id, attachmentId), eq(supportAttachments.state, "deleting")));
}
/** Mark first, delete objects next, and only then erase support rows inside the account erasure transaction. */
export async function beginSupportAccountErasure(db: Database, userId: string): Promise<SupportAttachment[]> {
  return db.transaction(async (tx) => {
    await lockSupportUser(tx, userId);
    const [closure] = await tx.select({ id: accountClosures.id }).from(accountClosures).where(and(eq(accountClosures.userId, userId), isNull(accountClosures.restoredAt), isNull(accountClosures.erasedAt))).limit(1);
    if (!closure) throw new SupportQueryError("forbidden", "Support erasure requires an open account closure.");
    const belongs = sql`(${supportAttachments.uploadedByUserId} = ${userId} or exists (select 1 from ${supportTickets} t where t.id = ${supportAttachments.ticketId} and t.requester_user_id = ${userId}))`;
    await tx.update(supportAttachments).set({ state: "deleting" }).where(and(belongs, inArray(supportAttachments.state, ["staged", "attached"])));
    return tx.select().from(supportAttachments).where(and(belongs, eq(supportAttachments.state, "deleting"))).orderBy(supportAttachments.id);
  });
}
export async function eraseSupportDataForUser(tx: ScopedTransaction, userId: string): Promise<void> {
  await lockSupportUser(tx, userId);
  await tx.execute(sql`select erase_support_data_for_user(${userId})`);
}
export interface SupportRetentionClaim { readonly ticketIds: string[]; readonly attachments: SupportAttachment[] }
export async function claimSupportTicketsDueRetention(db: Database, cutoff: Date, limit = 100): Promise<SupportRetentionClaim> {
  if (!Number.isFinite(cutoff.getTime()) || cutoff.getTime() > Date.now()) throw new SupportQueryError("invalid_input", "A past support retention cutoff is required.");
  return db.transaction(async (tx) => {
    const tickets = await tx.select().from(supportTickets).where(and(eq(supportTickets.status, "closed"), lt(supportTickets.updatedAt, cutoff))).orderBy(supportTickets.updatedAt, supportTickets.id).limit(cleanupLimit(limit)).for("update", { skipLocked: true });
    if (tickets.length === 0) return { ticketIds: [], attachments: [] };
    const ticketIds = tickets.map((ticket) => ticket.id);
    for (const ticket of tickets) {
      if (ticket.retentionStartedAt === null) await tx.update(supportTickets).set({ retentionStartedAt: new Date(), version: ticket.version + 1, updatedAt: ticket.updatedAt }).where(eq(supportTickets.id, ticket.id));
    }
    await tx.update(supportAttachments).set({ state: "deleting" }).where(and(inArray(supportAttachments.ticketId, ticketIds), inArray(supportAttachments.state, ["staged", "attached"])));
    const attachments = await tx.select().from(supportAttachments).where(and(inArray(supportAttachments.ticketId, ticketIds), eq(supportAttachments.state, "deleting"))).orderBy(supportAttachments.id);
    return { ticketIds, attachments };
  });
}
export async function finalizeSupportTicketRetention(db: Database, ticketIds: readonly string[]): Promise<number> {
  if (ticketIds.length > 1000) throw new SupportQueryError("invalid_input", "Retain support tickets in batches of at most 1000.");
  for (const id of ticketIds) assertSupportUuid(id, "Ticket ID");
  return db.transaction(async (tx) => {
    let purged = 0;
    for (const id of new Set(ticketIds)) {
      const result = await tx.execute<{ purged: boolean }>(sql`select purge_retained_support_ticket(${id}::uuid) as purged`);
      if (result.rows[0]?.purged) purged++;
    }
    return purged;
  });
}
