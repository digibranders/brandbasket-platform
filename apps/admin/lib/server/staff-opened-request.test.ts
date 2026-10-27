import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SupportQueryError } from "@brandbasket/db";
import type { GrantedStaff } from "./staff-access";
import { createOpenRequestAction, type OpenRequestDependencies } from "./staff-opened-request";

const BUSINESS = "0192f3c4-2222-7000-8000-000000000001";
const TICKET = "0192f3c4-2222-7000-8000-000000000002";
const STAFF = { user: { id: "staff-riya" }, staff: { userId: "staff-riya", role: "support" } } as unknown as GrantedStaff;
const VALID = { businessId: BUSINESS, category: "website_change", subject: "Change the Sunday hours", body: "Asked on the phone: open at 10 on Sundays.", submissionKey: "open-key-12345" };

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function fixture() {
  const deps = {
    requireStaff: vi.fn().mockResolvedValue(STAFF),
    createTicket: vi.fn().mockResolvedValue({ ticket: { id: TICKET, displayRef: "FY-0192F3C4" }, created: true }),
    emailOwner: vi.fn().mockResolvedValue("emailed"),
    recordAction: vi.fn().mockResolvedValue(undefined),
    revalidate: vi.fn(),
    reportUnexpected: vi.fn().mockResolvedValue("issue-1"),
  } satisfies OpenRequestDependencies;
  return { deps, open: createOpenRequestAction(deps) };
}

describe("opening a request for a client", () => {
  it("checks staff access first and writes as the signed-in staff member", async () => {
    const { deps, open } = fixture();
    await open(form(VALID));
    expect(deps.requireStaff).toHaveBeenCalledTimes(1);
    expect(deps.createTicket).toHaveBeenCalledWith({ ...VALID, staffUserId: "staff-riya" });
    deps.requireStaff.mockRejectedValue(new Error("unauthorized"));
    await expect(open(form(VALID))).rejects.toThrow("unauthorized");
  });

  it("refuses a short subject or message without opening anything", async () => {
    const { deps, open } = fixture();
    const result = await open(form({ ...VALID, subject: "Hi" }));
    expect(result.kind).toBe("invalid");
    expect(deps.createTicket).not.toHaveBeenCalled();
  });

  it("emails the owner, records the action and returns the new request", async () => {
    const { deps, open } = fixture();
    const result = await open(form(VALID));
    expect(deps.emailOwner).toHaveBeenCalledWith({ businessId: BUSINESS, ticketId: TICKET, subject: VALID.subject });
    expect(deps.recordAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ businessId: BUSINESS, kind: "request.opened_for_client", summary: "Opened a request for the client" }));
    expect(deps.revalidate).toHaveBeenCalledWith(TICKET);
    expect(result).toEqual({ kind: "saved", message: "Request opened. We emailed the owner a link to it.", ticketId: TICKET, openedOutcome: "emailed" });
  });

  it("keeps the request when the email fails, and says so", async () => {
    const { deps, open } = fixture();
    deps.emailOwner.mockRejectedValue(new Error("Brevo down"));
    const result = await open(form(VALID));
    expect(result.openedOutcome).toBe("failed");
    expect(deps.recordAction).toHaveBeenCalledTimes(1);
  });

  it("does not email or record twice for a form sent again", async () => {
    const { deps, open } = fixture();
    deps.createTicket.mockResolvedValue({ ticket: { id: TICKET, displayRef: "FY-0192F3C4" }, created: false });
    const result = await open(form(VALID));
    expect(result.openedOutcome).toBe("replayed");
    expect(deps.emailOwner).not.toHaveBeenCalled();
    expect(deps.recordAction).not.toHaveBeenCalled();
  });

  it("shows a known refusal as a message, and reports anything unexpected", async () => {
    const { deps, open } = fixture();
    deps.createTicket.mockRejectedValue(new SupportQueryError("not_found", "This business has no owner to open a request for."));
    expect(await open(form(VALID))).toEqual({ kind: "invalid", message: "This business has no owner to open a request for." });
    deps.createTicket.mockRejectedValue(new Error("connection lost"));
    const failed = await open(form(VALID));
    expect(failed.kind).toBe("error");
    expect(failed.reference).toBe("issue-1");
    expect(deps.reportUnexpected).toHaveBeenCalledTimes(1);
  });
});
