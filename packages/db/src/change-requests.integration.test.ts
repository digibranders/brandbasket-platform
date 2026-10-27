import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CHANGE_STATES, canMoveChange, type ChangeState } from "./change-states";
import { insertCharge, recordChargePayment, waiveCharge } from "./queries/charges";
import { appendSupportReply, beginSupportAccountErasure, claimSupportTicketsDueRetention, createSupportTicket, eraseSupportDataForUser } from "./queries/support";
import { insertBusiness } from "./queries/onboarding";
import { accountClosures, businessMembers, changeRequestEvents, changeRequests, staffMembers, supportTickets, users } from "./schema";
import { withTenantScope, withUserScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "cr-owner";
const OTHER_OWNER = "cr-other-owner";
const STAFF = "cr-staff";
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
    { id: OTHER_OWNER, name: "Arjun Rao", email: `${OTHER_OWNER}@example.com`, emailVerified: true },
    { id: STAFF, name: "Staff Member", email: `${STAFF}@example.com`, emailVerified: true },
  ]);
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF });
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Sai Dental Care", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
  await dbs.staff.db.insert(businessMembers).values([
    { businessId, userId: OWNER, role: "owner" },
    { businessId: otherBusinessId, userId: OTHER_OWNER, role: "owner" },
  ]);
});

const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
const asOtherOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) =>
  withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId: otherBusinessId }, work);
const asStaff = <T>(work: Parameters<typeof withUserScope<T>>[2]) => withUserScope(dbs.staff.db, STAFF, work);

/** Postgres reports a missing privilege as SQLSTATE 42501; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

/** A ticket from the owner for their business, then the change details through the customer's own door. */
async function makeRequest(): Promise<{ readonly ticketId: string; readonly requestId: string }> {
  counter += 1;
  const ticket = await createSupportTicket(dbs.app.db, {
    userId: OWNER,
    businessId,
    category: "website_change",
    subject: "Add an Implants page",
    description: "Please add a page about dental implants.",
    submissionKey: `request-key-${counter}-abcdefgh`,
  });
  const result = await asOwner((tx) => tx.execute<{ id: string }>(sql`select create_change_request(${ticket.id}::uuid, 'website', 'Home') as id`));
  const requestId = result.rows[0]?.id;
  if (requestId === undefined) throw new Error("create_change_request returned no id");
  return { ticketId: ticket.id, requestId };
}

/** The quote, written the way staff write it. */
async function quote(requestId: string): Promise<void> {
  await dbs.staff.db.update(changeRequests).set(QUOTE).where(eq(changeRequests.id, requestId));
}

/** Puts a request in any state, with the guard switched off for this one transaction, so the matrix can start anywhere. */
async function forceState(requestId: string, state: ChangeState): Promise<void> {
  await dbs.owner.db.transaction(async (tx) => {
    await tx.execute(sql`alter table change_requests disable trigger change_requests_guard`);
    await tx.execute(sql`update change_requests set state = ${state} where id = ${requestId}`);
    await tx.execute(sql`alter table change_requests enable trigger change_requests_guard`);
  });
}

const stateOf = async (requestId: string): Promise<string | undefined> =>
  (await dbs.staff.db.select({ state: changeRequests.state }).from(changeRequests).where(eq(changeRequests.id, requestId)))[0]?.state;

