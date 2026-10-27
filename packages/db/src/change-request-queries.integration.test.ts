import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ChangeRequestError,
  countIncludedEdits,
  findRequestRecipient,
  getChangeRequestForStaff,
  getChangeWithEvents,
  listChangeRequestsForBusiness,
  listRequestItems,
  listRequestNeeds,
  listUnreadReplies,
  moveChangeAsCustomer,
} from "./queries/change-requests";
import { insertBusiness } from "./queries/onboarding";
import { appendSupportMessageByStaff } from "./queries/support-staff";
import { createSupportTicket, createSupportTicketWithOutcome, getSupportTicket, markSupportTicketRead } from "./queries/support";
import { businessMembers, changeRequests, staffMembers, supportTickets, users } from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "crq-owner";
const SECOND = "crq-second";
const OTHER_OWNER = "crq-other-owner";
const STAFF = "crq-staff";
const PHONE_ACCOUNT = "crq-phone";
const QUOTE = {
  coverage: "paid" as const,
  quoteWhat: "New page",
  quoteHours: 3,
  quoteUnitCents: 50_000,
  quoteAmountCents: 150_000,
  quoteCurrency: "INR" as const,
  quoteWorkingDays: 5,
  quotedAt: new Date("2026-11-28T04:50:00.000Z"),
};

let dbs: TestDatabases;
let businessId = "";
let otherBusinessId = "";
let counter = 0;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  counter = 0;
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Priya Shah", email: `${OWNER}@example.com`, emailVerified: true },
    { id: SECOND, name: "Second Member", email: `${SECOND}@example.com`, emailVerified: true },
    { id: OTHER_OWNER, name: "Arjun Rao", email: `${OTHER_OWNER}@example.com`, emailVerified: true },
    { id: STAFF, name: "Staff Member", email: `${STAFF}@example.com`, emailVerified: true },
    { id: PHONE_ACCOUNT, name: "Phone Owner", email: "919800000000@phone.brandbasket.invalid", emailVerified: true },
  ]);
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF });
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Sai Dental Care", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
  await dbs.staff.db.insert(businessMembers).values([
    { businessId, userId: OWNER, role: "owner" },
    { businessId, userId: SECOND, role: "editor" },
    { businessId: otherBusinessId, userId: OTHER_OWNER, role: "owner" },
    { businessId: otherBusinessId, userId: PHONE_ACCOUNT, role: "editor" },
  ]);
});

const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
const asSecond = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: SECOND, businessId }, work);
const asOtherOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) =>
  withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId: otherBusinessId }, work);

const key = (): string => `queries-key-${(counter += 1)}-abcdefgh`;

/** A change request made the way the Ask for a change form makes one. */
async function ask(options: { readonly userId?: string; readonly business?: string; readonly kind?: "website" | "social" | "search" | "billing" | "other"; readonly subject?: string } = {}) {
  return createSupportTicketWithOutcome(dbs.app.db, {
    userId: options.userId ?? OWNER,
    businessId: options.business ?? businessId,
    category: "website_change",
    subject: options.subject ?? "Add an Implants page",
    description: "Please add a page about dental implants, like the root canal page.",
    submissionKey: key(),
    changeRequest: { kind: options.kind ?? "website", page: "Home" },
  });
}

const requestIdOf = async (ticketId: string): Promise<string> => {
  const [row] = await dbs.staff.db.select({ id: changeRequests.id }).from(changeRequests).where(eq(changeRequests.ticketId, ticketId));
  if (row === undefined) throw new Error("No change request for the ticket");
  return row.id;
};

/** Changes a request's sent time, which the guard forbids, with the guard off for this one transaction. */
async function backdate(requestId: string, createdAt: Date): Promise<void> {
  await dbs.owner.db.transaction(async (tx) => {
    await tx.execute(sql`alter table change_requests disable trigger change_requests_guard`);
    await tx.execute(sql`update change_requests set created_at = ${createdAt.toISOString()}::timestamptz where id = ${requestId}`);
    await tx.execute(sql`alter table change_requests enable trigger change_requests_guard`);
  });
}

