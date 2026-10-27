import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChangeRequestError, countIncludedEdits } from "./queries/change-requests";
import { acceptChangeQuote, moveChangeAsStaff, sendChangeQuote, startChangeWithoutQuote, type StartWithoutQuoteInput } from "./queries/change-request-staff";
import { findChargeForBusiness, recordChargePayment } from "./queries/charges";
import { insertBusiness } from "./queries/onboarding";
import { createSupportTicketWithOutcome } from "./queries/support";
import { businessMembers, changeRequestEvents, changeRequests, charges, staffMembers, supportTickets, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "crs-owner";
const STAFF = "crs-staff";
const NOT_STAFF = "crs-not-staff";
const NOW = new Date("2026-11-28T05:00:00.000Z");
/** Stands in for the month a request was sent in (the pure rule in @brandbasket/shared works the real one out): around today. */
const windowFor: StartWithoutQuoteInput["windowFor"] = () => ({ from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) });

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
    { id: STAFF, name: "Staff Member", email: `${STAFF}@example.com`, emailVerified: true },
    { id: NOT_STAFF, name: "Not Staff", email: `${NOT_STAFF}@example.com`, emailVerified: true },
  ]);
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF });
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Sai Dental Care", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
  await dbs.staff.db.insert(businessMembers).values({ businessId, userId: OWNER, role: "owner" });
});

/** A request as the form sends it; returns the request's id and its ticket's. */
async function ask(kind: "website" | "social" | "search" | "billing" | "other" = "website"): Promise<{ readonly requestId: string; readonly ticketId: string }> {
  counter += 1;
  const { ticket } = await createSupportTicketWithOutcome(dbs.app.db, {
    userId: OWNER,
    businessId,
    category: "website_change",
    subject: `Change number ${counter}`,
    description: "Please make this change to my website.",
    submissionKey: `staff-key-${counter}-abcdefgh`,
    changeRequest: { kind, page: "Home" },
  });
  const [row] = await dbs.staff.db.select({ id: changeRequests.id }).from(changeRequests).where(eq(changeRequests.ticketId, ticket.id));
  if (row === undefined) throw new Error("No request was made");
  return { requestId: row.id, ticketId: ticket.id };
}

const rowOf = async (requestId: string) => {
  const [row] = await dbs.staff.db.select().from(changeRequests).where(eq(changeRequests.id, requestId));
  if (row === undefined) throw new Error("No such request");
  return row;
};

const start = (requestId: string, coverage: "included" | "free", allowedPerMonth = 2, staffId = STAFF) =>
  startChangeWithoutQuote(dbs.staff.db, { requestId, staffId, coverage, windowFor, allowedPerMonth });

const quoteInput = (requestId: string, overrides: Partial<Parameters<typeof sendChangeQuote>[1]> = {}) => ({
  requestId,
  staffId: STAFF,
  what: "New page",
  hours: 3,
  workingDays: 5,
  unitCents: 50_000,
  currency: "INR" as const,
  now: NOW,
  ...overrides,
});

const codeOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
  } catch (error) {
    return error instanceof ChangeRequestError ? error.code : `other: ${String(error)}`;
  }
  return "no error";
};

