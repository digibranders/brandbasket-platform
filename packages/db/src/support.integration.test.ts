import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users, businesses, businessMembers, staffMembers, accountClosures } from "./schema";
import { supportAttachments, supportMessages, supportTickets } from "./schema/support";
import { appendSupportReply, appendSupportReplyWithOutcome, beginSupportAccountErasure, claimSupportTicketsDueRetention, createSupportTicket, createSupportTicketWithOutcome, eraseSupportDataForUser, finalizeSupportTicketRetention, getSupportTicket, getSupportUnreadCount, markSupportAttachmentPurged, markSupportTicketRead, stageSupportAttachment } from "./queries/support";
import {
  appendSupportMessageByStaff,
  appendSupportMessageByStaffWithOutcome,
  countSupportTicketsAwaitingStaff,
  listSupportTicketsForStaff,
  updateSupportTicketByStaff,
} from "./queries/support-staff";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";
import { withUserScope } from "./scope";

let dbs: TestDatabases;
let businessId = "";
const USER = "support-user", OTHER = "support-other", STAFF = "support-staff";
const input = { userId: USER, category: "bug" as const, subject: "Saving failed", description: "The save button returns an error.", submissionKey: "submission-123456" };

beforeAll(async () => {
  dbs = openTestDatabases();
  const result = await dbs.owner.db.execute<{ name: string }>(sql`select current_database() as name`);
  if (!result.rows[0]?.name.endsWith("_test")) throw new Error("Support integration tests require a *_test database.");
});
afterAll(async () => { await dbs?.closeAll(); });
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: USER, name: "Requester", email: "requester@support.test" },
    { id: OTHER, name: "Other", email: "other@support.test" },
    { id: STAFF, name: "Staff", email: "staff@support.test" },
  ]);
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF });
  const [business] = await dbs.staff.db.insert(businesses).values({ slug: "support-test-business", name: "Support business" }).returning();
  if (!business) throw new Error("Support test business was not seeded.");
  businessId = business.id;
  await dbs.staff.db.insert(businessMembers).values({ userId: OTHER, businessId, role: "owner" });
});