describe("what the customer role can do with a change request", () => {
  it("reads the requests of its own business and no other", async () => {
    const { requestId } = await makeRequest();
    expect((await asOwner((tx) => tx.select().from(changeRequests))).map((row) => row.id)).toEqual([requestId]);
    expect(await asOtherOwner((tx) => tx.select().from(changeRequests))).toEqual([]);
    expect(await asOtherOwner((tx) => tx.select().from(changeRequestEvents))).toEqual([]);
  });

  it("starts every request as requested, undecided and unquoted, with a first line in its history", async () => {
    const { requestId } = await makeRequest();
    const [row] = await asOwner((tx) => tx.select().from(changeRequests));
    expect(row).toMatchObject({ id: requestId, kind: "website", page: "Home", state: "requested", coverage: "undecided", quoteHours: null, chargeId: null });
    const events = await asOwner((tx) => tx.select().from(changeRequestEvents));
    expect(events.map((event) => [event.state, event.actorUserId])).toEqual([["requested", OWNER]]);
  });

  it("cannot write a request or its history by any statement", async () => {
    const { ticketId, requestId } = await makeRequest();
    const attempts = [
      sql`update change_requests set state = 'quoted' where id = ${requestId}`,
      sql`update change_requests set updated_at = now() where id = ${requestId}`,
      sql`update change_requests set coverage = 'paid' where id = ${requestId}`,
      sql`delete from change_requests where id = ${requestId}`,
      sql`insert into change_requests (id, ticket_id, business_id, kind) values (gen_random_uuid(), ${ticketId}, ${businessId}, 'website')`,
      sql`insert into change_request_events (id, change_request_id, state) values (gen_random_uuid(), ${requestId}, 'shipped')`,
      sql`update change_request_events set state = 'shipped'`,
      sql`delete from change_request_events`,
    ];
    for (const attempt of attempts) {
      expect(await sqlState(() => asOwner((tx) => tx.execute(attempt)))).toBe("42501");
    }
    expect(await stateOf(requestId)).toBe("requested");
  });

  it("cannot call the move function on another business's request", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    await dbs.staff.db.update(changeRequests).set({ state: "quoted" }).where(eq(changeRequests.id, requestId));
    const text = await captureErrorText(asOtherOwner((tx) => tx.execute(sql`select change_request_customer_move(${requestId}::uuid, 'decline')`)));
    expect(text).toContain("change_request_not_found");
    expect(await stateOf(requestId)).toBe("quoted");
  });
});

describe("create_change_request", () => {
  it("refuses a ticket that belongs to someone else", async () => {
    const { ticketId } = await makeRequest();
    const text = await captureErrorText(asOtherOwner((tx) => tx.execute(sql`select create_change_request(${ticketId}::uuid, 'website', null)`)));
    expect(text).toContain("change_request_not_allowed");
  });

  it("refuses a ticket with no business, and a second request on the same ticket", async () => {
    const plain = await createSupportTicket(dbs.app.db, {
      userId: OWNER,
      category: "general",
      subject: "A question",
      description: "How do I change my password?",
      submissionKey: "plain-question-abcdefgh",
    });
    expect(await captureErrorText(asOwner((tx) => tx.execute(sql`select create_change_request(${plain.id}::uuid, 'other', null)`)))).toContain("change_request_not_allowed");
    const { ticketId } = await makeRequest();
    expect(await captureErrorText(asOwner((tx) => tx.execute(sql`select create_change_request(${ticketId}::uuid, 'website', null)`)))).toContain("change_requests_ticket_idx");
  });

  it("refuses a ticket that is not new, so an old closed ticket cannot be given a request", async () => {
    for (const status of ["closed", "triaged"]) {
      counter += 1;
      const ticket = await createSupportTicket(dbs.app.db, {
        userId: OWNER,
        businessId,
        category: "website_change",
        subject: "An old question",
        description: "This was sorted out last year.",
        submissionKey: `old-ticket-${counter}-abcdefgh`,
      });
      await dbs.staff.db.execute(sql`update support_tickets set status = ${status}, version = version + 1 where id = ${ticket.id}::uuid`);
      expect(await captureErrorText(asOwner((tx) => tx.execute(sql`select create_change_request(${ticket.id}::uuid, 'website', null)`)))).toContain("change_request_not_allowed");
    }
  });

  it("refuses a kind that is not one of the five", async () => {
    const ticket = await createSupportTicket(dbs.app.db, {
      userId: OWNER,
      businessId,
      category: "general",
      subject: "Something else",
      description: "Please look at this for me.",
      submissionKey: "odd-kind-abcdefgh",
    });
    expect(await captureErrorText(asOwner((tx) => tx.execute(sql`select create_change_request(${ticket.id}::uuid, 'weather', null)`)))).toContain("change_requests_kind_check");
  });
});