describe("startChangeWithoutQuote", () => {
  it("starts a website change as an included edit and counts it", async () => {
    const { requestId } = await ask();
    const view = await start(requestId, "included");
    expect(view).toMatchObject({ state: "in_progress", coverage: "included", quote: null });
    expect(await countIncludedEdits(dbs.staff.db, businessId, windowFor(NOW))).toBe(1);
  });

  it("counts an included edit for the month it was sent in, and stops at the monthly allowance", async () => {
    const first = await ask();
    const second = await ask();
    const third = await ask();
    await start(first.requestId, "included");
    await start(second.requestId, "included");
    expect(await codeOf(start(third.requestId, "included"))).toBe("no_included_left");
    expect((await rowOf(third.requestId)).state).toBe("requested");
  });

  it("gives an edit back when its request is declined", async () => {
    const first = await ask();
    const second = await ask();
    await start(first.requestId, "included", 1);
    expect(await codeOf(start(second.requestId, "included", 1))).toBe("no_included_left");
    await moveChangeAsStaff(dbs.staff.db, { requestId: first.requestId, staffId: STAFF, to: "declined", reason: "We cannot do this one.", now: NOW });
    await start(second.requestId, "included", 1);
    expect((await rowOf(second.requestId)).coverage).toBe("included");
  });

  it("lets two staff members race for the last edit and gives it to one", async () => {
    const first = await ask();
    const second = await ask();
    const results = await Promise.all([codeOf(start(first.requestId, "included", 1)), codeOf(start(second.requestId, "included", 1))]);
    expect(results.sort()).toEqual(["no error", "no_included_left"]);
  });

  it("allows no included edits for a plan without a website", async () => {
    const { requestId } = await ask();
    expect(await codeOf(start(requestId, "included", 0))).toBe("no_included_left");
  });

  it("keeps included edits for website changes, and lets any change be done for free", async () => {
    const billing = await ask("billing");
    expect(await codeOf(start(billing.requestId, "included"))).toBe("not_website");
    await start(billing.requestId, "free");
    expect((await rowOf(billing.requestId)).coverage).toBe("free");
  });

  it("drops a quote the customer has not accepted", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    const view = await start(requestId, "free");
    expect(view).toMatchObject({ state: "in_progress", coverage: "free", quote: null });
  });

  it("refuses a request that has moved on, a stranger, and an unknown request", async () => {
    const { requestId } = await ask();
    await start(requestId, "free");
    expect(await codeOf(start(requestId, "free"))).toBe("wrong_state");
    const other = await ask();
    expect(await codeOf(start(other.requestId, "free", 2, NOT_STAFF))).toBe("forbidden");
    expect(await codeOf(start("00000000-0000-4000-8000-000000000000", "free"))).toBe("not_found");
  });
});

describe("sendChangeQuote", () => {
  it("sends a quote and leaves it dated in the history", async () => {
    const { requestId } = await ask();
    const view = await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    expect(view.state).toBe("quoted");
    expect(view.quote).toMatchObject({ what: "New page", hours: 3, unitCents: 50_000, amountCents: 150_000, currency: "INR", workingDays: 5, quotedAt: NOW });
    const events = await dbs.staff.db.select().from(changeRequestEvents).where(eq(changeRequestEvents.changeRequestId, requestId));
    expect(events.map((event) => [event.state, event.actorUserId]).sort()).toEqual([["quoted", STAFF], ["requested", OWNER]]);
  });

  it("replaces a quote that has not been accepted", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    const view = await sendChangeQuote(dbs.staff.db, quoteInput(requestId, { hours: 2, what: "New page, shorter" }));
    expect(view.quote).toMatchObject({ hours: 2, amountCents: 100_000, what: "New page, shorter" });
    expect(await dbs.staff.db.select().from(changeRequestEvents).where(eq(changeRequestEvents.changeRequestId, requestId))).toHaveLength(2);
  });

  it("gives back the charge of a quote the customer had accepted, when the quote is replaced", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    const accepted = await acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW });
    const view = await sendChangeQuote(dbs.staff.db, quoteInput(requestId, { hours: 4 }));
    expect(view).toMatchObject({ chargeId: null, acceptedAt: null });
    const charge = await findChargeForBusiness(dbs.staff.db, businessId, accepted.chargeId);
    expect(charge).toMatchObject({ status: "waived" });
  });

  it("checks what it is given", async () => {
    const { requestId } = await ask();
    expect(await codeOf(sendChangeQuote(dbs.staff.db, quoteInput(requestId, { hours: 0 })))).toBe("invalid_input");
    expect(await codeOf(sendChangeQuote(dbs.staff.db, quoteInput(requestId, { hours: 41 })))).toBe("invalid_input");
    expect(await codeOf(sendChangeQuote(dbs.staff.db, quoteInput(requestId, { hours: 1.5 })))).toBe("invalid_input");
    expect(await codeOf(sendChangeQuote(dbs.staff.db, quoteInput(requestId, { what: "ab" })))).toBe("invalid_input");
    expect(await codeOf(sendChangeQuote(dbs.staff.db, quoteInput(requestId, { workingDays: 0 })))).toBe("invalid_input");
    expect(await codeOf(sendChangeQuote(dbs.staff.db, quoteInput(requestId, { unitCents: 0 })))).toBe("invalid_input");
    expect(await codeOf(sendChangeQuote(dbs.staff.db, quoteInput(requestId, { staffId: NOT_STAFF })))).toBe("forbidden");
  });

  it("refuses a quote once work has started", async () => {
    const { requestId } = await ask();
    await start(requestId, "free");
    expect(await codeOf(sendChangeQuote(dbs.staff.db, quoteInput(requestId)))).toBe("wrong_state");
  });
});