describe("asking for a change", () => {
  it("makes the ticket and its change details together, once, however often the form is sent", async () => {
    const input = {
      userId: OWNER,
      businessId,
      category: "website_change" as const,
      subject: "Add an Implants page",
      description: "Please add a page about dental implants.",
      submissionKey: "same-submission-abcdefgh",
      changeRequest: { kind: "website" as const, page: "  /services  " },
    };
    const first = await createSupportTicketWithOutcome(dbs.app.db, input);
    const replay = await createSupportTicketWithOutcome(dbs.app.db, input);
    expect([first.created, replay.created]).toEqual([true, false]);
    expect(replay.ticket.id).toBe(first.ticket.id);
    const rows = await dbs.staff.db.select().from(changeRequests);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ticketId: first.ticket.id, businessId, kind: "website", page: "/services", state: "requested" });
  });

  it("treats the same key with a different kind as a different submission", async () => {
    const input = {
      userId: OWNER,
      businessId,
      category: "general" as const,
      subject: "Change my ad",
      description: "Please change the wording of my ad.",
      submissionKey: "kind-matters-abcdefgh",
      changeRequest: { kind: "social" as const },
    };
    await createSupportTicketWithOutcome(dbs.app.db, input);
    await expect(createSupportTicketWithOutcome(dbs.app.db, { ...input, changeRequest: { kind: "search" } })).rejects.toThrow(/submission key/i);
  });

  it("leaves a plain ticket a plain question, and refuses change details without a business", async () => {
    const plain = await createSupportTicket(dbs.app.db, {
      userId: OWNER,
      businessId,
      category: "general",
      subject: "A question",
      description: "How do I change my password?",
      submissionKey: key(),
    });
    expect(await dbs.staff.db.select().from(changeRequests).where(eq(changeRequests.ticketId, plain.id))).toEqual([]);
    await expect(
      createSupportTicket(dbs.app.db, { userId: OWNER, category: "other", subject: "No business", description: "This has no business.", submissionKey: key(), changeRequest: { kind: "other" } }),
    ).rejects.toThrow(/needs a kind and a business/i);
  });

  it("refuses a business the person does not belong to, and keeps no ticket behind", async () => {
    await expect(ask({ business: otherBusinessId })).rejects.toThrow(/business/i);
    expect(await dbs.staff.db.select().from(supportTickets)).toEqual([]);
  });
});

describe("listRequestItems", () => {
  it("lists the person's requests and questions together, newest activity first, each with what it is", async () => {
    const first = await ask({ subject: "Change the main photo" });
    const question = await createSupportTicket(dbs.app.db, { userId: OWNER, businessId, category: "general", subject: "A question", description: "How do I change my password?", submissionKey: key() });
    const second = await ask({ subject: "Add an Implants page", kind: "billing" });
    const items = await asOwner((tx) => listRequestItems(tx, OWNER));
    expect(items.map((item) => [item.subject, item.change?.kind ?? null])).toEqual([
      ["Add an Implants page", "billing"],
      ["A question", null],
      ["Change the main photo", "website"],
    ]);
    expect(items.map((item) => item.ticketId)).toEqual([second.ticket.id, question.id, first.ticket.id]);
    expect(items[0]?.change).toMatchObject({ state: "requested", coverage: "undecided", quote: null, chargeStatus: null });
  });

  it("shows a stranger nothing, and a second member of the business none of the first member's conversations", async () => {
    await ask();
    expect(await asOtherOwner((tx) => listRequestItems(tx, OTHER_OWNER))).toEqual([]);
    expect(await asSecond((tx) => listRequestItems(tx, SECOND))).toEqual([]);
  });

  it("reads the quote, and flags a reply the person has not read", async () => {
    const { ticket } = await ask();
    const requestId = await requestIdOf(ticket.id);
    await dbs.staff.db.update(changeRequests).set({ ...QUOTE, state: "quoted" }).where(eq(changeRequests.id, requestId));
    expect((await asOwner((tx) => listRequestItems(tx, OWNER)))[0]?.unread).toBe(false);
    await appendSupportMessageByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: ticket.id, body: "A new page takes about 3 hours.", visibility: "public", submissionKey: key() });
    const [item] = await asOwner((tx) => listRequestItems(tx, OWNER));
    expect(item?.unread).toBe(true);
    expect(item?.change?.quote).toEqual({ what: "New page", hours: 3, unitCents: 50_000, amountCents: 150_000, currency: "INR", workingDays: 5, quotedAt: QUOTE.quotedAt });
  });

  it("is checked for its size", async () => {
    await expect(asOwner((tx) => listRequestItems(tx, OWNER, 0))).rejects.toThrow(RangeError);
  });
});