describe("the rules every writer follows", () => {
  it("lets staff move a request along every arrow in CHANGE_MOVES and no other, from every state", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    const wrong: string[] = [];
    for (const from of CHANGE_STATES) {
      for (const to of CHANGE_STATES) {
        await forceState(requestId, from);
        let allowed = true;
        try {
          await dbs.staff.db.update(changeRequests).set({ state: to }).where(eq(changeRequests.id, requestId));
        } catch (error) {
          allowed = false;
          const text = (error as { cause?: { message?: string } }).cause?.message ?? "";
          // The arrow is open but the paid quote has no paid charge yet: the move is refused for that, not for the arrows.
          if (text.includes("starts when its charge is paid")) allowed = true;
          else if (!text.includes("cannot move from")) wrong.push(`${from} to ${to} failed for another reason: ${text}`);
        }
        if (allowed !== canMoveChange(from, to)) wrong.push(`${from} to ${to}: database ${allowed ? "allows" : "refuses"}, CHANGE_MOVES says the opposite`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("will not start work on a request nobody has decided to cover", async () => {
    const { requestId } = await makeRequest();
    const text = await captureErrorText(dbs.staff.db.update(changeRequests).set({ state: "in_progress" }).where(eq(changeRequests.id, requestId)));
    expect(text).toContain("change_requests_decided_check");
  });

  it("holds the quote to hours times the hour's price, and all of it or none", async () => {
    const { requestId } = await makeRequest();
    expect(await captureErrorText(dbs.staff.db.update(changeRequests).set({ ...QUOTE, quoteAmountCents: 1 }).where(eq(changeRequests.id, requestId)))).toContain("change_requests_quote_values_check");
    expect(await captureErrorText(dbs.staff.db.update(changeRequests).set({ quoteWhat: "New page" }).where(eq(changeRequests.id, requestId)))).toContain("change_requests_quote_whole_check");
  });

  it("fixes the price and the cover once work has started, and never changes who or what it is about", async () => {
    const { requestId } = await makeRequest();
    await dbs.staff.db.update(changeRequests).set({ coverage: "free", state: "in_progress" }).where(eq(changeRequests.id, requestId));
    expect(await captureErrorText(dbs.staff.db.update(changeRequests).set({ coverage: "included" }).where(eq(changeRequests.id, requestId)))).toContain("fixed once work has started");
    expect(await captureErrorText(dbs.staff.db.update(changeRequests).set({ kind: "billing" }).where(eq(changeRequests.id, requestId)))).toContain("identity cannot change");
    expect(await captureErrorText(dbs.staff.db.update(changeRequests).set({ businessId: otherBusinessId }).where(eq(changeRequests.id, requestId)))).toContain("identity cannot change");
  });

  it("keeps a dated line for every state, with who moved it", async () => {
    const { requestId } = await makeRequest();
    await asStaff((tx) => tx.update(changeRequests).set({ ...QUOTE, state: "quoted" }).where(eq(changeRequests.id, requestId)));
    await startWork(requestId);
    const events = await dbs.staff.db.select().from(changeRequestEvents).where(eq(changeRequestEvents.changeRequestId, requestId)).orderBy(changeRequestEvents.at);
    expect(events.map((event) => [event.state, event.actorUserId])).toEqual([
      ["requested", OWNER],
      ["quoted", STAFF],
      ["in_progress", null],
    ]);
  });

  it("records nothing when a change leaves the state as it was", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    await dbs.staff.db.update(changeRequests).set({ quoteWorkingDays: 7, quoteAmountCents: 150_000 }).where(eq(changeRequests.id, requestId));
    expect(await dbs.staff.db.select().from(changeRequestEvents)).toHaveLength(1);
  });

  it("takes the ticket out of the staff queue when the request ends, and puts it back when it is reopened", async () => {
    const { ticketId, requestId } = await makeRequest();
    const status = async (): Promise<string | undefined> => (await dbs.staff.db.select({ status: supportTickets.status }).from(supportTickets).where(eq(supportTickets.id, ticketId)))[0]?.status;
    expect(await status()).toBe("new");
    await quote(requestId);
    await startWork(requestId);
    expect(await status()).toBe("new");
    await dbs.staff.db.update(changeRequests).set({ state: "shipped" }).where(eq(changeRequests.id, requestId));
    expect(await status()).toBe("resolved");
    await dbs.staff.db.update(changeRequests).set({ state: "revisions" }).where(eq(changeRequests.id, requestId));
    expect(await status()).toBe("triaged");
  });
});

describe("a reply on a change that is ready to check", () => {
  it("sends it back to the team as a fix to make", async () => {
    const { ticketId, requestId } = await makeRequest();
    await quote(requestId);
    await startWork(requestId);
    await dbs.staff.db.update(changeRequests).set({ state: "preview" }).where(eq(changeRequests.id, requestId));
    await appendSupportReply(dbs.app.db, { userId: OWNER, ticketId, body: "The heading should say Dental implants.", submissionKey: "reply-in-preview-abcdefgh" });
    expect(await stateOf(requestId)).toBe("revisions");
  });

  it("leaves a request alone in every other state", async () => {
    const { ticketId, requestId } = await makeRequest();
    await appendSupportReply(dbs.app.db, { userId: OWNER, ticketId, body: "Just checking in on this.", submissionKey: "reply-in-requested-abcdefgh" });
    expect(await stateOf(requestId)).toBe("requested");
  });
});

describe("change_request_customer_move", () => {
  const move = (requestId: string, action: string) => asOwner((tx) => tx.execute<{ state: string }>(sql`select change_request_customer_move(${requestId}::uuid, ${action}) as state`));

  it("lets the customer say not now to a quote, and take it back within 14 days", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    await dbs.staff.db.update(changeRequests).set({ state: "quoted" }).where(eq(changeRequests.id, requestId));
    expect((await move(requestId, "decline")).rows[0]?.state).toBe("withdrawn");
    expect(await stateOf(requestId)).toBe("withdrawn");
    expect((await move(requestId, "reopen")).rows[0]?.state).toBe("quoted");
  });

  it("refuses not now once the quote has been accepted and a charge opened", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    const charge = await insertCharge(dbs.staff.db, {
      businessId,
      kind: "change_hours",
      description: "Extra change hours: New page",
      quantity: 3,
      unitAmountCents: 50_000,
      taxRateBasisPoints: 1800,
      amountCents: 150_000,
      currency: "INR",
      createdByStaffId: null,
    });
    await dbs.staff.db.update(changeRequests).set({ state: "quoted", acceptedAt: new Date(), chargeId: charge.id }).where(eq(changeRequests.id, requestId));
    expect(await captureErrorText(move(requestId, "decline"))).toContain("change_request_wrong_state");
    expect(await stateOf(requestId)).toBe("quoted");
  });

  it("lets the customer approve a change that is ready to check, and no other", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    expect(await captureErrorText(move(requestId, "approve"))).toContain("change_request_wrong_state");
    await forceState(requestId, "preview");
    expect((await move(requestId, "approve")).rows[0]?.state).toBe("approved");
  });

  it("reopens a finished change as a fix, within 14 days of it being finished", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    await forceState(requestId, "in_progress");
    await dbs.staff.db.update(changeRequests).set({ state: "shipped" }).where(eq(changeRequests.id, requestId));
    await dbs.owner.db.execute(sql`update change_request_events set at = now() - interval '15 days' where state = 'shipped'`);
    expect(await captureErrorText(move(requestId, "reopen"))).toContain("change_request_window_closed");
    await dbs.owner.db.execute(sql`update change_request_events set at = now() - interval '13 days' where state = 'shipped'`);
    expect((await move(requestId, "reopen")).rows[0]?.state).toBe("revisions");
  });

  it("refuses an action it does not know, and a reopen of a request that is not finished", async () => {
    const { requestId } = await makeRequest();
    expect(await captureErrorText(move(requestId, "ship"))).toContain("change_request_unknown_action");
    expect(await captureErrorText(move(requestId, "reopen"))).toContain("change_request_wrong_state");
  });
});