describe("moveChangeAsStaff", () => {
  it("sends a started change for checking and marks it done, taking its ticket out of the queue", async () => {
    const { requestId, ticketId } = await ask();
    await start(requestId, "free");
    expect((await moveChangeAsStaff(dbs.staff.db, { requestId, staffId: STAFF, to: "preview", now: NOW })).state).toBe("preview");
    expect((await moveChangeAsStaff(dbs.staff.db, { requestId, staffId: STAFF, to: "shipped", now: NOW })).state).toBe("shipped");
    const [ticket] = await dbs.staff.db.select({ status: supportTickets.status }).from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(ticket?.status).toBe("resolved");
  });

  it("declines with a reason the customer reads, and gives back an unpaid charge", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    const accepted = await acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW });
    const view = await moveChangeAsStaff(dbs.staff.db, { requestId, staffId: STAFF, to: "declined", reason: "  We do not build online shops.  ", now: NOW });
    expect(view).toMatchObject({ state: "declined", closedReason: "We do not build online shops." });
    expect((await findChargeForBusiness(dbs.staff.db, businessId, accepted.chargeId))?.status).toBe("waived");
  });

  it("will not decline without a reason, or move along an arrow that does not exist", async () => {
    const { requestId } = await ask();
    expect(await codeOf(moveChangeAsStaff(dbs.staff.db, { requestId, staffId: STAFF, to: "declined", now: NOW }))).toBe("invalid_input");
    expect(await codeOf(moveChangeAsStaff(dbs.staff.db, { requestId, staffId: STAFF, to: "shipped", now: NOW }))).toBe("wrong_state");
    expect(await codeOf(moveChangeAsStaff(dbs.staff.db, { requestId, staffId: NOT_STAFF, to: "declined", reason: "No reason", now: NOW }))).toBe("forbidden");
  });
});

describe("acceptChangeQuote", () => {
  it("turns the quote into a charge for the hours, in the plan's money, with no staff member named", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    const accepted = await acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW });
    expect(accepted.opened).toBe(true);
    const charge = await findChargeForBusiness(dbs.staff.db, businessId, accepted.chargeId);
    expect(charge).toMatchObject({
      kind: "change_hours",
      description: "Extra change hours: New page",
      quantity: 3,
      unitAmountCents: 50_000,
      amountCents: 150_000,
      taxRateBasisPoints: 1800,
      currency: "INR",
      status: "open",
      createdByStaffId: null,
    });
    expect(await rowOf(requestId)).toMatchObject({ state: "quoted", chargeId: accepted.chargeId, acceptedAt: NOW });
  });

  it("gives the same charge when it is pressed twice, even at the same moment", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    const results = await Promise.all([
      acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW }),
      acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW }),
    ]);
    expect(results[0].chargeId).toBe(results[1].chargeId);
    expect(results.map((result) => result.opened).sort()).toEqual([false, true]);
    expect(await dbs.staff.db.select().from(charges)).toHaveLength(1);
  });

  it("opens a new charge when staff waived the first one", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    const first = await acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW });
    await dbs.staff.db.update(charges).set({ status: "waived", waivedAt: NOW, waivedByStaffId: STAFF }).where(eq(charges.id, first.chargeId));
    const second = await acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW });
    expect(second.chargeId).not.toBe(first.chargeId);
    expect(second.opened).toBe(true);
  });

  it("refuses another business's request, a request with no quote, and one that is not found", async () => {
    const { requestId } = await ask();
    expect(await codeOf(acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW }))).toBe("wrong_state");
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    expect(await codeOf(acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId: otherBusinessId, taxRateBasisPoints: 1800, now: NOW }))).toBe("not_found");
    expect(await codeOf(acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId: "00000000-0000-4000-8000-000000000000", businessId, taxRateBasisPoints: 1800, now: NOW }))).toBe("not_found");
    expect(await dbs.staff.db.select().from(charges)).toEqual([]);
  });

  it("refuses a member of the business who is not the person who asked, and opens nothing", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    await dbs.staff.db.insert(businessMembers).values({ businessId, userId: NOT_STAFF, role: "editor" });
    expect(await codeOf(acceptChangeQuote(dbs.staff.db, { userId: NOT_STAFF, requestId, businessId, taxRateBasisPoints: 1800, now: NOW }))).toBe("not_found");
    expect(await dbs.staff.db.select().from(charges)).toEqual([]);
    expect(await rowOf(requestId)).toMatchObject({ state: "quoted", chargeId: null, acceptedAt: null });
  });
});

