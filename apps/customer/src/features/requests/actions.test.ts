import { appendSupportReplyWithOutcome, ChangeRequestError, createSupportTicketWithOutcome, findTicketIdOfChangeRequest, markSupportTicketRead, moveChangeAsCustomer, SupportQueryError, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptQuoteAction, approveChangeAction, declineQuoteAction, markReadAction, reopenRequestAction, replyAction, sendRequestAction } from "./actions";
import { startCustomerChargePayment } from "@/features/checkout/server/charges";
import { openQuoteCharge, sendReplyAlert, sendRequestAcknowledgement, sendTicketAlert, supportRateLimit } from "./server";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })), getStaffDb: vi.fn(() => ({ kind: "staff-db" })) }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireBilling: vi.fn(), requireCustomer: vi.fn() }));
vi.mock("@/features/checkout/server/charges", () => ({ startCustomerChargePayment: vi.fn() }));
vi.mock("./server", () => ({ openQuoteCharge: vi.fn(), sendReplyAlert: vi.fn(), sendRequestAcknowledgement: vi.fn(), sendTicketAlert: vi.fn(), supportRateLimit: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  appendSupportReplyWithOutcome: vi.fn(),
  createSupportTicketWithOutcome: vi.fn(),
  findTicketIdOfChangeRequest: vi.fn(),
  markSupportTicketRead: vi.fn(),
  moveChangeAsCustomer: vi.fn(),
  withTenantScope: vi.fn(async (_db: unknown, _tenant: unknown, work: (tx: unknown) => unknown) => work({ kind: "tx" })),
}));

const { requireBilling, requireCustomer } = await import("@/lib/guards");

const TICKET = "0192f3c4-0000-7000-8000-0000000000aa";
const REQUEST = "0192f3c4-0000-7000-8000-0000000000bb";
const MESSAGE = "0192f3c4-0000-7000-8000-0000000000cc";
const KEY = "ask-key-12345678";

function customer(role: "owner" | "editor" | "viewer" = "owner") {
  return {
    user: { id: "user-1", name: "Meera", email: "meera@example.test" },
    tenant: { userId: "user-1", businessId: "business-1", businessName: "Sai Dental Care", role },
    businessId: "business-1",
    businessName: "Sai Dental Care",
    role,
    billing: { plan: { taxRateBasisPoints: 1800 } },
    services: ["website", "social"],
    currency: "INR",
  } as never;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireBilling).mockResolvedValue(customer());
  vi.mocked(requireCustomer).mockResolvedValue(customer());
  vi.mocked(supportRateLimit).mockResolvedValue(null);
  vi.mocked(sendTicketAlert).mockResolvedValue(undefined);
  vi.mocked(sendReplyAlert).mockResolvedValue(undefined);
  vi.mocked(sendRequestAcknowledgement).mockResolvedValue(undefined);
  vi.mocked(createSupportTicketWithOutcome).mockResolvedValue({ ticket: { id: TICKET, displayRef: "FY-1" } as never, created: true });
});

describe("sendRequestAction", () => {
  const good = { intent: "website_update", page: " Home ", body: "Add an Implants page, like the root canal page.", submissionKey: KEY };

  it("calls the live-period guard, opens a change request for a website change and tells the team once", async () => {
    const result = await sendRequestAction(null, form(good));
    expect(result).toEqual({ ok: true, data: { ticketId: TICKET } });
    expect(requireBilling).toHaveBeenCalledOnce();
    expect(createSupportTicketWithOutcome).toHaveBeenCalledWith(
      { kind: "app-db" },
      expect.objectContaining({
        userId: "user-1",
        businessId: "business-1",
        category: "website_change",
        subject: "Add an Implants page, like the root canal page",
        details: { pageUrl: "Home" },
        submissionKey: KEY,
        changeRequest: { kind: "website", page: "Home" },
      }),
    );
    expect(sendTicketAlert).toHaveBeenCalledOnce();
    expect(sendRequestAcknowledgement).toHaveBeenCalledOnce();
  });

  it("files a question as a plain conversation, and does not tell the team again for a retried key", async () => {
    vi.mocked(createSupportTicketWithOutcome).mockResolvedValue({ ticket: { id: TICKET, displayRef: "FY-1" } as never, created: false });
    const result = await sendRequestAction(null, form({ ...good, intent: "question" }));
    expect(result.ok).toBe(true);
    expect(vi.mocked(createSupportTicketWithOutcome).mock.calls[0]?.[1]).not.toHaveProperty("changeRequest");
    expect(sendTicketAlert).not.toHaveBeenCalled();
    expect(sendRequestAcknowledgement).not.toHaveBeenCalled();
  });

  it("refuses a viewer, writing nothing", async () => {
    vi.mocked(requireBilling).mockResolvedValue(customer("viewer"));
    expect(await sendRequestAction(null, form(good))).toMatchObject({ ok: false });
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
  });

  it("refuses an intent about a service the customer has not bought", async () => {
    expect(await sendRequestAction(null, form({ ...good, intent: "search_request" }))).toMatchObject({ ok: false, fieldErrors: { intent: "Choose what this is about." } });
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
  });

  it("returns the field messages for a form that does not pass, and writes nothing", async () => {
    const result = await sendRequestAction(null, form({ ...good, body: "Short" }));
    expect(result).toEqual({ ok: false, message: "Tell us a little more, in at least 10 characters.", fieldErrors: { body: "Tell us a little more, in at least 10 characters." } });
    expect(supportRateLimit).not.toHaveBeenCalled();
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
  });

  it("stops at the rate limit with its sentence", async () => {
    vi.mocked(supportRateLimit).mockResolvedValue("Please wait 30 seconds before sending another request.");
    expect(await sendRequestAction(null, form(good))).toEqual({ ok: false, message: "Please wait 30 seconds before sending another request." });
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
  });

  it("says what a conflicting key means, and keeps other faults to a sentence the customer can act on", async () => {
    vi.mocked(createSupportTicketWithOutcome).mockRejectedValueOnce(new SupportQueryError("conflict", "x"));
    expect(await sendRequestAction(null, form(good))).toEqual({ ok: false, message: "This request changed. Refresh the page and try again." });
    vi.mocked(createSupportTicketWithOutcome).mockRejectedValueOnce(new Error("connection reset"));
    expect(await sendRequestAction(null, form(good))).toEqual({ ok: false, message: "Your request could not be saved. What you wrote is still here; try again." });
  });
});