/** Starts a quoted request the way a payment does: the customer accepts, the charge is opened, and its payment starts the work. */
async function startWork(requestId: string): Promise<void> {
  counter += 1;
  const chargeId = await openCharge();
  await dbs.staff.db.update(changeRequests).set({ state: "quoted", acceptedAt: new Date(), chargeId }).where(eq(changeRequests.id, requestId));
  await recordChargePayment(dbs.staff.db, { chargeId, businessId, provider: "fake", providerPaymentId: `fake_pay_start_${counter}`, amountCents: 150_000, currency: "INR", paidAt: new Date(), now: new Date() });
}

/** What starting work with no quote clears (see startChangeWithoutQuote). */
const NO_QUOTE_FIELDS = { quoteWhat: null, quoteHours: null, quoteUnitCents: null, quoteAmountCents: null, quoteCurrency: null, quoteWorkingDays: null, quotedAt: null, acceptedAt: null, chargeId: null };

/** An open change_hours charge, as accepting a quote opens one; `overrides` lets a test make the wrong kind of charge. */
async function openCharge(overrides: Partial<Parameters<typeof insertCharge>[1]> = {}): Promise<string> {
  const charge = await insertCharge(dbs.staff.db, {
    businessId,
    kind: "change_hours",
    description: "Extra change hours: New page",
    quantity: 3,
    unitAmountCents: 50_000,
    taxRateBasisPoints: 1800,
    amountCents: 150_000,
    currency: "INR",
    createdByStaffId: null,
    ...overrides,
  });
  return charge.id;
}