describe("getChangeWithEvents", () => {
  it("gives the change and the dates it moved on, oldest first, and null for a question", async () => {
    const { ticket } = await ask();
    const requestId = await requestIdOf(ticket.id);
    await dbs.staff.db.update(changeRequests).set({ ...QUOTE, state: "quoted" }).where(eq(changeRequests.id, requestId));
    const found = await asOwner((tx) => getChangeWithEvents(tx, ticket.id));
    expect(found?.change.state).toBe("quoted");
    expect(found?.events.map((event) => event.state)).toEqual(["requested", "quoted"]);
    const question = await createSupportTicket(dbs.app.db, { userId: OWNER, businessId, category: "general", subject: "A question", description: "How do I change my password?", submissionKey: key() });
    expect(await asOwner((tx) => getChangeWithEvents(tx, question.id))).toBeNull();
    expect(await asOtherOwner((tx) => getChangeWithEvents(tx, ticket.id))).toBeNull();
  });

  it("still opens the conversation with its whole history for a ticket that was made before change requests existed", async () => {
    const old = await createSupportTicket(dbs.app.db, { userId: OWNER, businessId, category: "website_change", subject: "Old request", description: "Please change the opening hours.", submissionKey: key() });
    await appendSupportMessageByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: old.id, body: "Done, thanks.", visibility: "public", submissionKey: key() });
    const detail = await getSupportTicket(dbs.app.db, OWNER, old.id);
    expect(detail?.messages.map((message) => message.authorRole)).toEqual(["customer", "staff"]);
    const [item] = await asOwner((tx) => listRequestItems(tx, OWNER));
    expect(item).toMatchObject({ ticketId: old.id, change: null, unread: true });
  });
});

describe("countIncludedEdits", () => {
  const window = { from: new Date("2026-10-31T18:30:00.000Z"), to: new Date("2026-11-30T18:30:00.000Z") };

  async function makeIncluded(createdAt: Date, state: "in_progress" | "withdrawn" = "in_progress", business = businessId): Promise<void> {
    const userId = business === businessId ? OWNER : OTHER_OWNER;
    const { ticket } = await ask({ userId, business });
    const requestId = await requestIdOf(ticket.id);
    await dbs.staff.db.update(changeRequests).set({ coverage: "included", state }).where(eq(changeRequests.id, requestId));
    await backdate(requestId, createdAt);
  }

  it("counts the business's included edits sent inside the window, whoever on the business sent them", async () => {
    await makeIncluded(new Date("2026-11-03T05:00:00.000Z"));
    await makeIncluded(new Date("2026-11-20T05:00:00.000Z"));
    expect(await asOwner((tx) => countIncludedEdits(tx, businessId, window))).toBe(2);
    expect(await asSecond((tx) => countIncludedEdits(tx, businessId, window))).toBe(2);
    expect(await countIncludedEdits(dbs.staff.db, businessId, window)).toBe(2);
  });

  it("leaves out the month before and after, the edit that was withdrawn, and other businesses", async () => {
    await makeIncluded(new Date("2026-10-31T18:29:59.000Z"));
    await makeIncluded(new Date("2026-11-30T18:30:00.000Z"));
    await makeIncluded(new Date("2026-11-10T05:00:00.000Z"), "withdrawn");
    await makeIncluded(new Date("2026-11-10T05:00:00.000Z"), "in_progress", otherBusinessId);
    expect(await countIncludedEdits(dbs.staff.db, businessId, window)).toBe(0);
    expect(await countIncludedEdits(dbs.staff.db, otherBusinessId, window)).toBe(1);
  });

  it("counts the first moment of the month and not the first moment of the next", async () => {
    await makeIncluded(new Date("2026-10-31T18:30:00.000Z"));
    expect(await countIncludedEdits(dbs.staff.db, businessId, window)).toBe(1);
  });

  it("does not count a request that is paid, free or undecided", async () => {
    const { ticket } = await ask();
    const requestId = await requestIdOf(ticket.id);
    await dbs.staff.db.update(changeRequests).set({ coverage: "free", state: "in_progress" }).where(eq(changeRequests.id, requestId));
    await ask();
    expect(await countIncludedEdits(dbs.staff.db, businessId, { from: new Date("2020-01-01T00:00:00.000Z"), to: new Date("2100-01-01T00:00:00.000Z") })).toBe(0);
  });
});

