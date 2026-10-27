import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { businessMembers, businesses, staffMembers, users } from "./schema";
import { appendSupportReply, createSupportTicket, getSupportTicket } from "./queries/support";
import { appendSupportMessageByStaff, countSupportQueues, createSupportTicketByStaff, getSupportTicketForStaff, listSupportTicketsForStaff, updateSupportTicketByStaff } from "./queries/support-staff";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

let dbs: TestDatabases;
const USER = "queue-user";
const STAFF = "queue-staff";

beforeAll(async () => {
  dbs = openTestDatabases();
  const result = await dbs.owner.db.execute<{ name: string }>(sql`select current_database() as name`);
  if (!result.rows[0]?.name.endsWith("_test")) throw new Error("Support queue integration tests require a *_test database.");
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: USER, name: "Kavya Nair", email: "kavya@queue.test" },
    { id: STAFF, name: "Riya Kapoor", email: "riya@queue.test" },
  ]);
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF });
});

function openByClient(submissionKey: string, subject: string): ReturnType<typeof createSupportTicket> {
  return createSupportTicket(dbs.app.db, { userId: USER, category: "support", subject, description: "Please change our opening hours.", submissionKey });
}

describe("the requests queues", () => {
  it("lists requests the client wrote last as needing a reply, longest waiting first", async () => {
    const older = await openByClient("queue-older-1", "Older request");
    const newer = await openByClient("queue-newer-1", "Newer request");
    const page = await listSupportTicketsForStaff(dbs.staff.db, { queue: "needs_reply" });
    expect(page.items.map((item) => item.id)).toEqual([older.id, newer.id]);
    expect(page.items[0]?.lastCustomerMessageAt).toBeInstanceOf(Date);
    expect(page.items[0]?.lastStaffReplyAt).toBeNull();
    expect(page.items[0]?.businessName).toBeNull();
    expect(page.nextCursor).toBeNull();
  });

  it("moves a request to waiting on client after a public reply, but not after an internal note", async () => {
    const ticket = await openByClient("queue-reply-1", "Reply request");
    await appendSupportMessageByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: ticket.id, body: "Only staff see this.", visibility: "internal", submissionKey: "queue-note-1234" });
    expect((await listSupportTicketsForStaff(dbs.staff.db, { queue: "needs_reply" })).items.map((item) => item.id)).toEqual([ticket.id]);
    await appendSupportMessageByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: ticket.id, body: "Done, the hours are updated.", visibility: "public", submissionKey: "queue-reply-1234" });
    expect((await listSupportTicketsForStaff(dbs.staff.db, { queue: "needs_reply" })).items).toEqual([]);
    const waiting = await listSupportTicketsForStaff(dbs.staff.db, { queue: "waiting_on_client" });
    expect(waiting.items.map((item) => item.id)).toEqual([ticket.id]);
    expect(waiting.items[0]?.lastStaffReplyAt).toBeInstanceOf(Date);
  });

  it("needs a reply again when the client answers", async () => {
    const ticket = await openByClient("queue-again-1", "Answer request");
    await appendSupportMessageByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: ticket.id, body: "Which hours do you want?", visibility: "public", submissionKey: "queue-ask-12345" });
    await appendSupportReply(dbs.app.db, { userId: USER, ticketId: ticket.id, body: "Ten to eight on Sundays.", submissionKey: "queue-answer-123" });
    expect((await listSupportTicketsForStaff(dbs.staff.db, { queue: "needs_reply" })).items.map((item) => item.id)).toEqual([ticket.id]);
  });

  it("counts each queue and puts resolved requests in done", async () => {
    await openByClient("queue-count-a1", "First request");
    const second = await openByClient("queue-count-b1", "Second request");
    await updateSupportTicketByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: second.id, expectedVersion: second.version, status: "resolved" });
    expect(await countSupportQueues(dbs.staff.db)).toEqual({ needsReply: 1, needsReplyOverADay: 0, waitingOnClient: 0, done: 1 });
    expect((await listSupportTicketsForStaff(dbs.staff.db, { queue: "done" })).items.map((item) => item.id)).toEqual([second.id]);
  });
});

describe("a request staff open for a client", () => {
  const OWNER = "open-owner";

  async function seedBusiness(withOwner: boolean): Promise<string> {
    const [business] = await dbs.staff.db.insert(businesses).values({ slug: "kavya-salon", name: "Kavya Salon" }).returning();
    if (!business) throw new Error("Test business was not seeded.");
    if (withOwner) {
      await dbs.staff.db.insert(users).values({ id: OWNER, name: "Kavya Nair", email: "owner@kavyasalon.test" });
      await dbs.staff.db.insert(businessMembers).values({ userId: OWNER, businessId: business.id, role: "owner" });
    }
    return business.id;
  }

  const request = (businessId: string) => ({
    staffUserId: STAFF,
    businessId,
    category: "website_change" as const,
    subject: "Change the Sunday hours",
    body: "Asked on the phone: open at 10 on Sundays.",
    submissionKey: "staff-open-12345",
  });

  it("opens it for the owner, written by staff, and waits on the client", async () => {
    const businessId = await seedBusiness(true);
    const result = await createSupportTicketByStaff(dbs.staff.db, request(businessId));
    expect(result.created).toBe(true);
    expect(result.requesterUserId).toBe(OWNER);
    expect(result.ticket.businessId).toBe(businessId);
    const asOwner = await getSupportTicket(dbs.app.db, OWNER, result.ticket.id);
    expect(asOwner?.messages.map((message) => [message.authorRole, message.visibility])).toEqual([["staff", "public"]]);
    const asStaff = await getSupportTicketForStaff(dbs.staff.db, result.ticket.id);
    expect(asStaff?.events.map((event) => [event.kind, event.actorUserId])).toEqual([["created", STAFF]]);
    expect((await listSupportTicketsForStaff(dbs.staff.db, { queue: "waiting_on_client" })).items.map((item) => item.id)).toEqual([result.ticket.id]);
  });

  it("opens it once for a replayed form, and refuses the same form with other text", async () => {
    const businessId = await seedBusiness(true);
    const first = await createSupportTicketByStaff(dbs.staff.db, request(businessId));
    const replay = await createSupportTicketByStaff(dbs.staff.db, request(businessId));
    expect(replay.created).toBe(false);
    expect(replay.ticket.id).toBe(first.ticket.id);
    await expect(createSupportTicketByStaff(dbs.staff.db, { ...request(businessId), subject: "Something else" })).rejects.toThrow(/already used/i);
  });

  it("refuses a business with no owner", async () => {
    const businessId = await seedBusiness(false);
    await expect(createSupportTicketByStaff(dbs.staff.db, request(businessId))).rejects.toThrow(/no owner/i);
  });

  it("refuses a staff member who is switched off", async () => {
    const businessId = await seedBusiness(true);
    await dbs.staff.db.update(staffMembers).set({ active: false }).where(eq(staffMembers.userId, STAFF));
    await expect(createSupportTicketByStaff(dbs.staff.db, request(businessId))).rejects.toThrow(/active staff/i);
  });
});