/** A quoted request the customer has accepted: the charge is open and linked. */
async function acceptedRequest(): Promise<{ readonly ticketId: string; readonly requestId: string; readonly chargeId: string }> {
  const made = await makeRequest();
  await quote(made.requestId);
  const chargeId = await openCharge();
  await dbs.staff.db.update(changeRequests).set({ state: "quoted", acceptedAt: new Date(), chargeId }).where(eq(changeRequests.id, made.requestId));
  return { ...made, chargeId };
}

describe("the charge a request is paid with", () => {
  it("must be the business's own change_hours charge, used by no other request", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    const link = (chargeId: string) => dbs.staff.db.update(changeRequests).set({ state: "quoted", acceptedAt: new Date(), chargeId }).where(eq(changeRequests.id, requestId));
    expect(await captureErrorText(link(await openCharge({ businessId: otherBusinessId })))).toContain("charge");
    expect(await captureErrorText(link(await openCharge({ kind: "blog_posts" })))).toContain("charge");
    const taken = await acceptedRequest();
    expect(await captureErrorText(link(taken.chargeId))).toContain("charge");
    expect(await stateOf(requestId)).toBe("requested");
    await link(await openCharge());
    expect(await stateOf(requestId)).toBe("quoted");
  });

  it("fixes the quote while the accepted charge stands", async () => {
    const { requestId, chargeId } = await acceptedRequest();
    expect(await captureErrorText(dbs.staff.db.update(changeRequests).set({ quoteHours: 4, quoteAmountCents: 200_000 }).where(eq(changeRequests.id, requestId)))).toContain("fixed");
    expect(await captureErrorText(dbs.staff.db.update(changeRequests).set({ quoteWhat: "Another page" }).where(eq(changeRequests.id, requestId)))).toContain("fixed");
    // Replacing the quote means letting the charge go first.
    const clear = { ...QUOTE, quoteHours: 4, quoteAmountCents: 200_000, acceptedAt: null, chargeId: null };
    expect(await captureErrorText(dbs.staff.db.update(changeRequests).set(clear).where(eq(changeRequests.id, requestId)))).toContain("charge");
    await waiveCharge(dbs.staff.db, { chargeId, businessId, staffId: STAFF, now: new Date() });
    await dbs.staff.db.update(changeRequests).set(clear).where(eq(changeRequests.id, requestId));
    expect(await stateOf(requestId)).toBe("quoted");
  });

  it("does not let work start on an unpaid charge", async () => {
    const { requestId } = await acceptedRequest();
    const text = await captureErrorText(dbs.staff.db.update(changeRequests).set({ state: "in_progress" }).where(eq(changeRequests.id, requestId)));
    expect(text).toContain("paid");
    expect(await stateOf(requestId)).toBe("quoted");
  });

  it("does not let work start on a paid quote the customer has not accepted, so there is no charge to be paid", async () => {
    const { requestId } = await makeRequest();
    await dbs.staff.db.update(changeRequests).set({ ...QUOTE, state: "quoted" }).where(eq(changeRequests.id, requestId));
    const text = await captureErrorText(dbs.staff.db.update(changeRequests).set({ state: "in_progress" }).where(eq(changeRequests.id, requestId)));
    expect(text).toContain("paid");
    expect(await stateOf(requestId)).toBe("quoted");
  });

  it("still starts work with no charge once staff cover the request as free or included", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    await dbs.staff.db.update(changeRequests).set({ coverage: "free", state: "in_progress", ...NO_QUOTE_FIELDS }).where(eq(changeRequests.id, requestId));
    expect(await stateOf(requestId)).toBe("in_progress");
  });

  it("keeps the charge and the acceptance once the charge is paid", async () => {
    const { requestId, chargeId } = await acceptedRequest();
    await recordChargePayment(dbs.staff.db, { chargeId, businessId, provider: "fake", providerPaymentId: "fake_pay_keep", amountCents: 150_000, currency: "INR", paidAt: new Date(), now: new Date() });
    expect(await stateOf(requestId)).toBe("in_progress");
    const update = (set: Partial<typeof changeRequests.$inferInsert>) => captureErrorText(dbs.staff.db.update(changeRequests).set(set).where(eq(changeRequests.id, requestId)));
    expect(await update({ chargeId: null })).toContain("charge");
    expect(await update({ acceptedAt: null })).toContain("charge");
    expect(await update({ chargeId: await openCharge() })).toContain("charge");
    const [row] = await dbs.staff.db.select({ chargeId: changeRequests.chargeId, acceptedAt: changeRequests.acceptedAt }).from(changeRequests).where(eq(changeRequests.id, requestId));
    expect(row?.chargeId).toBe(chargeId);
    expect(row?.acceptedAt).not.toBeNull();
  });

  it("does not let a quote with an open charge be declined or withdrawn until the charge is let go", async () => {
    const { requestId, chargeId } = await acceptedRequest();
    for (const state of ["declined", "withdrawn"] as const) {
      const closedReason = state === "declined" ? "Not something we do" : null;
      expect(await captureErrorText(dbs.staff.db.update(changeRequests).set({ state, closedReason }).where(eq(changeRequests.id, requestId))), state).toContain("charge");
    }
    await waiveCharge(dbs.staff.db, { chargeId, businessId, staffId: STAFF, now: new Date() });
    await dbs.staff.db.update(changeRequests).set({ state: "declined", closedReason: "Not something we do" }).where(eq(changeRequests.id, requestId));
    expect(await stateOf(requestId)).toBe("declined");
  });
});

