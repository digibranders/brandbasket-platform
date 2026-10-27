import { appendSupportMessageByStaff, ChangeRequestError, getChangeRequestForStaff, moveChangeAsStaff, sendChangeQuote, startChangeWithoutQuote } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import { notifyRequester } from "@/lib/server/request-notify";
import { requestPricing } from "@/lib/server/request-pricing";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { moveRequestAction, sendQuoteAction, startWithoutQuoteAction } from "./request-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, appendSupportMessageByStaff: vi.fn(), getChangeRequestForStaff: vi.fn(), moveChangeAsStaff: vi.fn(), sendChangeQuote: vi.fn(), startChangeWithoutQuote: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/request-notify", () => ({ notifyRequester: vi.fn() }));
vi.mock("@/lib/server/request-pricing", () => ({ requestPricing: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const OTHER_BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a8999";
const REQUEST = "01a0f71b-8402-7d48-a90a-207e8c8a8001";
const TICKET = "01a0f71b-8402-7d48-a90a-207e8c8a8002";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const DB = { db: true } as never;
const PRICING = { unitCents: 50_000, currency: "INR" as const, includedAllowed: 2 };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const QUOTE_FORM = { businessId: BUSINESS, requestId: REQUEST, what: "New page", hours: "3", workingDays: "5", note: "" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(getChangeRequestForStaff).mockResolvedValue({ ticketId: TICKET, change: { businessId: BUSINESS } } as never);
  vi.mocked(requestPricing).mockResolvedValue(PRICING);
  vi.mocked(notifyRequester).mockResolvedValue("emailed");
  vi.mocked(sendChangeQuote).mockResolvedValue({ quote: { amountCents: 150_000 } } as never);
  vi.mocked(startChangeWithoutQuote).mockResolvedValue({} as never);
  vi.mocked(moveChangeAsStaff).mockResolvedValue({} as never);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("every request action", () => {
  const actions = [
    ["sendQuoteAction", sendQuoteAction, QUOTE_FORM],
    ["startWithoutQuoteAction", startWithoutQuoteAction, { businessId: BUSINESS, requestId: REQUEST, coverage: "free" }],
    ["moveRequestAction", moveRequestAction, { businessId: BUSINESS, requestId: REQUEST, to: "preview" }],
  ] as const;

  it.each(actions)("%s is refused for a session that is not staff's, and does nothing", async (_name, action, fields) => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(action(form(fields))).rejects.toThrow("NEXT_REDIRECT");
    expect(getChangeRequestForStaff).not.toHaveBeenCalled();
    expect(sendChangeQuote).not.toHaveBeenCalled();
    expect(startChangeWithoutQuote).not.toHaveBeenCalled();
    expect(moveChangeAsStaff).not.toHaveBeenCalled();
  });

  it.each(actions)("%s throws on ids that are not ids", async (_name, action, fields) => {
    await expect(action(form({ ...fields, businessId: "x" }))).rejects.toThrow("must be a valid id");
    await expect(action(form({ ...fields, requestId: "x" }))).rejects.toThrow("must be a valid id");
  });

  it.each(actions)("%s throws, before changing anything, when the request is another business's", async (_name, action, fields) => {
    vi.mocked(getChangeRequestForStaff).mockResolvedValue({ ticketId: TICKET, change: { businessId: OTHER_BUSINESS } } as never);
    await expect(action(form(fields))).rejects.toThrow("does not belong to this business");
    expect(sendChangeQuote).not.toHaveBeenCalled();
    expect(startChangeWithoutQuote).not.toHaveBeenCalled();
    expect(moveChangeAsStaff).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
    vi.mocked(getChangeRequestForStaff).mockResolvedValue(null);
    await expect(action(form(fields))).rejects.toThrow("does not belong to this business");
  });
});

describe("sendQuoteAction", () => {
  it("quotes at the plan's price as the signed-in staff member, logs it, emails the customer and returns to the section", async () => {
    await expect(sendQuoteAction(form(QUOTE_FORM))).rejects.toThrow(`redirect:/clients/${BUSINESS}?requests=quoted&mail=emailed#requests`);
    expect(sendChangeQuote).toHaveBeenCalledWith(DB, { requestId: REQUEST, staffId: "staff-1", what: "New page", hours: 3, workingDays: 5, unitCents: 50_000, currency: "INR", now: expect.any(Date) });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "change_request.quote", targetType: "change_request", targetId: REQUEST, businessId: BUSINESS });
    expect(notifyRequester).toHaveBeenCalledWith(DB, TICKET, {
      kind: "quote",
      line: "New page, 3 hours at ₹500 an hour, GST included",
      total: "₹1,500",
      workingDays: 5,
      note: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("takes no price from the form", async () => {
    await expect(sendQuoteAction(form({ ...QUOTE_FORM, unitCents: "1", amountCents: "1", currency: "USD" }))).rejects.toThrow("requests=quoted");
    expect(sendChangeQuote).toHaveBeenCalledWith(DB, expect.objectContaining({ unitCents: 50_000, currency: "INR" }));
  });

  it("adds the note to the conversation as a reply and to the email", async () => {
    await expect(sendQuoteAction(form({ ...QUOTE_FORM, note: "Happy to. We use your photos." }))).rejects.toThrow("requests=quoted");
    expect(appendSupportMessageByStaff).toHaveBeenCalledWith(DB, { staffUserId: "staff-1", ticketId: TICKET, body: "Happy to. We use your photos.", visibility: "public", submissionKey: expect.any(String) });
    expect(vi.mocked(notifyRequester).mock.calls[0]?.[2]).toMatchObject({ note: "Happy to. We use your photos." });
  });

  it("still sends the quote and the email when the note cannot be added", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(appendSupportMessageByStaff).mockRejectedValue(new Error("db down"));
    await expect(sendQuoteAction(form({ ...QUOTE_FORM, note: "Happy to." }))).rejects.toThrow("requests=quoted&mail=emailed");
    log.mockRestore();
  });

  it("changes nothing for a form that is not valid, or a business with no plan", async () => {
    await expect(sendQuoteAction(form({ ...QUOTE_FORM, hours: "0" }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?requests=invalid#requests`);
    vi.mocked(requestPricing).mockResolvedValue(null);
    await expect(sendQuoteAction(form(QUOTE_FORM))).rejects.toThrow("requests=no-plan");
    expect(sendChangeQuote).not.toHaveBeenCalled();
    expect(notifyRequester).not.toHaveBeenCalled();
  });

  it("says the request has moved on when the database refuses, and neither logs nor emails", async () => {
    vi.mocked(sendChangeQuote).mockRejectedValue(new ChangeRequestError("wrong_state", "x"));
    await expect(sendQuoteAction(form(QUOTE_FORM))).rejects.toThrow("requests=moved");
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
    expect(notifyRequester).not.toHaveBeenCalled();
  });

  it("rethrows a fault it does not know", async () => {
    vi.mocked(sendChangeQuote).mockRejectedValue(new Error("db down"));
    await expect(sendQuoteAction(form(QUOTE_FORM))).rejects.toThrow("db down");
  });

  it("lets a failed access log through: an unlogged action must not look successful", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(sendQuoteAction(form(QUOTE_FORM))).rejects.toThrow("log down");
  });

  it("tells staff when the customer could not be emailed", async () => {
    vi.mocked(notifyRequester).mockResolvedValue("no-email");
    await expect(sendQuoteAction(form(QUOTE_FORM))).rejects.toThrow("requests=quoted&mail=no-email");
  });
});

describe("startWithoutQuoteAction", () => {
  it("starts an included edit with the plan's allowance and the month the request was sent in, then emails", async () => {
    await expect(startWithoutQuoteAction(form({ businessId: BUSINESS, requestId: REQUEST, coverage: "included" }))).rejects.toThrow(`requests=started&mail=emailed#requests`);
    expect(startChangeWithoutQuote).toHaveBeenCalledWith(DB, expect.objectContaining({ requestId: REQUEST, staffId: "staff-1", coverage: "included", allowedPerMonth: 2 }));
    const { windowFor } = vi.mocked(startChangeWithoutQuote).mock.calls[0]?.[1] ?? {};
    expect(windowFor?.(new Date("2026-11-15T10:00:00.000Z")).from.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(expect.objectContaining({ action: "change_request.included" }));
    expect(notifyRequester).toHaveBeenCalledWith(DB, TICKET, { kind: "started", readyBy: null });
  });

  it("starts a request at no charge, and allows no included edits to a business with no plan", async () => {
    vi.mocked(requestPricing).mockResolvedValue(null);
    await expect(startWithoutQuoteAction(form({ businessId: BUSINESS, requestId: REQUEST, coverage: "free" }))).rejects.toThrow("requests=started");
    expect(startChangeWithoutQuote).toHaveBeenCalledWith(DB, expect.objectContaining({ coverage: "free", allowedPerMonth: 0 }));
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(expect.objectContaining({ action: "change_request.free" }));
  });

  it("refuses a coverage that is not one of the two", async () => {
    await expect(startWithoutQuoteAction(form({ businessId: BUSINESS, requestId: REQUEST, coverage: "paid" }))).rejects.toThrow("included edit or at no charge");
    expect(startChangeWithoutQuote).not.toHaveBeenCalled();
  });

  it("says what is wrong when there is no included edit left, or the change is not a website change", async () => {
    vi.mocked(startChangeWithoutQuote).mockRejectedValue(new ChangeRequestError("no_included_left", "x"));
    await expect(startWithoutQuoteAction(form({ businessId: BUSINESS, requestId: REQUEST, coverage: "included" }))).rejects.toThrow("requests=no-included-left");
    vi.mocked(startChangeWithoutQuote).mockRejectedValue(new ChangeRequestError("not_website", "x"));
    await expect(startWithoutQuoteAction(form({ businessId: BUSINESS, requestId: REQUEST, coverage: "included" }))).rejects.toThrow("requests=not-website");
    expect(notifyRequester).not.toHaveBeenCalled();
  });
});

describe("moveRequestAction", () => {
  const move = (to: string, extra: Record<string, string> = {}) => moveRequestAction(form({ businessId: BUSINESS, requestId: REQUEST, to, ...extra }));

  it("sends a change for checking and tells the customer it is ready", async () => {
    await expect(move("preview")).rejects.toThrow("requests=previewed&mail=emailed");
    expect(moveChangeAsStaff).toHaveBeenCalledWith(DB, { requestId: REQUEST, staffId: "staff-1", to: "preview", now: expect.any(Date) });
    expect(notifyRequester).toHaveBeenCalledWith(DB, TICKET, { kind: "ready" });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(expect.objectContaining({ action: "change_request.preview", targetId: REQUEST }));
  });

  it("marks a change done and tells the customer", async () => {
    await expect(move("shipped")).rejects.toThrow("requests=finished");
    expect(notifyRequester).toHaveBeenCalledWith(DB, TICKET, { kind: "done" });
  });

  it("declines with the reason, and tells the customer why", async () => {
    await expect(move("declined", { reason: "  We do not build online shops.  " })).rejects.toThrow("requests=declined");
    expect(moveChangeAsStaff).toHaveBeenCalledWith(DB, expect.objectContaining({ to: "declined", reason: "We do not build online shops." }));
    expect(notifyRequester).toHaveBeenCalledWith(DB, TICKET, { kind: "closed", reason: "We do not build online shops." });
  });

  it("will not decline without a reason", async () => {
    await expect(move("declined", { reason: "no" })).rejects.toThrow("requests=invalid");
    expect(moveChangeAsStaff).not.toHaveBeenCalled();
  });

  it("refuses a move that is not one of the three", async () => {
    for (const to of ["approved", "in_progress", "quoted", ""]) await expect(move(to)).rejects.toThrow("sent for checking, marked done or declined");
    expect(moveChangeAsStaff).not.toHaveBeenCalled();
  });

  it("says the request has moved on when the database refuses the arrow", async () => {
    vi.mocked(moveChangeAsStaff).mockRejectedValue(new ChangeRequestError("wrong_state", "x"));
    await expect(move("shipped")).rejects.toThrow("requests=moved");
    expect(notifyRequester).not.toHaveBeenCalled();
  });
});