describe("listRequestNeeds", () => {
  it("lists the quotes to answer and the changes to check, and nothing else", async () => {
    const quoted = await ask({ subject: "Add an Implants page" });
    const toCheck = await ask({ subject: "Change the main photo" });
    await ask({ subject: "Still being looked at" });
    await dbs.staff.db.update(changeRequests).set({ ...QUOTE, state: "quoted" }).where(eq(changeRequests.id, await requestIdOf(quoted.ticket.id)));
    const checkId = await requestIdOf(toCheck.ticket.id);
    await dbs.staff.db.update(changeRequests).set({ coverage: "free", state: "in_progress" }).where(eq(changeRequests.id, checkId));
    await dbs.staff.db.update(changeRequests).set({ state: "preview" }).where(eq(changeRequests.id, checkId));
    const needs = await asOwner((tx) => listRequestNeeds(tx, OWNER));
    expect(needs.map((need) => [need.subject, need.state])).toEqual([
      ["Add an Implants page", "quoted"],
      ["Change the main photo", "preview"],
    ]);
    expect(needs[0]?.quote?.amountCents).toBe(150_000);
    expect(await asOtherOwner((tx) => listRequestNeeds(tx, OTHER_OWNER))).toEqual([]);
  });
});

describe("listUnreadReplies", () => {
  it("lists the conversations the team has replied to that the person has not read, and none once they have", async () => {
    const first = await ask({ subject: "Change the main photo" });
    const second = await ask({ subject: "Add an Implants page" });
    expect(await asOwner((tx) => listUnreadReplies(tx, OWNER))).toEqual([]);
    const reply = await appendSupportMessageByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: second.ticket.id, body: "A new page takes about 3 hours.", visibility: "public", submissionKey: key() });
    await appendSupportMessageByStaff(dbs.staff.db, { staffUserId: STAFF, ticketId: first.ticket.id, body: "An internal note.", visibility: "internal", submissionKey: key() });
    expect(await asOwner((tx) => listUnreadReplies(tx, OWNER))).toEqual([{ ticketId: second.ticket.id, subject: "Add an Implants page" }]);
    await markSupportTicketRead(dbs.app.db, OWNER, second.ticket.id, reply.id);
    expect(await asOwner((tx) => listUnreadReplies(tx, OWNER))).toEqual([]);
    expect(await asOtherOwner((tx) => listUnreadReplies(tx, OTHER_OWNER))).toEqual([]);
  });

  it("is checked for its size", async () => {
    await expect(asOwner((tx) => listUnreadReplies(tx, OWNER, 0))).rejects.toThrow(RangeError);
  });
});