describe("who may use the customer's door", () => {
  it("lets only the person who sent the request move it, not another member of the business", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    await forceState(requestId, "preview");
    await dbs.staff.db.insert(businessMembers).values({ businessId, userId: OTHER_OWNER, role: "editor" });
    const asColleague = withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId }, (tx) => tx.execute(sql`select change_request_customer_move(${requestId}::uuid, 'approve')`));
    expect(await captureErrorText(asColleague)).toContain("change_request_not_found");
    expect(await stateOf(requestId)).toBe("preview");
  });

  it("makes a request only while signed in to the ticket's own business", async () => {
    const ticket = await createSupportTicket(dbs.app.db, {
      userId: OWNER,
      businessId,
      category: "website_change",
      subject: "Add a Staff page",
      description: "Please add a page about our staff.",
      submissionKey: "request-key-other-business-abcdefgh",
    });
    await dbs.staff.db.insert(businessMembers).values({ businessId: otherBusinessId, userId: OWNER, role: "owner" });
    const inOtherBusiness = withTenantScope(dbs.app.db, { userId: OWNER, businessId: otherBusinessId }, (tx) => tx.execute(sql`select create_change_request(${ticket.id}::uuid, 'website', 'Home')`));
    expect(await captureErrorText(inOtherBusiness)).toContain("change_request_not_allowed");
    expect(await dbs.staff.db.select().from(changeRequests)).toEqual([]);
  });
});