describe("support ownership and lifecycle under real database roles", () => {
  it("creates tickets for users without businesses and retries exactly once", async () => {
    const ticket = await createSupportTicket(dbs.app.db, input);
    expect(ticket.businessId).toBeNull();
    expect((await createSupportTicket(dbs.app.db, input)).id).toBe(ticket.id);
    await expect(createSupportTicket(dbs.app.db, { ...input, subject: "Different subject" })).rejects.toThrow(/submission key/i);
    expect((await getSupportTicket(dbs.app.db, USER, ticket.id))?.messages).toHaveLength(1);
    expect(await getSupportTicket(dbs.app.db, OTHER, ticket.id)).toBeNull();
    expect(await captureErrorText(dbs.publicRole.db.select().from(supportTickets))).toMatch(/permission denied/);
  });
  it("tells a first submission from a replay, for tickets and for replies", async () => {
    const first = await createSupportTicketWithOutcome(dbs.app.db, input);
    const replay = await createSupportTicketWithOutcome(dbs.app.db, input);
    expect([first.created, replay.created]).toEqual([true, false]);
    expect(replay.ticket.id).toBe(first.ticket.id);
    const reply = { userId: USER, ticketId: first.ticket.id, body: "Another detail.", submissionKey: "outcome-reply-1234" };
    const sent = await appendSupportReplyWithOutcome(dbs.app.db, reply);
    const sentAgain = await appendSupportReplyWithOutcome(dbs.app.db, reply);
    expect([sent.created, sentAgain.created]).toEqual([true, false]);
    expect(sentAgain.message.id).toBe(sent.message.id);
  });
  it("serializes concurrent retries and rejects changed reply payloads", async () => {
    const tickets = await Promise.all([createSupportTicket(dbs.app.db, input), createSupportTicket(dbs.app.db, input)]);
    expect(tickets[0]?.id).toBe(tickets[1]?.id);
    const ticketId = tickets[0]?.id ?? "";
    const reply = { userId: USER, ticketId, body: "I can provide further details.", submissionKey: "concurrent-reply-1234" };
    const messages = await Promise.all([appendSupportReply(dbs.app.db, reply), appendSupportReply(dbs.app.db, reply)]);
    expect(messages[0]?.id).toBe(messages[1]?.id);
    await expect(appendSupportReply(dbs.app.db, { ...reply, body: "A different reply" })).rejects.toThrow(/submission key/i);
  });
  it("rejects forged business associations at query and database boundaries", async () => {
    await expect(createSupportTicket(dbs.app.db, { ...input, businessId })).rejects.toThrow(/business/i);
    expect(await captureErrorText(withUserScope(dbs.app.db, USER, (tx) => tx.insert(supportTickets).values({
      requesterUserId: USER, businessId, category: "bug", subject: input.subject, submissionKey: input.submissionKey,
      submissionHash: "a".repeat(64), displayRef: "FY-TEST-1",
    })))).toMatch(/business|row-level security/i);
  });
  it("hides internal messages and their attachments, while counting only public staff replies", async () => {
    const ticket = await createSupportTicket(dbs.app.db, input);
    const internalAttachmentId = "019c81e2-4436-7abb-9523-56603dc2a010";
    await stageSupportAttachment(dbs.staff.db, { id: internalAttachmentId, userId: STAFF, storageKey: `support/019c81e2-4436-7abb-9523-56603dc2a007/${internalAttachmentId}`, filename: "internal.png", mimeType: "image/png", byteSize: 1200, width: 100, height: 100, sha256: "c".repeat(64), expiresAt: new Date(Date.now() + 60_000) });
    await appendSupportMessageByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: ticket.id, body: "Private staff investigation", visibility: "internal", submissionKey: "internal-note-1234", attachmentIds: [internalAttachmentId] });
    expect(await getSupportUnreadCount(dbs.app.db, USER)).toBe(0);
    expect((await getSupportTicket(dbs.app.db, USER, ticket.id))?.attachments).toEqual([]);
    expect(await withUserScope(dbs.app.db, USER, (tx) => tx.select().from(supportAttachments))).toEqual([]);
    expect(await dbs.staff.db.select().from(supportAttachments)).toHaveLength(1);
    const reply = await appendSupportMessageByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: ticket.id, body: "We have reproduced the issue.", visibility: "public", submissionKey: "staff-reply-1234" });
    expect((await getSupportTicket(dbs.app.db, USER, ticket.id))?.messages).toHaveLength(2);
    expect(await getSupportUnreadCount(dbs.app.db, USER)).toBe(1);
    await markSupportTicketRead(dbs.app.db, USER, ticket.id, reply.id);
    expect(await getSupportUnreadCount(dbs.app.db, USER)).toBe(0);
    const raw = await withUserScope(dbs.app.db, USER, (tx) => tx.select().from(supportMessages));
    expect(raw.every((message) => message.visibility === "public")).toBe(true);
  });
  it("guards staff edits with a version and reopens customer replies atomically", async () => {
    const ticket = await createSupportTicket(dbs.app.db, input);
    const waiting = await updateSupportTicketByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: ticket.id, expectedVersion: ticket.version, status: "waiting_on_you" });
    await expect(updateSupportTicketByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: ticket.id, expectedVersion: ticket.version, status: "resolved" })).rejects.toThrow(/changed/i);
    await appendSupportReply(dbs.app.db, { userId: USER, ticketId: ticket.id, body: "Here is the information you requested.", submissionKey: "customer-reply-1234" });
    const reopened = await getSupportTicket(dbs.app.db, USER, ticket.id);
    expect(reopened?.ticket.status).toBe("triaged");
    expect(reopened?.ticket.version).toBeGreaterThan(waiting.version);
    await updateSupportTicketByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: ticket.id, expectedVersion: reopened?.ticket.version ?? 0, status: "closed" });
    await expect(appendSupportReply(dbs.app.db, { userId: USER, ticketId: ticket.id, body: "Cannot change a closed ticket", submissionKey: "closed-reply-1234" })).rejects.toThrow(/closed/i);
    expect(await captureErrorText(withUserScope(dbs.app.db, USER, (tx) => tx.update(supportTickets).set({ priority: "urgent" }).where(eq(supportTickets.id, ticket.id))))).toMatch(/permission denied/);
  });
  it("claims staged screenshots only once and rolls back a failed claim", async () => {
    const attachmentId = "019c81e2-4436-7abb-9523-56603dc2a008";
    await stageSupportAttachment(dbs.app.db, { id: attachmentId, userId: USER, storageKey: `support/019c81e2-4436-7abb-9523-56603dc2a007/${attachmentId}`, filename: "error.png", mimeType: "image/png", byteSize: 1200, width: 100, height: 100, sha256: "a".repeat(64), expiresAt: new Date(Date.now() + 60_000) });
    const ticket = await createSupportTicket(dbs.app.db, { ...input, attachmentIds: [attachmentId] });
    expect((await getSupportTicket(dbs.app.db, USER, ticket.id))?.attachments).toHaveLength(1);
    await expect(createSupportTicket(dbs.app.db, { ...input, submissionKey: "another-ticket-1234", attachmentIds: [attachmentId] })).rejects.toThrow(/attachment/i);
    expect(await withUserScope(dbs.app.db, USER, (tx) => tx.select().from(supportTickets))).toHaveLength(1);
    expect(await withUserScope(dbs.app.db, OTHER, (tx) => tx.select().from(supportAttachments))).toEqual([]);
  });
  it("retains support metadata until private object erasure succeeds", async () => {
    const attachmentId = "019c81e2-4436-7abb-9523-56603dc2a009";
    await stageSupportAttachment(dbs.app.db, { id: attachmentId, userId: USER, storageKey: `support/019c81e2-4436-7abb-9523-56603dc2a007/${attachmentId}`, filename: "erasure.png", mimeType: "image/png", byteSize: 1200, width: 100, height: 100, sha256: "b".repeat(64), expiresAt: new Date(Date.now() + 60_000) });
    const ticket = await createSupportTicket(dbs.app.db, { ...input, attachmentIds: [attachmentId] });
    await dbs.staff.db.insert(accountClosures).values({ userId: USER, businessId, requestedAt: new Date(Date.now() - 86400000), eraseAfter: new Date(Date.now() - 1000) });
    expect(await beginSupportAccountErasure(dbs.staff.db, USER)).toHaveLength(1);
    expect(await captureErrorText(dbs.staff.db.transaction((tx) => eraseSupportDataForUser(tx, USER)))).toMatch(/purged/i);
    expect(await getSupportTicket(dbs.app.db, USER, ticket.id)).not.toBeNull();
    await markSupportAttachmentPurged(dbs.staff.db, attachmentId);
    await dbs.staff.db.transaction((tx) => eraseSupportDataForUser(tx, USER));
    expect(await getSupportTicket(dbs.app.db, USER, ticket.id)).toBeNull();
    expect(await dbs.staff.db.select().from(supportAttachments)).toEqual([]);
  });
  it("denies customer impersonation, internal-note insertion, and hidden read cursors", async () => {
    const ticket = await createSupportTicket(dbs.app.db, input);
    const internal = await appendSupportMessageByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: ticket.id, body: "Internal-only note", visibility: "internal", submissionKey: "hidden-note-123456" });
    await expect(markSupportTicketRead(dbs.app.db, USER, ticket.id, internal.id)).rejects.toThrow(/public message/i);
    const message = { ticketId: ticket.id, authorUserId: USER, authorRole: "customer" as const, body: "Customer cannot write private notes.", visibility: "internal" as const, submissionKey: "forged-note-123456", submissionHash: "a".repeat(64) };
    expect(await captureErrorText(withUserScope(dbs.app.db, USER, (tx) => tx.insert(supportMessages).values(message)))).toMatch(/public|row-level security/i);
    expect(await captureErrorText(withUserScope(dbs.app.db, OTHER, (tx) => tx.insert(supportMessages).values({ ...message, visibility: "public" })))).toMatch(/author|row-level security/i);
  });
  it("retains old closed tickets while leaving resolved conversations replyable", async () => {
    const old = new Date("2024-01-01T00:00:00Z");
    const closed = await createSupportTicket(dbs.app.db, input);
    const resolved = await createSupportTicket(dbs.app.db, { ...input, submissionKey: "resolved-ticket-1234" });
    await withUserScope(dbs.staff.db, STAFF, (tx) => tx.update(supportTickets).set({ status: "closed", version: closed.version + 1, updatedAt: old }).where(eq(supportTickets.id, closed.id)));
    await withUserScope(dbs.staff.db, STAFF, (tx) => tx.update(supportTickets).set({ status: "resolved", version: resolved.version + 1, updatedAt: old }).where(eq(supportTickets.id, resolved.id)));
    const claim = await claimSupportTicketsDueRetention(dbs.staff.db, new Date("2025-01-01T00:00:00Z"));
    expect(claim.ticketIds).toEqual([closed.id]);
    expect(await finalizeSupportTicketRetention(dbs.staff.db, claim.ticketIds)).toBe(1);
    expect(await finalizeSupportTicketRetention(dbs.staff.db, claim.ticketIds)).toBe(0);
    expect(await getSupportTicket(dbs.app.db, USER, closed.id)).toBeNull();
    await appendSupportReply(dbs.app.db, { userId: USER, ticketId: resolved.id, body: "The issue returned after your fix.", submissionKey: "reopen-resolved-1234" });
    expect((await getSupportTicket(dbs.app.db, USER, resolved.id))?.ticket.status).toBe("triaged");
  });
});