describe("paying for a quote", () => {
  const pay = (chargeId: string, amountCents = 150_000, providerPaymentId = "fake_pay_1") =>
    recordChargePayment(dbs.staff.db, { chargeId, businessId, provider: "fake", providerPaymentId, amountCents, currency: "INR", paidAt: NOW, now: NOW });

  it("starts the change in the same moment the payment is recorded", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    const { chargeId } = await acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW });
    expect((await pay(chargeId)).outcome).toBe("paid");
    expect((await rowOf(requestId)).state).toBe("in_progress");
    const events = await dbs.staff.db.select().from(changeRequestEvents).where(eq(changeRequestEvents.changeRequestId, requestId));
    expect(events.find((event) => event.state === "in_progress")?.actorUserId).toBeNull();
  });

  it("does not start it when the money does not match the charge", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    const { chargeId } = await acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW });
    expect((await pay(chargeId, 100_000)).outcome).toBe("amount-mismatch");
    expect((await rowOf(requestId)).state).toBe("quoted");
  });

  it("leaves a charge staff added by hand, with no request, to pay as it always did", async () => {
    const { requestId } = await ask();
    const [manual] = await dbs.staff.db
      .insert(charges)
      .values({ businessId, kind: "change_hours", description: "Extra change hours", quantity: 2, unitAmountCents: 50_000, taxRateBasisPoints: 1800, amountCents: 100_000, currency: "INR", createdByStaffId: STAFF })
      .returning();
    expect((await pay(manual?.id ?? "", 100_000, "fake_pay_manual")).outcome).toBe("paid");
    expect((await rowOf(requestId)).state).toBe("requested");
  });

  it("is safe to run when the payment arrives twice", async () => {
    const { requestId } = await ask();
    await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
    const { chargeId } = await acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW });
    await pay(chargeId);
    const again = await pay(chargeId);
    expect(again.alreadyRecorded).toBe(true);
    expect((await rowOf(requestId)).state).toBe("in_progress");
  });
});

describe("a quote changed while its payment arrives", () => {
  it("never deadlocks: either the payment wins and the change has started, or the quote wins and the payment is set aside", async () => {
    for (let round = 0; round < 8; round += 1) {
      const { requestId } = await ask();
      await sendChangeQuote(dbs.staff.db, quoteInput(requestId));
      const { chargeId } = await acceptChangeQuote(dbs.staff.db, { userId: OWNER, requestId, businessId, taxRateBasisPoints: 1800, now: NOW });
      const outcomes = await Promise.allSettled([
        sendChangeQuote(dbs.staff.db, quoteInput(requestId, { hours: 2 })),
        recordChargePayment(dbs.staff.db, { chargeId, businessId, provider: "fake", providerPaymentId: `fake_race_${round}`, amountCents: 150_000, currency: "INR", paidAt: NOW, now: NOW }),
      ]);
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") expect(outcome.reason, `round ${round}`).toBeInstanceOf(ChangeRequestError);
      }
      const state = (await rowOf(requestId)).state;
      expect(["quoted", "in_progress"], `round ${round}`).toContain(state);
    }
  });
});