describe("reopening a request whose ticket was closed", () => {
  const closeTicket = (ticketId: string) => dbs.staff.db.execute(sql`update support_tickets set status = 'closed', version = version + 1 where id = ${ticketId}::uuid`);
  const ticketStatus = async (ticketId: string): Promise<string | undefined> => (await dbs.staff.db.select({ status: supportTickets.status }).from(supportTickets).where(eq(supportTickets.id, ticketId)))[0]?.status;

  it("brings the ticket back inside the 14 days, and leaves it closed after", async () => {
    for (const [days, expected] of [[13, "triaged"], [15, "closed"]] as const) {
      const { ticketId, requestId } = await makeRequest();
      await quote(requestId);
      await forceState(requestId, "in_progress");
      await dbs.staff.db.update(changeRequests).set({ state: "shipped" }).where(eq(changeRequests.id, requestId));
      await closeTicket(ticketId);
      await dbs.owner.db.execute(sql`update change_request_events set at = now() - make_interval(days => ${days}) where state = 'shipped' and change_request_id = ${requestId}::uuid`);
      await dbs.staff.db.update(changeRequests).set({ state: "revisions" }).where(eq(changeRequests.id, requestId));
      expect(await ticketStatus(ticketId), `${days} days`).toBe(expected);
    }
  });

  it("never lets a ticket leave closed for any other reason", async () => {
    const { ticketId, requestId } = await makeRequest();
    await quote(requestId);
    await forceState(requestId, "shipped");
    await closeTicket(ticketId);
    const text = await captureErrorText(dbs.staff.db.execute(sql`update support_tickets set status = 'triaged', version = version + 1 where id = ${ticketId}::uuid`));
    expect(text).toContain("Invalid support status transition");
  });
});

describe("the support retention purge", () => {
  it("leaves alone a closed ticket whose request is not over or whose charge is open", async () => {
    const claimed = async (): Promise<string[]> => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return (await claimSupportTicketsDueRetention(dbs.staff.db, new Date(), 100)).ticketIds;
    };
    const close = (ticketId: string) => dbs.staff.db.execute(sql`update support_tickets set status = 'closed', version = version + 1 where id = ${ticketId}::uuid`);
    const open = await makeRequest();
    const withCharge = await acceptedRequest();
    const done = await makeRequest();
    await quote(done.requestId);
    await forceState(done.requestId, "shipped");
    for (const t of [open, withCharge, done]) await close(t.ticketId);
    // A shipped request that still has an open charge is kept too.
    const shippedOpen = await acceptedRequest();
    await dbs.owner.db.execute(sql`alter table change_requests disable trigger change_requests_guard`);
    await dbs.owner.db.execute(sql`update change_requests set state = 'shipped' where id = ${shippedOpen.requestId}::uuid`);
    await dbs.owner.db.execute(sql`alter table change_requests enable trigger change_requests_guard`);
    await close(shippedOpen.ticketId);
    expect(await claimed()).toEqual([done.ticketId]);
  });
});

describe("erasing an account", () => {
  it("takes its change requests and their history along with the tickets", async () => {
    const { requestId } = await makeRequest();
    await quote(requestId);
    await dbs.staff.db.insert(accountClosures).values({ userId: OWNER, businessId, requestedAt: new Date(Date.now() - 86_400_000), eraseAfter: new Date(Date.now() - 1000) });
    await beginSupportAccountErasure(dbs.staff.db, OWNER);
    await dbs.staff.db.transaction((tx) => eraseSupportDataForUser(tx, OWNER));
    expect(await dbs.staff.db.select().from(changeRequests)).toEqual([]);
    expect(await dbs.staff.db.select().from(changeRequestEvents)).toEqual([]);
  });
});