describe("the staff queue count", () => {
  it("counts new, triaged and in-progress requests, and nothing waiting on the customer or finished", async () => {
    const waitingOnUs = await createSupportTicket(dbs.app.db, input);
    const waitingOnThem = await createSupportTicket(dbs.app.db, { ...input, subject: "Second problem", submissionKey: "submission-234567" });
    const finished = await createSupportTicket(dbs.app.db, { ...input, subject: "Third problem", submissionKey: "submission-345678" });
    await dbs.staff.db.update(supportTickets).set({ status: "in_progress", version: waitingOnUs.version + 1 }).where(eq(supportTickets.id, waitingOnUs.id));
    await dbs.staff.db.update(supportTickets).set({ status: "waiting_on_you", version: waitingOnThem.version + 1 }).where(eq(supportTickets.id, waitingOnThem.id));
    await dbs.staff.db.update(supportTickets).set({ status: "resolved", version: finished.version + 1 }).where(eq(supportTickets.id, finished.id));
    expect(await countSupportTicketsAwaitingStaff(dbs.staff.db)).toBe(1);
  });
});

describe("listSupportTicketsForStaff by business", () => {
  it("lists only the tickets of the business asked for", async () => {
    const ofBusiness = await createSupportTicket(dbs.app.db, { ...input, userId: OTHER, businessId, submissionKey: "business-ticket-1234" });
    const noBusiness = await createSupportTicket(dbs.app.db, input);
    const page = await listSupportTicketsForStaff(dbs.staff.db, { businessId });
    expect(page.items.map((ticket) => ticket.id)).toEqual([ofBusiness.id]);
    expect(page.items.some((ticket) => ticket.id === noBusiness.id)).toBe(false);
    expect((await listSupportTicketsForStaff(dbs.staff.db, { businessId: "01a0f71b-8402-7d48-a90a-000000000000" })).items).toEqual([]);
  });

  it("refuses a business id that is not one", async () => {
    await expect(listSupportTicketsForStaff(dbs.staff.db, { businessId: "nope" })).rejects.toThrow(/Business ID/);
  });
});

describe("staff replies", () => {
  it("tells a first reply from a replay of the same submission, so a customer is told once", async () => {
    const ticket = await createSupportTicket(dbs.app.db, input);
    const reply = { staffUserId: STAFF, ticketId: ticket.id, body: "We are on it.", visibility: "public" as const, submissionKey: "staff-outcome-123456" };
    const first = await appendSupportMessageByStaffWithOutcome(dbs.staff.db, reply);
    const replay = await appendSupportMessageByStaffWithOutcome(dbs.staff.db, reply);
    expect([first.created, replay.created]).toEqual([true, false]);
    expect(replay.message.id).toBe(first.message.id);
    await expect(appendSupportMessageByStaffWithOutcome(dbs.staff.db, { ...reply, body: "A different reply." })).rejects.toThrow(/submission key/i);
  });
});