describe("replyAction", () => {
  const good = { ticketId: TICKET, body: "Thank you, that looks right.", submissionKey: KEY };

  it("saves the reply for the session's person and tells the team once", async () => {
    vi.mocked(appendSupportReplyWithOutcome).mockResolvedValue({ message: { id: MESSAGE } as never, created: true });
    expect(await replyAction(null, form(good))).toEqual({ ok: true });
    expect(requireCustomer).toHaveBeenCalledOnce();
    expect(appendSupportReplyWithOutcome).toHaveBeenCalledWith({ kind: "app-db" }, { userId: "user-1", ticketId: TICKET, body: "Thank you, that looks right.", attachmentIds: [], submissionKey: KEY });
    expect(sendReplyAlert).toHaveBeenCalledOnce();
  });

  it("does not tell the team again for a replayed reply", async () => {
    vi.mocked(appendSupportReplyWithOutcome).mockResolvedValue({ message: { id: MESSAGE } as never, created: false });
    expect(await replyAction(null, form(good))).toEqual({ ok: true });
    expect(sendReplyAlert).not.toHaveBeenCalled();
  });

  it("refuses an empty reply, a bad ticket and a viewer before writing", async () => {
    expect(await replyAction(null, form({ ...good, body: " " }))).toMatchObject({ ok: false, message: "Write a reply." });
    expect(await replyAction(null, form({ ...good, ticketId: "nope" }))).toMatchObject({ ok: false, message: "This request could not be found." });
    vi.mocked(requireCustomer).mockResolvedValue(customer("viewer"));
    expect(await replyAction(null, form(good))).toMatchObject({ ok: false });
    expect(appendSupportReplyWithOutcome).not.toHaveBeenCalled();
  });

  it("applies the reply rate limit, and says a closed request is closed", async () => {
    vi.mocked(supportRateLimit).mockResolvedValueOnce("Please wait 5 seconds before sending another request.");
    expect(await replyAction(null, form(good))).toMatchObject({ ok: false, message: "Please wait 5 seconds before sending another request." });
    expect(supportRateLimit).toHaveBeenCalledWith("user-1", true);
    vi.mocked(appendSupportReplyWithOutcome).mockRejectedValue(new SupportQueryError("closed", "x"));
    expect(await replyAction(null, form(good))).toEqual({ ok: false, message: "This request is closed. Open a new request to continue." });
  });
});

describe.each([
  ["decline", declineQuoteAction],
  ["approve", approveChangeAction],
  ["reopen", reopenRequestAction],
] as const)("the %s move", (move, action) => {
  it("runs the database's move for the session's business", async () => {
    vi.mocked(moveChangeAsCustomer).mockResolvedValue("withdrawn");
    expect(await action(form({ requestId: REQUEST }))).toEqual({ ok: true });
    expect(withTenantScope).toHaveBeenCalledWith({ kind: "app-db" }, expect.objectContaining({ businessId: "business-1" }), expect.any(Function));
    expect(moveChangeAsCustomer).toHaveBeenCalledWith({ kind: "tx" }, REQUEST, move);
  });

  it("rejects something that is not an id, and a viewer, without moving anything", async () => {
    expect(await action(form({ requestId: "1; drop" }))).toMatchObject({ ok: false });
    vi.mocked(requireCustomer).mockResolvedValue(customer("viewer"));
    expect(await action(form({ requestId: REQUEST }))).toMatchObject({ ok: false });
    expect(moveChangeAsCustomer).not.toHaveBeenCalled();
  });

  it("says the request has changed, the window is over, or it failed, by the database's code", async () => {
    vi.mocked(moveChangeAsCustomer).mockRejectedValueOnce(new ChangeRequestError("wrong_state", "x"));
    expect(await action(form({ requestId: REQUEST }))).toEqual({ ok: false, message: "This request has changed since you opened it. Have a look at where it is now." });
    vi.mocked(moveChangeAsCustomer).mockRejectedValueOnce(new ChangeRequestError("window_closed", "x"));
    expect(await action(form({ requestId: REQUEST }))).toEqual({ ok: false, message: "The 14 days to reopen this are over. Write to us below and we will help." });
    vi.mocked(moveChangeAsCustomer).mockRejectedValueOnce(new Error("boom"));
    expect(await action(form({ requestId: REQUEST }))).toEqual({ ok: false, message: "That did not work. Please try again." });
  });
});