describe("moveChangeAsCustomer", () => {
  it("says what was refused in a code the pages can answer", async () => {
    const { ticket } = await ask();
    const requestId = await requestIdOf(ticket.id);
    const refused = async (run: () => Promise<unknown>): Promise<string | undefined> => {
      try {
        await run();
      } catch (error) {
        return error instanceof ChangeRequestError ? error.code : `other: ${String(error)}`;
      }
      return undefined;
    };
    expect(await refused(() => asOwner((tx) => moveChangeAsCustomer(tx, requestId, "decline")))).toBe("wrong_state");
    expect(await refused(() => asOtherOwner((tx) => moveChangeAsCustomer(tx, requestId, "decline")))).toBe("not_found");
    expect(await refused(() => asOwner((tx) => moveChangeAsCustomer(tx, "00000000-0000-4000-8000-000000000000", "approve")))).toBe("not_found");
  });

  it("moves a quote to not now and back, a change to approved, and a finished change to a fix", async () => {
    const { ticket } = await ask();
    const requestId = await requestIdOf(ticket.id);
    await dbs.staff.db.update(changeRequests).set({ ...QUOTE, state: "quoted" }).where(eq(changeRequests.id, requestId));
    expect(await asOwner((tx) => moveChangeAsCustomer(tx, requestId, "decline"))).toBe("withdrawn");
    expect(await asOwner((tx) => moveChangeAsCustomer(tx, requestId, "reopen"))).toBe("quoted");
    await dbs.staff.db.update(changeRequests).set({ state: "in_progress" }).where(eq(changeRequests.id, requestId));
    await dbs.staff.db.update(changeRequests).set({ state: "preview" }).where(eq(changeRequests.id, requestId));
    expect(await asOwner((tx) => moveChangeAsCustomer(tx, requestId, "approve"))).toBe("approved");
    expect(await asOwner((tx) => moveChangeAsCustomer(tx, requestId, "reopen"))).toBe("revisions");
  });

  it("closes the window after 14 days", async () => {
    const { ticket } = await ask();
    const requestId = await requestIdOf(ticket.id);
    await dbs.staff.db.update(changeRequests).set({ coverage: "free", state: "in_progress" }).where(eq(changeRequests.id, requestId));
    await dbs.staff.db.update(changeRequests).set({ state: "shipped" }).where(eq(changeRequests.id, requestId));
    await dbs.owner.db.execute(sql`update change_request_events set at = now() - interval '15 days' where state = 'shipped'`);
    const text = await captureErrorText(asOwner((tx) => moveChangeAsCustomer(tx, requestId, "reopen")));
    expect(text).toContain("window closed");
  });
});

describe("what staff read", () => {
  it("lists a business's requests with their tickets, newest first, and finds one by id", async () => {
    const first = await ask({ subject: "Change the main photo" });
    const second = await ask({ subject: "Add an Implants page" });
    await ask({ userId: OTHER_OWNER, business: otherBusinessId, subject: "Not ours" });
    const list = await listChangeRequestsForBusiness(dbs.staff.db, businessId);
    expect(list.map((item) => item.subject)).toEqual(["Add an Implants page", "Change the main photo"]);
    const found = await getChangeRequestForStaff(dbs.staff.db, list[0]?.change.id ?? "");
    expect(found?.ticketId).toBe(second.ticket.id);
    expect(found?.displayRef).toBe(second.ticket.displayRef);
    expect(await getChangeRequestForStaff(dbs.staff.db, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(first.created).toBe(true);
  });

  it("finds who to write to, with no address for a phone account", async () => {
    const mine = await ask();
    const phone = await createSupportTicket(dbs.app.db, { userId: PHONE_ACCOUNT, businessId: otherBusinessId, category: "general", subject: "A question", description: "Can you call me back?", submissionKey: key() });
    expect(await findRequestRecipient(dbs.staff.db, mine.ticket.id)).toEqual({
      ticketId: mine.ticket.id,
      subject: "Add an Implants page",
      name: "Priya Shah",
      email: `${OWNER}@example.com`,
      businessName: "Sai Dental Care",
      isChange: true,
    });
    expect(await findRequestRecipient(dbs.staff.db, phone.id)).toMatchObject({ email: null, isChange: false });
    expect(await findRequestRecipient(dbs.staff.db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