describe("acceptQuoteAction", () => {
  it("opens the charge for a request of the session's business and returns where to pay it", async () => {
    vi.mocked(findTicketIdOfChangeRequest).mockResolvedValue(TICKET);
    vi.mocked(openQuoteCharge).mockResolvedValue({ chargeId: "charge-9" });
    vi.mocked(startCustomerChargePayment).mockResolvedValue({ kind: "razorpay", orderId: "order_1", charge: {} as never });
    expect(await acceptQuoteAction(form({ requestId: REQUEST }))).toEqual({ ok: true, data: { href: "/checkout/charges/charge-9" } });
    // The Razorpay pay page only reads the stored order, so the order must be opened here, once, for this charge.
    expect(startCustomerChargePayment).toHaveBeenCalledOnce();
    expect(startCustomerChargePayment).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-1" }), "charge-9");
    expect(requireBilling).toHaveBeenCalledOnce();
    expect(findTicketIdOfChangeRequest).toHaveBeenCalledWith({ kind: "tx" }, "business-1", REQUEST);
    expect(openQuoteCharge).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-1" }), REQUEST, expect.any(Date));
  });

  it("goes to the fake provider's test page when it opened the payment itself", async () => {
    vi.mocked(findTicketIdOfChangeRequest).mockResolvedValue(TICKET);
    vi.mocked(openQuoteCharge).mockResolvedValue({ chargeId: "charge-9" });
    vi.mocked(startCustomerChargePayment).mockResolvedValue({ kind: "redirect", url: "/billing/charges/confirm?token=t" });
    expect(await acceptQuoteAction(form({ requestId: REQUEST }))).toEqual({ ok: true, data: { href: "/billing/charges/confirm?token=t" } });
  });

  it("says the request has changed when the charge is already paid or gone", async () => {
    vi.mocked(findTicketIdOfChangeRequest).mockResolvedValue(TICKET);
    vi.mocked(openQuoteCharge).mockResolvedValue({ chargeId: "charge-9" });
    for (const kind of ["not-open", "not-found"] as const) {
      vi.mocked(startCustomerChargePayment).mockResolvedValueOnce({ kind });
      expect(await acceptQuoteAction(form({ requestId: REQUEST }))).toEqual({ ok: false, message: "This request has changed since you opened it. Have a look at where it is now." });
    }
  });

  it("opens nothing for a request the business does not have, a bad id or a viewer", async () => {
    vi.mocked(findTicketIdOfChangeRequest).mockResolvedValue(null);
    expect(await acceptQuoteAction(form({ requestId: REQUEST }))).toMatchObject({ ok: false });
    expect(await acceptQuoteAction(form({ requestId: "x" }))).toMatchObject({ ok: false });
    vi.mocked(requireBilling).mockResolvedValue(customer("viewer"));
    expect(await acceptQuoteAction(form({ requestId: REQUEST }))).toMatchObject({ ok: false });
    expect(openQuoteCharge).not.toHaveBeenCalled();
    expect(startCustomerChargePayment).not.toHaveBeenCalled();
  });

  it("says the request has changed when the quote is no longer there, and that it failed on any other fault", async () => {
    vi.mocked(findTicketIdOfChangeRequest).mockResolvedValue(TICKET);
    vi.mocked(openQuoteCharge).mockRejectedValueOnce(new ChangeRequestError("wrong_state", "x"));
    expect(await acceptQuoteAction(form({ requestId: REQUEST }))).toEqual({ ok: false, message: "This request has changed since you opened it. Have a look at where it is now." });
    vi.mocked(openQuoteCharge).mockRejectedValueOnce(new ChangeRequestError("forbidden", "no plan"));
    expect(await acceptQuoteAction(form({ requestId: REQUEST }))).toEqual({ ok: false, message: "That did not work. Please try again." });
  });
});

describe("markReadAction", () => {
  it("marks the message read for the session's person", async () => {
    expect(await markReadAction(TICKET, MESSAGE)).toEqual({ ok: true });
    expect(markSupportTicketRead).toHaveBeenCalledWith({ kind: "app-db" }, "user-1", TICKET, MESSAGE);
  });

  it("refuses ids that are not ids and reports a failed write without throwing", async () => {
    expect(await markReadAction("x", MESSAGE)).toMatchObject({ ok: false });
    expect(markSupportTicketRead).not.toHaveBeenCalled();
    vi.mocked(markSupportTicketRead).mockRejectedValueOnce(new Error("down"));
    expect(await markReadAction(TICKET, MESSAGE)).toMatchObject({ ok: false });
  });
});
